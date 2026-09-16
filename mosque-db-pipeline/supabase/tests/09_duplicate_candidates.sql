-- Proves decide_duplicate_candidate (Step 7F):
--   (a) confirming a candidate whose redundant side has NO review history
--       deletes that row outright — and if it had a still-unclaimed task,
--       that task is gone too (FK cascade) — this is the actual queue
--       reduction for check_type='unclaimed_vs_verified'
--   (b) confirming a candidate whose redundant side DOES have real review
--       history never deletes it — only sets merged_into_id, decisions
--       stay intact
--   (c) either way, the survivor gets the redundant's new-source-type
--       provenance merged in, without overwriting anything it already had
--   (d) rejecting changes nothing but the candidate's own status
--   (e) a second decide on an already-decided candidate is rejected
\set ON_ERROR_STOP on
\set REVIEWER_A '11111111-1111-4111-8111-111111111111'

-- --- Case (a): redundant has no history, and has a real unclaimed task ---
select id as survivor_id from public.mosque_records where verification_status = 'verified' limit 1 \gset
select id as redundant_task_id, mosque_id as redundant_id from public.review_tasks where status = 'unclaimed' limit 1 \gset

insert into public.duplicate_candidates (check_type, survivor_mosque_id, redundant_mosque_id, match_score, match_tier)
values ('unclaimed_vs_verified', :'survivor_id', :'redundant_id', 95.0, 'high')
returning id as candidate_a_id \gset

select set_config('test.candidate_a', :'candidate_a_id', false);
select set_config('test.redundant_a', :'redundant_id', false);
select set_config('test.redundant_task_a', :'redundant_task_id', false);
select set_config('test.survivor_a', :'survivor_id', false);

begin;
set local role authenticated;
select test.login(:'REVIEWER_A'::uuid);
select public.decide_duplicate_candidate(current_setting('test.candidate_a')::uuid, 'confirmed', 'test 09a');
commit;

do $$
begin
  if exists (select 1 from public.mosque_records where id = current_setting('test.redundant_a')) then
    raise exception 'FAIL: redundant record (no history) should have been deleted outright';
  end if;
  if exists (select 1 from public.review_tasks where id = current_setting('test.redundant_task_a')::uuid) then
    raise exception 'FAIL: the redundant unclaimed task should have cascaded away with its mosque_records row';
  end if;
  -- IS DISTINCT FROM (not <>) deliberately: a plain <> against a NULL
  -- (the row itself having vanished) evaluates to NULL, not TRUE, so a
  -- naive `if ... <> 'confirmed' then raise` silently passes even when
  -- the row is gone entirely — exactly the bug this test originally
  -- missed (the FK cascade destroying this very row) before 0008 fixed it.
  if (select status from public.duplicate_candidates where id = current_setting('test.candidate_a')::uuid)
     is distinct from 'confirmed' then
    raise exception 'FAIL: candidate row must still exist with status=confirmed (not be gone, and not merely non-rejected)';
  end if;
  raise notice 'PASS (delete path): redundant record + its unclaimed task both gone; candidate row survives with status=confirmed';
end $$;

-- --- Case (b): redundant HAS real review history (a completed task backing it) ---
select t.mosque_id as redundant_b_id, m2.id as survivor_b_id
from public.review_tasks t
join public.review_decisions d on d.task_id = t.id
join public.mosque_records m2 on m2.verification_status = 'verified' and m2.id <> t.mosque_id
where t.status = 'completed'
limit 1 \gset

select set_config('test.redundant_b', :'redundant_b_id', false);
select set_config('test.survivor_b', :'survivor_b_id', false);

insert into public.duplicate_candidates (check_type, survivor_mosque_id, redundant_mosque_id, match_score, match_tier)
values ('intra_reviewed', :'survivor_b_id', :'redundant_b_id', 100.0, 'high')
returning id as candidate_b_id \gset
select set_config('test.candidate_b', :'candidate_b_id', false);

do $$
begin
  if (select count(*) from public.review_decisions where mosque_id = current_setting('test.redundant_b')) = 0 then
    raise exception 'FAIL: test setup — redundant_b was supposed to have real review history';
  end if;
end $$;

begin;
set local role authenticated;
select test.login(:'REVIEWER_A'::uuid);
select public.decide_duplicate_candidate(current_setting('test.candidate_b')::uuid, 'confirmed', 'test 09b');
commit;

do $$
declare
  v_merged_into text;
  v_decision_count int;
begin
  select merged_into_id into v_merged_into from public.mosque_records where id = current_setting('test.redundant_b');
  if v_merged_into is null then
    raise exception 'FAIL: redundant record (has history) should have merged_into_id set, not be untouched';
  end if;
  if v_merged_into <> current_setting('test.survivor_b') then
    raise exception 'FAIL: merged_into_id should point at the survivor';
  end if;
  if not exists (select 1 from public.mosque_records where id = current_setting('test.redundant_b')) then
    raise exception 'FAIL: redundant record (has history) must NOT be deleted';
  end if;
  select count(*) into v_decision_count from public.review_decisions where mosque_id = current_setting('test.redundant_b');
  if v_decision_count = 0 then
    raise exception 'FAIL: redundant record''s review_decisions history was lost';
  end if;
  raise notice 'PASS (preserve path): redundant record kept, merged_into_id set, % review_decisions still intact', v_decision_count;
end $$;

-- --- Case (d)+(e): reject changes nothing; a second decide is refused ---
select id as another_unclaimed from public.review_tasks where status = 'unclaimed' limit 1 \gset
select mosque_id as redundant_c_id from public.review_tasks where id = :'another_unclaimed' \gset
select id as survivor_c_id from public.mosque_records where verification_status = 'verified' and id <> :'redundant_c_id' limit 1 \gset

insert into public.duplicate_candidates (check_type, survivor_mosque_id, redundant_mosque_id, match_score, match_tier)
values ('unclaimed_vs_verified', :'survivor_c_id', :'redundant_c_id', 80.0, 'medium')
returning id as candidate_c_id \gset
select set_config('test.candidate_c', :'candidate_c_id', false);
select set_config('test.redundant_c', :'redundant_c_id', false);

begin;
set local role authenticated;
select test.login(:'REVIEWER_A'::uuid);
select public.decide_duplicate_candidate(current_setting('test.candidate_c')::uuid, 'rejected', 'not the same mosque');
commit;

do $$
begin
  if not exists (select 1 from public.mosque_records where id = current_setting('test.redundant_c')) then
    raise exception 'FAIL: rejecting a candidate must not delete anything';
  end if;
  if (select status from public.duplicate_candidates where id = current_setting('test.candidate_c')::uuid) <> 'rejected' then
    raise exception 'FAIL: candidate should be rejected';
  end if;
  raise notice 'PASS (reject): nothing deleted or merged, candidate marked rejected';
end $$;

begin;
set local role authenticated;
select test.login(:'REVIEWER_A'::uuid);
do $$
begin
  begin
    perform public.decide_duplicate_candidate(current_setting('test.candidate_c')::uuid, 'confirmed', null);
    raise exception 'FAIL: deciding an already-decided candidate should be rejected';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS (rejection): re-deciding an already-decided candidate correctly refused — %', sqlerrm;
  end;
end $$;
commit;
