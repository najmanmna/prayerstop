-- Proves: only the assigned reviewer can complete a task. Reviewer A
-- claims; Reviewer B (not assigned) must be rejected when trying to
-- complete it; Reviewer A (the actual assignee) must then succeed.
--
-- Note on technique: psql's `:'var'` interpolation does not reliably reach
-- inside `do $$ ... $$` bodies, so values cross that boundary via a
-- session GUC (`set_config`/`current_setting`) instead of psql variables.
\set ON_ERROR_STOP on
\set REVIEWER_A '11111111-1111-4111-8111-111111111111'
\set REVIEWER_B '22222222-2222-4222-8222-222222222222'

select id as target_task from public.review_tasks where status = 'unclaimed' limit 1 \gset
select set_config('test.target_task', :'target_task', false);

begin;
set local role authenticated;
select test.login(:'REVIEWER_A'::uuid);
select public.claim_review_task(current_setting('test.target_task')::uuid);
commit;

do $$
begin
  if (select status from public.review_tasks where id = current_setting('test.target_task')::uuid) <> 'claimed' then
    raise exception 'FAIL: setup — task did not end up claimed';
  end if;
  raise notice 'setup ok: task % claimed by reviewer A', current_setting('test.target_task');
end $$;

-- Reviewer B (NOT assigned) attempts to complete it — must be rejected,
-- and the task must remain claimed by A afterward (no partial effect).
begin;
set local role authenticated;
select test.login(:'REVIEWER_B'::uuid);
do $$
begin
  begin
    perform public.complete_review_task(
      current_setting('test.target_task')::uuid,
      jsonb_build_object('decision', 'verify', 'changes', '[]'::jsonb)
    );
    raise exception 'FAIL: reviewer B (not assigned) was able to complete a task assigned to reviewer A';
  exception when others then
    if sqlerrm like 'FAIL:%' then
      raise;
    end if;
    raise notice 'PASS (rejection): reviewer B correctly rejected — %', sqlerrm;
  end;
end $$;
commit;

do $$
declare
  v_reviewer_a uuid := '11111111-1111-4111-8111-111111111111';
begin
  if (select status from public.review_tasks where id = current_setting('test.target_task')::uuid) <> 'claimed'
     or (select assigned_reviewer_id from public.review_tasks where id = current_setting('test.target_task')::uuid) <> v_reviewer_a
  then
    raise exception 'FAIL: task state changed after reviewer B''s rejected attempt — expected untouched (still claimed by A)';
  end if;
  raise notice 'PASS (no side effect): task is still claimed by reviewer A after B''s rejected attempt';
end $$;

-- Reviewer A (the real assignee) completes it — must succeed.
begin;
set local role authenticated;
select test.login(:'REVIEWER_A'::uuid);
select public.complete_review_task(
  current_setting('test.target_task')::uuid,
  jsonb_build_object('decision', 'verify', 'changes', '[]'::jsonb, 'note', 'test 02: completed by the actual assignee')
);
commit;

do $$
begin
  if (select status from public.review_tasks where id = current_setting('test.target_task')::uuid) <> 'completed' then
    raise exception 'FAIL: reviewer A (the real assignee) could not complete their own claimed task';
  end if;
  raise notice 'PASS (owner completes): task % is now completed by its rightful assignee', current_setting('test.target_task');
end $$;
