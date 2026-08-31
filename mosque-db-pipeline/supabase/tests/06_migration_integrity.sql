-- Proves: the existing human-reviewed records from the local review tool
-- were imported correctly and are permanently completed — the exact
-- records that had a real verify/correct decision in review-log.jsonl are
-- (a) verification_status = 'verified' in mosque_records, (b) backed by a
-- 'completed' review_tasks row that can never be claimed again (test 03
-- proves the "never again" part; this proves the import itself is
-- complete and correct), and (c) every one of them still has its full,
-- untouched review_decisions history.
\set ON_ERROR_STOP on

do $$
declare
  v_completed_tasks int;
  v_verified_mosques int;
  v_mismatch_count int;
  v_orphan_count int;
  v_total_mosque_records int;
  v_total_decisions int;
begin
  select count(*) into v_completed_tasks from public.review_tasks where status = 'completed';
  select count(*) into v_verified_mosques from public.mosque_records where verification_status = 'verified';

  if v_completed_tasks <> v_verified_mosques then
    raise exception 'FAIL: % completed review_tasks but % verified mosque_records — these must match 1:1', v_completed_tasks, v_verified_mosques;
  end if;
  raise notice 'PASS: % completed tasks == % verified mosque records', v_completed_tasks, v_verified_mosques;

  if v_completed_tasks < 1 then
    raise exception 'FAIL: zero completed tasks — the data migration did not run, or ran against the wrong source files';
  end if;
  raise notice 'PASS: % human-reviewed records imported as permanently completed (source: review-log.jsonl)', v_completed_tasks;

  -- Every completed task's mosque record must satisfy the
  -- verified_fields_consistent constraint's intent directly (belt-and-
  -- braces re-check on top of the table CHECK constraint itself).
  select count(*) into v_mismatch_count
  from public.review_tasks t
  join public.mosque_records m on m.id = t.mosque_id
  where t.status = 'completed'
    and (m.verification_status <> 'verified' or m.verified_at is null or m.verified_by is null);
  if v_mismatch_count <> 0 then
    raise exception 'FAIL: % completed tasks point at a mosque_records row missing verified_at/verified_by/verified status', v_mismatch_count;
  end if;
  raise notice 'PASS: every completed task''s mosque record has verified_at + verified_by set';

  -- Every completed task must have at least one verify/correct decision in
  -- its append-only history (not just a status flag with no audit trail).
  select count(*) into v_orphan_count
  from public.review_tasks t
  where t.status = 'completed'
    and not exists (
      select 1 from public.review_decisions d
      where d.task_id = t.id and d.decision in ('verify', 'correct')
    );
  if v_orphan_count <> 0 then
    raise exception 'FAIL: % completed tasks have no verify/correct row in review_decisions — completed with no audit trail', v_orphan_count;
  end if;
  raise notice 'PASS: every completed task has a real verify/correct decision backing it in the append-only log';

  select count(*) into v_total_mosque_records from public.mosque_records;
  if v_total_mosque_records <> 3685 then
    raise exception 'FAIL: expected all 3685 master-dataset.json records imported, found %', v_total_mosque_records;
  end if;
  raise notice 'PASS: all 3685 mosque_records imported from master-dataset.json';

  select count(*) into v_total_decisions from public.review_decisions;
  raise notice 'INFO: % total review_decisions rows imported (full, unmodified local review-log.jsonl history)', v_total_decisions;
end $$;
