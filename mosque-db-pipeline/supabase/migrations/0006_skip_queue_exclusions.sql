-- =============================================================================
-- Step 7B — keep skipped/invalid tasks out of the active claim queue
-- =============================================================================
-- A skip releases a task so another reviewer can claim it, but the reviewer
-- who skipped it should not immediately receive it again. Invalid is a
-- terminal review decision for queue purposes and excludes the task for every
-- reviewer while preserving the append-only decision history.
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
    select t.id
    from public.review_tasks t
    where t.status = 'unclaimed'
      and not exists (
        select 1
        from public.review_decisions d
        where d.task_id = t.id
          and d.reviewer_id = v_caller
          and d.decision = 'skip'
      )
      and not exists (
        select 1
        from public.review_decisions d
        where d.task_id = t.id
          and d.decision = 'invalid'
      )
    order by
      case t.priority_tier
        when 'triple_corroborated' then 0
        when 'quick_confirm' then 1
        when 'conflict_to_resolve' then 2
        else 3
      end,
      t.created_at
    for update skip locked
    limit 1
  )
  returning * into v_task;

  return v_task;
end;
$$;

grant execute on function public.claim_next_review_task() to authenticated;

comment on function public.claim_next_review_task() is
  'Claims the highest-priority eligible task atomically. A reviewer does not receive tasks they previously skipped, and invalid tasks are excluded for all reviewers. Returns NULL when no eligible task remains.';
