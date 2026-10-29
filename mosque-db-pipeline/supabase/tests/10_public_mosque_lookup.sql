-- Proves the Step 8 public lookup (0009):
--   (a) anon can call nearby_verified_mosques(), and it returns only
--       verified, unmerged records with coordinates, nearest first, within
--       the radius
--   (b) anon still cannot read mosque_records directly
--   (c) invalid coordinates / radius / limit are rejected
--   (d) anon and authenticated cannot call link_google_place_ids()
--   (e) service_role can link; it never overwrites an existing mapping,
--       never maps one Place ID to two records, and skips unverified rows
\set ON_ERROR_STOP on

-- Fixture: pick a verified, unmerged record with coordinates as the search
-- centre, and make one unverified record sit right next to it (it must
-- never be returned).
select id as centre_id, latitude as centre_lat, longitude as centre_lng
from public.mosque_records
where verification_status = 'verified' and merged_into_id is null and latitude is not null
order by id limit 1 \gset

select id as unverified_id from public.mosque_records
where verification_status <> 'verified' order by id limit 1 \gset

update public.mosque_records
set latitude = :centre_lat + 0.0001, longitude = :centre_lng
where id = :'unverified_id';

select set_config('test.centre_id', :'centre_id', false);
select set_config('test.unverified_id', :'unverified_id', false);
select set_config('test.centre_lat', :'centre_lat', false);
select set_config('test.centre_lng', :'centre_lng', false);

-- (a) + (b) as anon
begin;
set local role anon;
do $$
declare
  v_lat double precision := current_setting('test.centre_lat')::double precision;
  v_lng double precision := current_setting('test.centre_lng')::double precision;
  v_first text;
  v_count int;
  v_bad int;
  v_unsorted int;
begin
  select id into v_first from public.nearby_verified_mosques(v_lat, v_lng, 5000, 20) limit 1;
  if v_first is distinct from current_setting('test.centre_id') then
    raise exception 'FAIL (a): expected % first, got %', current_setting('test.centre_id'), v_first;
  end if;

  select count(*) into v_count from public.nearby_verified_mosques(v_lat, v_lng, 5000, 20);
  if v_count < 1 or v_count > 20 then
    raise exception 'FAIL (a): unexpected result count %', v_count;
  end if;

  select count(*) into v_bad from public.nearby_verified_mosques(v_lat, v_lng, 5000, 20)
  where id = current_setting('test.unverified_id') or distance_m > 5000;
  if v_bad <> 0 then
    raise exception 'FAIL (a): returned an unverified record or one outside the radius';
  end if;

  select count(*) into v_unsorted from (
    select distance_m, lag(distance_m) over () as prev
    from public.nearby_verified_mosques(v_lat, v_lng, 5000, 20)
  ) s where s.prev > s.distance_m;
  if v_unsorted <> 0 then
    raise exception 'FAIL (a): results not sorted by distance';
  end if;

  begin
    perform 1 from public.mosque_records limit 1;
    raise exception 'FAIL (b): anon read mosque_records directly';
  exception when insufficient_privilege then
    null;
  end;

  raise notice 'PASS (a)(b): anon lookup returns % verified records nearest-first; table stays private', v_count;
end $$;
commit;

-- (c) invalid input
do $$
begin
  begin
    perform public.nearby_verified_mosques(91, 79.8, 5000, 20);
    raise exception 'FAIL (c): latitude 91 accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.nearby_verified_mosques(6.9, 79.8, 50, 20);
    raise exception 'FAIL (c): radius 50 accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.nearby_verified_mosques(6.9, 79.8, 100000, 20);
    raise exception 'FAIL (c): radius 100000 accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.nearby_verified_mosques(6.9, 79.8, 5000, 500);
    raise exception 'FAIL (c): limit 500 accepted';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'PASS (c): invalid coordinates/radius/limit rejected';
end $$;

-- (d) anon and authenticated cannot write mappings
do $$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    execute format('set local role %I', v_role);
    begin
      perform public.link_google_place_ids('[{"mosque_id":"x","google_place_id":"y"}]'::jsonb);
      raise exception 'FAIL (d): % could call link_google_place_ids', v_role;
    exception when insufficient_privilege then null;
    end;
    reset role;
  end loop;
  raise notice 'PASS (d): anon/authenticated cannot call link_google_place_ids';
end $$;

-- (e) service_role linking rules
select id as second_id from public.mosque_records
where verification_status = 'verified' and merged_into_id is null and id <> :'centre_id'
order by id limit 1 \gset
select set_config('test.second_id', :'second_id', false);

begin;
set local role service_role;
do $$
declare
  v_centre text := current_setting('test.centre_id');
  v_second text := current_setting('test.second_id');
  v_unverified text := current_setting('test.unverified_id');
  v_outcome text;
begin
  select outcome into v_outcome from public.link_google_place_ids(
    jsonb_build_array(jsonb_build_object('mosque_id', v_centre, 'google_place_id', 'TEST_PLACE_A')));
  if v_outcome <> 'linked' then raise exception 'FAIL (e): first link got %', v_outcome; end if;

  select outcome into v_outcome from public.link_google_place_ids(
    jsonb_build_array(jsonb_build_object('mosque_id', v_centre, 'google_place_id', 'TEST_PLACE_A')));
  if v_outcome <> 'already_linked' then raise exception 'FAIL (e): repeat link got %', v_outcome; end if;

  select outcome into v_outcome from public.link_google_place_ids(
    jsonb_build_array(jsonb_build_object('mosque_id', v_centre, 'google_place_id', 'TEST_PLACE_B')));
  if v_outcome <> 'conflict' then raise exception 'FAIL (e): overwrite attempt got %', v_outcome; end if;

  select outcome into v_outcome from public.link_google_place_ids(
    jsonb_build_array(jsonb_build_object('mosque_id', v_second, 'google_place_id', 'TEST_PLACE_A')));
  if v_outcome <> 'place_id_in_use' then raise exception 'FAIL (e): duplicate Place ID got %', v_outcome; end if;

  select outcome into v_outcome from public.link_google_place_ids(
    jsonb_build_array(jsonb_build_object('mosque_id', v_unverified, 'google_place_id', 'TEST_PLACE_C')));
  if v_outcome <> 'not_eligible' then raise exception 'FAIL (e): unverified record got %', v_outcome; end if;
end $$;

-- Verify the resulting rows as the table owner (the local harness's
-- service_role stand-in has no table grant of its own).
reset role;
do $$
declare
  v_centre text := current_setting('test.centre_id');
  v_unverified text := current_setting('test.unverified_id');
begin
  if (select google_place_id from public.mosque_records where id = v_centre) <> 'TEST_PLACE_A' then
    raise exception 'FAIL (e): existing mapping was changed';
  end if;
  if (select google_place_id from public.mosque_records where id = v_unverified) is not null then
    raise exception 'FAIL (e): unverified record was linked';
  end if;

  raise notice 'PASS (e): link fills blanks only, never overwrites, never duplicates, skips unverified';
end $$;
rollback;

-- (f) a record merged into another (merged_into_id set — e.g. by test 09's
-- preserve path) is never returned, even when searching right on top of it
do $$
declare
  v_merged public.mosque_records;
begin
  select * into v_merged from public.mosque_records
  where merged_into_id is not null and latitude is not null limit 1;
  if not found then
    raise exception 'FAIL (f): fixture missing — expected a merged record with coordinates from test 09';
  end if;
  if exists (
    select 1 from public.nearby_verified_mosques(v_merged.latitude, v_merged.longitude, 100, 50)
    where id = v_merged.id
  ) then
    raise exception 'FAIL (f): merged record % was returned', v_merged.id;
  end if;
  raise notice 'PASS (f): merged record % excluded from public lookup', v_merged.id;
end $$;
