-- =============================================================================
-- Step 7D — admin_correct_mosque_task: post-completion correction by an admin
-- =============================================================================
-- complete_review_task() (0003) is deliberately one-way and ownership-locked
-- (only the assigned reviewer, only from 'claimed' -> 'completed', exactly
-- once) — correct for the normal single-pass review flow, but it gives no
-- path for an admin to fix a mistake spotted after the fact without
-- reopening/reassigning the task, which would violate "completed tasks
-- cannot be reassigned" (a hard invariant from Step 7A's own tests, see
-- tests/03_completed_cannot_be_reclaimed.sql). This function is that path:
-- same field-change mechanics as complete_review_task, gated by
-- private.is_admin() instead of task ownership, and it explicitly requires
-- the task to already be 'completed' — it corrects mosque_records data and
-- appends a new review_decisions row, but never touches
-- review_tasks.status/assigned_reviewer_id/completed_at, so the original
-- reviewer's assignment and the task's completed state both stay exactly as
-- they were.
--
-- No new column or decision type needed for a clean audit trail: this
-- function's review_decisions row has reviewer_id = the ADMIN's id, while
-- task_id still points to a task whose assigned_reviewer_id is the
-- ORIGINAL reviewer — that mismatch is itself the signal "this decision
-- row is an admin correction, not the original review," queryable with
-- `review_decisions.reviewer_id <> review_tasks.assigned_reviewer_id`.
-- =============================================================================

create or replace function public.admin_correct_mosque_task(p_task_id uuid, p_decision jsonb)
returns public.review_tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_task public.review_tasks;
  v_mosque public.mosque_records;
  v_decision_type text := p_decision ->> 'decision';
  v_change jsonb;
  v_field text;
  v_recorded_changes jsonb := '[]'::jsonb;
  v_prev jsonb;
  v_new jsonb;
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not private.is_admin() then
    raise exception 'admin_correct_mosque_task requires admin role' using errcode = '42501';
  end if;
  if v_decision_type not in ('verify', 'correct') then
    raise exception 'admin_correct_mosque_task only accepts verify/correct (got %)', v_decision_type
      using errcode = '22023';
  end if;

  select * into v_task from public.review_tasks where id = p_task_id and status = 'completed';
  if v_task.id is null then
    raise exception 'task % is not a completed task (admin correction only applies to already-completed reviews)', p_task_id
      using errcode = 'P0002';
  end if;

  select * into v_mosque from public.mosque_records where id = v_task.mosque_id for update;

  -- Same allowlist-driven, real-previous-value-captured field update as
  -- complete_review_task (0003) — see that function's header comment for
  -- why this is never dynamic SQL.
  for v_change in select * from jsonb_array_elements(coalesce(p_decision -> 'changes', '[]'::jsonb))
  loop
    v_field := v_change ->> 'field';
    v_new := v_change -> 'newValue';

    if v_field = 'name' then
      v_prev := to_jsonb(v_mosque.name);
      update public.mosque_records set name = v_change ->> 'newValue' where id = v_mosque.id;
    elsif v_field = 'address' then
      v_prev := to_jsonb(v_mosque.address);
      update public.mosque_records set address = v_change ->> 'newValue' where id = v_mosque.id;
    elsif v_field = 'district' then
      v_prev := to_jsonb(v_mosque.district);
      update public.mosque_records set district = v_change ->> 'newValue' where id = v_mosque.id;
    elsif v_field = 'latitude' then
      v_prev := to_jsonb(v_mosque.latitude);
      update public.mosque_records set latitude = (v_change ->> 'newValue')::double precision where id = v_mosque.id;
    elsif v_field = 'longitude' then
      v_prev := to_jsonb(v_mosque.longitude);
      update public.mosque_records set longitude = (v_change ->> 'newValue')::double precision where id = v_mosque.id;
    elsif v_field = 'women_prayer' then
      v_prev := to_jsonb(v_mosque.women_prayer);
      update public.mosque_records set women_prayer = (v_change ->> 'newValue')::boolean where id = v_mosque.id;
    elsif v_field = 'parking' then
      v_prev := to_jsonb(v_mosque.parking);
      update public.mosque_records set parking = (v_change ->> 'newValue')::boolean where id = v_mosque.id;
    elsif v_field = 'air_conditioning' then
      v_prev := to_jsonb(v_mosque.air_conditioning);
      update public.mosque_records set air_conditioning = (v_change ->> 'newValue')::boolean where id = v_mosque.id;
    elsif v_field = 'wudu' then
      v_prev := to_jsonb(v_mosque.wudu);
      update public.mosque_records set wudu = (v_change ->> 'newValue')::boolean where id = v_mosque.id;
    elsif v_field = 'jummah' then
      v_prev := to_jsonb(v_mosque.jummah);
      update public.mosque_records set jummah = (v_change ->> 'newValue')::boolean where id = v_mosque.id;
    else
      continue; -- unrecognized field name — silently ignored, never dynamic SQL
    end if;

    v_recorded_changes := v_recorded_changes || jsonb_build_object('field', v_field, 'previousValue', v_prev, 'newValue', v_new);
    select * into v_mosque from public.mosque_records where id = v_mosque.id;
  end loop;

  update public.mosque_records
  set verification_status = 'verified',
      verified_at = now(),
      verified_by = v_caller
  where id = v_task.mosque_id;

  insert into public.review_decisions (task_id, mosque_id, reviewer_id, decision, changes, note)
  values (p_task_id, v_task.mosque_id, v_caller, v_decision_type, v_recorded_changes, p_decision ->> 'note');

  return v_task;
end;
$$;

grant execute on function public.admin_correct_mosque_task(uuid, jsonb) to authenticated;

comment on function public.admin_correct_mosque_task(uuid, jsonb) is
  'Admin-only post-completion correction. Requires the task to already be status=completed; never changes review_tasks itself (status/assigned_reviewer_id/completed_at all stay as the original reviewer left them) — only mosque_records is updated, plus a new append-only review_decisions row whose reviewer_id is the admin, distinguishing it from the original review in the audit trail.';
