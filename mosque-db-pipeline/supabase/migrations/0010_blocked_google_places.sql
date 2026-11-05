-- =============================================================================
-- Step 8b — blocklist for Google Places results that aren't mosques.
-- =============================================================================
-- Google Places sometimes labels non-mosques with primary type "mosque"
-- (user-edited listings — verified 2026-10-29: "Veesoft IT PVT (Ltd)" and
-- "Rajarishi bawana maddayas thanaya" both come back with
-- primaryType=mosque). No type filter can catch that, so the app drops any
-- Google result whose Place ID is listed here.
--
-- Only Google Place IDs are stored — the one Google value Google's Places
-- policy permits storing indefinitely (see 0009's header).
--
-- Additive only: one new table, one function, two seed rows.
--
-- Who can do what:
--   anon / authenticated — no table access at all. May call
--     blocked_google_place_ids() with at most 20 IDs, which only answers
--     "which of THESE are blocked" — it can't enumerate the list.
--   admins — add/remove rows via the Supabase dashboard (Table Editor or
--     SQL editor, which bypass RLS). No client write path exists.
-- =============================================================================

create table public.blocked_google_places (
  google_place_id text primary key check (length(google_place_id) between 1 and 300),
  reason text not null check (length(reason) > 0),
  created_at timestamptz not null default now()
);

comment on table public.blocked_google_places is
  'Google Place IDs the app must never show (non-mosques mislabelled as mosques on Google). Managed by admins in the Supabase dashboard; read by the API only via blocked_google_place_ids().';

alter table public.blocked_google_places enable row level security;
revoke all on public.blocked_google_places from anon, authenticated;

create or replace function public.blocked_google_place_ids(p_ids text[])
returns setof text
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if p_ids is null then
    return;
  end if;
  if cardinality(p_ids) > 20 then
    raise exception 'at most 20 ids per call' using errcode = '22023';
  end if;
  return query
  select b.google_place_id from public.blocked_google_places b
  where b.google_place_id = any(p_ids);
end;
$$;

comment on function public.blocked_google_place_ids(text[]) is
  'Given up to 20 Google Place IDs, returns the ones on the blocklist. Callable by anon; cannot enumerate the list.';

revoke all on function public.blocked_google_place_ids(text[]) from public;
grant execute on function public.blocked_google_place_ids(text[]) to anon, authenticated, service_role;

insert into public.blocked_google_places (google_place_id, reason) values
  ('ChIJsZi-UepR4joRANXd2Fn8OuM', 'Veesoft IT PVT (Ltd) — IT company mislabelled as a mosque on Google (found 2026-10-29, Maharagama)'),
  ('ChIJ_12WBwBR4joRUr76g4K7Si8', 'Rajarishi bawana maddayas thanaya — not a mosque, mislabelled on Google (found 2026-10-29, Maharagama)')
on conflict (google_place_id) do nothing;
