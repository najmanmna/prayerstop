-- Proves the Step 8b blocklist (0010):
--   (a) anon can ask which of a given set of Place IDs are blocked
--   (b) anon cannot read or write the blocklist table directly
--   (c) more than 20 IDs per call is rejected
\set ON_ERROR_STOP on

begin;
set local role anon;
do $$
declare
  v_blocked text[];
begin
  select array_agg(id order by id) into v_blocked
  from public.blocked_google_place_ids(array['ChIJsZi-UepR4joRANXd2Fn8OuM', 'ChIJ-not-blocked', 'ChIJ_12WBwBR4joRUr76g4K7Si8']) id;
  if v_blocked is distinct from array['ChIJ_12WBwBR4joRUr76g4K7Si8', 'ChIJsZi-UepR4joRANXd2Fn8OuM'] then
    raise exception 'FAIL (a): expected both seeded IDs back, got %', v_blocked;
  end if;

  begin
    perform 1 from public.blocked_google_places limit 1;
    raise exception 'FAIL (b): anon read the blocklist table';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.blocked_google_places (google_place_id, reason) values ('x', 'y');
    raise exception 'FAIL (b): anon wrote to the blocklist table';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.blocked_google_place_ids(array(select 'id' || g from generate_series(1, 21) g));
    raise exception 'FAIL (c): 21 ids accepted';
  exception when invalid_parameter_value then null;
  end;

  raise notice 'PASS (a)(b)(c): blocklist lookup works for anon; table private; input bounded';
end $$;
commit;
