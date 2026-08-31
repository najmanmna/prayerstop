-- Proves: admin_correct_mosque_task (Step 7D) —
--   (a) a non-admin is rejected even on a completed task they don't own
--   (b) an admin can correct an already-completed task's mosque_records data
--   (c) the correction never touches review_tasks (status/assigned_reviewer_id/
--       completed_at all stay exactly as the original reviewer left them)
--   (d) the correction is fully auditable: a new review_decisions row exists
--       whose reviewer_id is the admin, distinct from the task's own
--       assigned_reviewer_id
--   (e) it refuses to "correct" a task that isn't completed yet
\set ON_ERROR_STOP on
\set REVIEWER_A '11111111-1111-4111-8111-111111111111'
\set REVIEWER_B '22222222-2222-4222-8222-222222222222'
\set ADMIN_ID '00000000-0000-4000-8000-000000000001'

select id as target_task, mosque_id as target_mosque from public.review_tasks where status = 'unclaimed' limit 1 \gset
select set_config('test.target_task', :'target_task', false);
select set_config('test.target_mosque', :'target_mosque', false);

-- Reviewer A claims and completes it for real — a genuine completed task.
begin;
set local role authenticated;
select test.login(:'REVIEWER_A'::uuid);
select public.claim_review_task(current_setting('test.target_task')::uuid);
select public.complete_review_task(
  current_setting('test.target_task')::uuid,
  jsonb_build_object('decision', 'correct', 'changes', jsonb_build_array(jsonb_build_object('field', 'name', 'newValue', 'Test 08 Original Name')), 'note', 'test 08 setup')
);
commit;

do $$
declare
  v_completed_at timestamptz;
begin
  select completed_at into v_completed_at from public.review_tasks where id = current_setting('test.target_task')::uuid;
  if (select status from public.review_tasks where id = current_setting('test.target_task')::uuid) <> 'completed' then
    raise exception 'FAIL: setup — task did not end up completed';
  end if;
  perform set_config('test.completed_at_before', v_completed_at::text, false);
  raise notice 'setup ok: task % completed by reviewer A', current_setting('test.target_task');
end $$;

-- (a) Reviewer B is a plain reviewer, not admin — must be rejected.
begin;
set local role authenticated;
select test.login(:'REVIEWER_B'::uuid);
do $$
begin
  begin
    perform public.admin_correct_mosque_task(
      current_setting('test.target_task')::uuid,
      jsonb_build_object('decision', 'correct', 'changes', jsonb_build_array(jsonb_build_object('field', 'name', 'newValue', 'Should Not Apply')))
    );
    raise exception 'FAIL: a non-admin reviewer was able to call admin_correct_mosque_task';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS (rejection): non-admin correctly rejected — %', sqlerrm;
  end;
end $$;
commit;

do $$
begin
  if (select name from public.mosque_records where id = current_setting('test.target_mosque')) <> 'Test 08 Original Name' then
    raise exception 'FAIL: non-admin''s rejected attempt still changed mosque_records — expected no side effect';
  end if;
  raise notice 'PASS (no side effect): mosque_records untouched after non-admin''s rejected attempt';
end $$;

-- (b)+(c)+(d) The real admin corrects it — must succeed, must leave
-- review_tasks untouched, must produce a new decision row attributed to the
-- admin while the task's own assignment still shows reviewer A.
begin;
set local role authenticated;
select test.login(:'ADMIN_ID'::uuid);
select public.admin_correct_mosque_task(
  current_setting('test.target_task')::uuid,
  jsonb_build_object('decision', 'correct', 'changes', jsonb_build_array(jsonb_build_object('field', 'name', 'newValue', 'Test 08 Admin-Corrected Name')), 'note', 'test 08: admin correction')
);
commit;

do $$
declare
  v_reviewer_a uuid := '11111111-1111-4111-8111-111111111111';
  v_admin uuid := '00000000-0000-4000-8000-000000000001';
  v_task public.review_tasks;
  v_decision_count int;
begin
  select * into v_task from public.review_tasks where id = current_setting('test.target_task')::uuid;

  if v_task.status <> 'completed' or v_task.assigned_reviewer_id <> v_reviewer_a then
    raise exception 'FAIL: admin correction changed review_tasks assignment/status — expected untouched (still completed, still reviewer A)';
  end if;
  if v_task.completed_at::text <> current_setting('test.completed_at_before') then
    raise exception 'FAIL: admin correction changed completed_at — expected untouched';
  end if;
  raise notice 'PASS (review_tasks untouched): still completed, still assigned to reviewer A, completed_at unchanged';

  if (select name from public.mosque_records where id = current_setting('test.target_mosque')) <> 'Test 08 Admin-Corrected Name' then
    raise exception 'FAIL: admin correction did not apply to mosque_records';
  end if;
  raise notice 'PASS (correction applied): mosque_records.name updated by the admin';

  select count(*) into v_decision_count
  from public.review_decisions
  where task_id = current_setting('test.target_task')::uuid and reviewer_id = v_admin;
  if v_decision_count <> 1 then
    raise exception 'FAIL: expected exactly one review_decisions row attributed to the admin, found %', v_decision_count;
  end if;
  raise notice 'PASS (audit trail): a new review_decisions row exists with reviewer_id = admin, task still assigned_reviewer_id = reviewer A';
end $$;

-- (e) admin_correct_mosque_task refuses a task that isn't completed yet.
select id as other_task from public.review_tasks where status = 'unclaimed' limit 1 \gset
select set_config('test.other_task', :'other_task', false);

begin;
set local role authenticated;
select test.login(:'ADMIN_ID'::uuid);
do $$
begin
  begin
    perform public.admin_correct_mosque_task(
      current_setting('test.other_task')::uuid,
      jsonb_build_object('decision', 'correct', 'changes', '[]'::jsonb)
    );
    raise exception 'FAIL: admin_correct_mosque_task succeeded on a non-completed task';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS (rejection): admin_correct_mosque_task correctly refused a non-completed task — %', sqlerrm;
  end;
end $$;
commit;
