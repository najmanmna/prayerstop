-- =============================================================================
-- Step 8 — public, read-only nearby lookup for the PrayerStop app, plus
-- opportunistic Google Place ID mapping.
-- =============================================================================
-- Additive only: one nullable column, two indexes, two functions. No existing
-- row, policy, grant, or function is modified or dropped.
--
-- Who can do what after this migration:
--   anon / authenticated — may call nearby_verified_mosques() and nothing
--     new besides. It returns only verified, unmerged records and only the
--     public columns the app needs (no reviewer ids, notes, sources, or
--     review state). There is still NO table-level grant to anon: the
--     mosque_records/review_* tables stay exactly as private as 0002 left
--     them; this function is the entire public read surface.
--   service_role (server only) — may call link_google_place_ids(). Never
--     granted to anon/authenticated: a mobile client must not be able to
--     write mappings, or anyone could attach arbitrary Place IDs to mosques.
--
-- Google policy (verified 2026-10-29 against
-- developers.google.com/maps/documentation/places/web-service/policies and
-- .../place-id): Place IDs are exempt from the Maps Platform caching
-- restrictions and may be stored indefinitely; no other Places content may
-- be stored. So google_place_id is the ONLY Google-derived value this
-- schema holds — never a Google name, address, coordinate, or photo.
-- =============================================================================

alter table public.mosque_records
  add column google_place_id text;

comment on column public.mosque_records.google_place_id is
  'Google Place ID for the same building, populated only by link_google_place_ids() from a confident, unambiguous match (server-side, from an existing Google Places fallback response — never a dedicated lookup). Nullable: most records have none. The only Google-derived value stored anywhere in this schema.';

-- One Place ID can describe at most one mosque record. Also what makes
-- "never map the same Place ID to two records" a database guarantee rather
-- than an application convention.
create unique index mosque_records_google_place_id_key
  on public.mosque_records (google_place_id)
  where google_place_id is not null;

-- Bounding-box prefilter for the nearby lookup. Partial on exactly the rows
-- the public function can ever return, so it stays small (hundreds of rows,
-- not thousands) and the planner can use it for the lat/lng range scan.
create index mosque_records_public_lookup_idx
  on public.mosque_records (latitude, longitude)
  where verification_status = 'verified'
    and merged_into_id is null
    and latitude is not null
    and longitude is not null;

-- -----------------------------------------------------------------------------
-- nearby_verified_mosques — the public read path.
-- -----------------------------------------------------------------------------
-- Bounds are enforced here too, not only in the API route: this function is
-- callable directly over PostgREST with the publishable key, so it must not
-- trust its caller. Limits mirror lib/prayer-places/nearby-search-config.ts.
create or replace function public.nearby_verified_mosques(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_m integer,
  p_limit integer default 20
)
returns table (
  id text,
  name text,
  address text,
  district text,
  latitude double precision,
  longitude double precision,
  google_place_id text,
  distance_m double precision
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_lat_delta double precision;
  v_lng_delta double precision;
begin
  if p_latitude is null or p_longitude is null
     or p_latitude < -90 or p_latitude > 90
     or p_longitude < -180 or p_longitude > 180 then
    raise exception 'invalid coordinates' using errcode = '22023';
  end if;
  if p_radius_m is null or p_radius_m < 100 or p_radius_m > 20000 then
    raise exception 'radius must be between 100 and 20000 metres' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'limit must be between 1 and 50' using errcode = '22023';
  end if;

  -- Degrees per metre: latitude is constant; longitude widens with
  -- latitude. Slightly generous box, then the exact haversine filter below.
  v_lat_delta := p_radius_m / 111320.0;
  v_lng_delta := p_radius_m / (111320.0 * greatest(cos(radians(p_latitude)), 0.01));

  return query
  select * from (
    select
      m.id,
      m.name,
      m.address,
      m.district,
      m.latitude,
      m.longitude,
      m.google_place_id,
      2 * 6371000 * asin(sqrt(
        power(sin(radians(m.latitude - p_latitude) / 2), 2)
        + cos(radians(p_latitude)) * cos(radians(m.latitude))
          * power(sin(radians(m.longitude - p_longitude) / 2), 2)
      )) as distance_m
    from public.mosque_records m
    where m.verification_status = 'verified'
      and m.merged_into_id is null
      and m.latitude is not null
      and m.longitude is not null
      and m.latitude between p_latitude - v_lat_delta and p_latitude + v_lat_delta
      and m.longitude between p_longitude - v_lng_delta and p_longitude + v_lng_delta
  ) nearby
  where nearby.distance_m <= p_radius_m
  order by nearby.distance_m, nearby.id
  limit p_limit;
end;
$$;

comment on function public.nearby_verified_mosques(double precision, double precision, integer, integer) is
  'Public read path for the PrayerStop app: verified, unmerged mosques within p_radius_m of a point, nearest first. Returns public columns only. Callable by anon via PostgREST; validates its own bounds.';

-- Postgres grants EXECUTE to PUBLIC by default, and Supabase additionally
-- grants it to anon/authenticated/service_role via default privileges —
-- so be explicit both ways.
revoke all on function public.nearby_verified_mosques(double precision, double precision, integer, integer) from public;
grant execute on function public.nearby_verified_mosques(double precision, double precision, integer, integer)
  to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- link_google_place_ids — server-only, fill-blank-only mapping writes.
-- -----------------------------------------------------------------------------
-- p_links: [{"mosque_id": "nsdi-18469", "google_place_id": "ChIJ..."}, ...]
-- The API route only proposes links it already judged confident and
-- unambiguous (lib/prayer-places/merge-nearby-places.ts); this function is
-- the second, independent guard. A link is applied only if ALL hold:
--   - the mosque exists, is verified, and is not merged into another record
--   - the mosque has no google_place_id yet (never overwrites a mapping —
--     an existing, different mapping is reported as 'conflict', not changed)
--   - no OTHER mosque already holds that Place ID
-- Returns one row per input link with what happened, for logging.
create or replace function public.link_google_place_ids(p_links jsonb)
returns table (mosque_id text, google_place_id text, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link jsonb;
  v_mosque_id text;
  v_place_id text;
  v_existing public.mosque_records;
begin
  if p_links is null or jsonb_typeof(p_links) <> 'array' then
    raise exception 'p_links must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_links) > 20 then
    raise exception 'at most 20 links per call' using errcode = '22023';
  end if;

  for v_link in select * from jsonb_array_elements(p_links)
  loop
    v_mosque_id := v_link ->> 'mosque_id';
    v_place_id := v_link ->> 'google_place_id';
    mosque_id := v_mosque_id;
    google_place_id := v_place_id;

    if v_mosque_id is null or v_place_id is null
       or length(v_place_id) = 0 or length(v_place_id) > 300 then
      outcome := 'invalid';
      return next;
      continue;
    end if;

    select * into v_existing from public.mosque_records r where r.id = v_mosque_id for update;

    if not found or v_existing.verification_status <> 'verified' or v_existing.merged_into_id is not null then
      outcome := 'not_eligible';
    elsif v_existing.google_place_id = v_place_id then
      outcome := 'already_linked';
    elsif v_existing.google_place_id is not null then
      outcome := 'conflict';
    elsif exists (
      select 1 from public.mosque_records r
      where r.google_place_id = v_place_id and r.id <> v_mosque_id
    ) then
      outcome := 'place_id_in_use';
    else
      begin
        update public.mosque_records r
        set google_place_id = v_place_id
        where r.id = v_mosque_id and r.google_place_id is null;
        outcome := 'linked';
      exception when unique_violation then
        -- Lost a race with a concurrent request linking the same Place ID
        -- to a different mosque — the unique index is the final arbiter.
        outcome := 'place_id_in_use';
      end;
    end if;
    return next;
  end loop;
end;
$$;

comment on function public.link_google_place_ids(jsonb) is
  'Server-only (service_role). Fills mosque_records.google_place_id from confident Google Places fallback matches. Never overwrites an existing mapping, never maps one Place ID to two records, never touches unverified or merged records.';

revoke all on function public.link_google_place_ids(jsonb) from public, anon, authenticated;
grant execute on function public.link_google_place_ids(jsonb) to service_role;
