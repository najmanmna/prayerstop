-- =============================================================================
-- Step 7B — one new function: claim_next_review_task()
-- =============================================================================
-- Run after 0001-0003. This is the "Next mosque" button's database call —
-- the web app never picks a task id itself and calls claim_review_task(id)
-- directly (Step 7A's per-id claim, still used for anything id-specific);
-- instead it asks the database for whichever unclaimed task is next by
-- priority, claimed atomically in the same statement.
--
-- Why `for update skip locked` here specifically, instead of the
-- `where status = 'unclaimed'` retry-free pattern claim_review_task(uuid)
-- uses: that pattern is perfect when the caller already knows *which* row
-- it wants (a specific task id) — the UPDATE's own WHERE clause is the
-- whole concurrency guarantee, no separate lookup needed. Here the caller
-- doesn't know an id yet; the function has to *pick* one first via a
-- SELECT, and without `skip locked`, two simultaneous callers would both
-- SELECT the very same top-priority row, then one would block waiting for
-- the other's UPDATE to finish, and then find its own now-stale pick
-- already claimed — correct, but it means the second caller gets no task
-- at all on this call. `for update skip locked` makes the SELECT itself
-- skip rows already locked by a concurrent transaction, so two
-- simultaneous callers each land on a *different* unclaimed row in one
-- round trip — the standard Postgres pattern for a shared work queue.
--
-- Returns NULL (no row) when nothing is unclaimed — this is a normal,
-- expected outcome (the queue is empty), not an error condition, so the
-- caller checks for a null result rather than catching an exception.
-- =============================================================================

create or replace function public.claim_next_review_task()
returns public.review_tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_task public.review_tasks;
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not exists (select 1 from public.reviewers where id = v_caller) then
    raise exception 'caller is not a registered reviewer' using errcode = '42501';
  end if;

  update public.review_tasks
  set status = 'claimed',
      assigned_reviewer_id = v_caller,
      claimed_at = now()
  where id = (
    select id
    from public.review_tasks
    where status = 'unclaimed'
    order by
      case priority_tier
        when 'triple_corroborated' then 0
        when 'quick_confirm' then 1
        when 'conflict_to_resolve' then 2
        else 3
      end,
      created_at
    for update skip locked
    limit 1
  )
  returning * into v_task;

  return v_task; -- NULL means the queue is currently empty — not an error
end;
$$;

grant execute on function public.claim_next_review_task() to authenticated;

comment on function public.claim_next_review_task() is
  'The "Next mosque" button. Picks the highest-priority unclaimed task and claims it atomically in one statement (for update skip locked) — two simultaneous callers are guaranteed different rows, not a race one of them loses. Returns NULL when the queue is empty.';
