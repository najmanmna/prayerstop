-- Proves: reviewers cannot read other reviewers' identities or private
-- assignment data (their claimed/completed review_tasks, or their
-- review_decisions) — enforced at the database level via RLS, not merely
-- omitted by a frontend query.
\set ON_ERROR_STOP on
\set REVIEWER_A '11111111-1111-4111-8111-111111111111'
\set REVIEWER_B '22222222-2222-4222-8222-222222222222'

-- Give Reviewer B a real claimed task and a real decision, as "private
-- data belonging to B" for A to try (and fail) to read.
select id as b_task from public.review_tasks where status = 'unclaimed' limit 1 \gset
select set_config('test.b_task', :'b_task', false);

begin;
set local role authenticated;
select test.login(:'REVIEWER_B'::uuid);
select public.claim_review_task(current_setting('test.b_task')::uuid);
select public.log_review_note(current_setting('test.b_task')::uuid, 'invalid', null, 'reviewer B private note');
commit;

-- Now act as Reviewer A and probe for B's data.
begin;
set local role authenticated;
select test.login(:'REVIEWER_A'::uuid);

do $$
declare
  v_reviewer_b uuid := '22222222-2222-4222-8222-222222222222';
  v_count int;
begin
  -- 1. Cannot see reviewer B's profile/identity at all.
  select count(*) into v_count from public.reviewers where id = v_reviewer_b;
  if v_count <> 0 then
    raise exception 'FAIL: reviewer A could see reviewer B''s profile row (count=%)', v_count;
  end if;
  raise notice 'PASS: reviewer A cannot see reviewer B''s reviewer profile';

  -- 2. Cannot see reviewer B's claimed task via a direct id lookup...
  select count(*) into v_count from public.review_tasks where id = current_setting('test.b_task')::uuid;
  if v_count <> 0 then
    raise exception 'FAIL: reviewer A could see reviewer B''s claimed task row (count=%)', v_count;
  end if;
  raise notice 'PASS: reviewer A cannot see reviewer B''s claimed task (not even that it exists)';

  -- 3. ...nor by filtering on B's id generally (there could be several).
  select count(*) into v_count from public.review_tasks where assigned_reviewer_id = v_reviewer_b;
  if v_count <> 0 then
    raise exception 'FAIL: reviewer A could enumerate reviewer B''s assigned tasks (count=%)', v_count;
  end if;
  raise notice 'PASS: reviewer A cannot enumerate any of reviewer B''s assigned tasks';

  -- 4. Cannot see reviewer B's review_decisions (the private note logged above).
  select count(*) into v_count from public.review_decisions where reviewer_id = v_reviewer_b;
  if v_count <> 0 then
    raise exception 'FAIL: reviewer A could see reviewer B''s review_decisions (count=%)', v_count;
  end if;
  raise notice 'PASS: reviewer A cannot see any of reviewer B''s review_decisions';

  -- 5. Sanity check the RLS is scoped, not a blanket lockout: A can see
  -- their own (empty, so far, in this test) decisions/tasks query fine —
  -- no error, no exception, just correctly filtered.
  perform 1 from public.review_tasks where assigned_reviewer_id = (select auth.uid());
  raise notice 'PASS (sanity): reviewer A''s own-scoped query runs without error';
end $$;
commit;
