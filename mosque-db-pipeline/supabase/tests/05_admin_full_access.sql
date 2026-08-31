-- Proves: admins can see everything — every reviewer's profile, every
-- review_task regardless of assignment, and every review_decisions row —
-- unlike an ordinary reviewer (test 04).
--
-- Note on technique: psql's `:var` interpolation does not reach inside
-- `do $$ ... $$` bodies (dollar-quoting is deliberately opaque to it), so
-- values cross that boundary via session GUCs, not psql variables.
\set ON_ERROR_STOP on
\set ADMIN_ID '00000000-0000-4000-8000-000000000001'

-- Ground truth, read as the unrestricted superuser connection (bypasses
-- RLS by virtue of being the table owner) — what the admin's RLS-scoped
-- view must exactly match.
select set_config('test.expected_reviewers', (select count(*) from public.reviewers)::text, false);
select set_config('test.expected_tasks', (select count(*) from public.review_tasks)::text, false);
select set_config('test.expected_decisions', (select count(*) from public.review_decisions)::text, false);

do $$
begin
  if not exists (select 1 from public.reviewers where id = '00000000-0000-4000-8000-000000000001'::uuid and role = 'admin') then
    raise exception 'FAIL: setup — the migrated reviewer is not role=admin as expected';
  end if;
end $$;

begin;
set local role authenticated;
select test.login(:'ADMIN_ID'::uuid);

do $$
declare
  v_reviewer_count int;
  v_task_count int;
  v_decision_count int;
begin
  select count(*) into v_reviewer_count from public.reviewers;
  select count(*) into v_task_count from public.review_tasks;
  select count(*) into v_decision_count from public.review_decisions;

  if v_reviewer_count <> current_setting('test.expected_reviewers')::int then
    raise exception 'FAIL: admin sees % reviewer profiles, expected all % (identities hidden from admin)', v_reviewer_count, current_setting('test.expected_reviewers');
  end if;
  raise notice 'PASS: admin sees all % reviewer profiles (including other reviewers'' identities)', v_reviewer_count;

  if v_task_count <> current_setting('test.expected_tasks')::int then
    raise exception 'FAIL: admin sees % review_tasks, expected all %', v_task_count, current_setting('test.expected_tasks');
  end if;
  raise notice 'PASS: admin sees all % review_tasks regardless of assignment', v_task_count;

  if v_decision_count <> current_setting('test.expected_decisions')::int then
    raise exception 'FAIL: admin sees % review_decisions, expected all %', v_decision_count, current_setting('test.expected_decisions');
  end if;
  raise notice 'PASS: admin sees all % review_decisions across every reviewer', v_decision_count;

  -- Specifically: the admin CAN see reviewer B's identity and tasks — the
  -- exact things test 04 proved reviewer A cannot see.
  if not exists (select 1 from public.reviewers where id = '22222222-2222-4222-8222-222222222222'::uuid) then
    raise exception 'FAIL: admin cannot see reviewer B''s profile specifically';
  end if;
  raise notice 'PASS: admin can specifically see reviewer B''s profile (which reviewer A, in test 04, could not)';
end $$;
commit;
