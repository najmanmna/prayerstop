-- Proves: completed tasks cannot be reassigned/reclaimed by anyone,
-- including the reviewer who originally completed it. Uses one of the 58
-- real, already-completed tasks imported from the local review history —
-- self-contained, doesn't depend on any other test file having run first.
\set ON_ERROR_STOP on
\set REVIEWER_A '11111111-1111-4111-8111-111111111111'

select id as target_task, assigned_reviewer_id as original_reviewer
from public.review_tasks where status = 'completed' limit 1 \gset

select set_config('test.target_task', :'target_task', false);
select set_config('test.original_reviewer', :'original_reviewer', false);

do $$
begin
  if current_setting('test.target_task', true) is null then
    raise exception 'FAIL: no completed task found to test against — did the data migration run?';
  end if;
end $$;

-- Attempt 1: a reviewer who was NEVER involved (Reviewer B) tries to claim it.
begin;
set local role authenticated;
select test.login('22222222-2222-4222-8222-222222222222'::uuid);
do $$
begin
  begin
    perform public.claim_review_task(current_setting('test.target_task')::uuid);
    raise exception 'FAIL: an uninvolved reviewer was able to claim an already-completed task';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS (uninvolved reviewer blocked): %', sqlerrm;
  end;
end $$;
commit;

-- Attempt 2: even the reviewer who ORIGINALLY completed it cannot "reclaim" it.
begin;
set local role authenticated;
select test.login(current_setting('test.original_reviewer')::uuid);
do $$
begin
  begin
    perform public.claim_review_task(current_setting('test.target_task')::uuid);
    raise exception 'FAIL: the original completing reviewer was able to re-claim their own completed task';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS (original reviewer blocked too): %', sqlerrm;
  end;
end $$;
commit;

do $$
begin
  if (select status from public.review_tasks where id = current_setting('test.target_task')::uuid) <> 'completed' then
    raise exception 'FAIL: task status changed away from completed after the reclaim attempts';
  end if;
  raise notice 'PASS: task % is still completed — reclaim attempts had zero effect', current_setting('test.target_task');
end $$;
