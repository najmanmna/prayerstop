-- =============================================================================
-- Step 7A — Shared Mosque Database: claim/complete/skip functions
-- =============================================================================
-- Run after 0001_mosque_schema.sql and 0002_rls_policies.sql.
--
-- Why SECURITY DEFINER functions instead of a direct client UPDATE +
-- RLS USING/WITH CHECK on review_tasks: RLS's USING/WITH CHECK pair is a
-- good fit for simple ownership checks ("this row is mine"), but a poor fit
-- for a multi-step state machine (unclaimed -> claimed -> completed) with
-- more than one valid transition. With *multiple* permissive UPDATE
-- policies on the same table, Postgres OR's every policy's USING clause
-- together for row visibility AND OR's every policy's WITH CHECK together
-- for the new-row check — independently, not pairwise. Two narrow-looking
-- policies (one for "claim", one for "complete-your-own") can combine into
-- an unintended third transition (e.g. USING from the claim policy +
-- WITH CHECK from the complete policy = instantly completing an unclaimed
-- task in one step, skipping the claim entirely). Routing every transition
-- through one function per operation sidesteps that cross-policy risk
-- entirely: each function is a single, fully-readable set of rules, and
-- review_tasks/review_decisions/mosque_records carry NO direct
-- insert/update grant for `authenticated` (0002) — these functions are the
-- only way to write to any of them.
--
-- The concurrency guarantee two-simultaneous-reviewers-can't-claim-the-
-- same-task requirement rests entirely on ordinary Postgres MVCC: the
-- `update ... where status = 'unclaimed' returning *` inside
-- claim_review_task is one atomic statement. If two transactions race for
-- the same row, Postgres serializes them at the row lock — the loser's
-- UPDATE re-evaluates its WHERE clause after the winner commits and finds
-- status is no longer 'unclaimed', so it affects zero rows. No advisory
-- lock, no SELECT ... FOR UPDATE dance needed; this is the standard,
-- correct atomic-claim pattern in Postgres.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- New Supabase Auth user -> a reviewers row, automatically, role always
-- 'reviewer' (self-signup can never grant admin — promotion is a manual
-- action taken with the service role, outside this API surface entirely).
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.reviewers (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    'reviewer'
  );
  return new;
end;
$$;

-- Note: on a real Supabase project this trigger is created on auth.users,
-- which this migration set assumes already exists (it always does on
-- Supabase). Local test harness note: the 0000 auth stub's auth.users is a
-- plain table with no such trigger wiring by default — see
-- local-test-harness/0001_wire_auth_trigger.sql for the local-only line
-- that attaches it, so this exact trigger definition stays identical
-- between the real migration and the local test.
comment on function public.handle_new_auth_user() is
  'Attach as: create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();';

-- -----------------------------------------------------------------------------
-- claim_review_task — the transactional claim operation.
-- -----------------------------------------------------------------------------
create or replace function public.claim_review_task(p_task_id uuid)
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
  where id = p_task_id
    and status = 'unclaimed'
  returning * into v_task;

  if v_task.id is null then
    raise exception 'task % is not available to claim (already claimed or completed, or does not exist)', p_task_id
      using errcode = 'P0002';
  end if;

  return v_task;
end;
$$;

grant execute on function public.claim_review_task(uuid) to authenticated;

comment on function public.claim_review_task(uuid) is
  'Atomic claim: update ... where status = ''unclaimed'' is the entire concurrency guarantee (see file header). Raises if the task is already claimed/completed/missing, or the caller has no reviewers row.';

-- -----------------------------------------------------------------------------
-- complete_review_task — verify/correct. Only the assigned reviewer, only
-- from 'claimed'. Writes exactly one append-only review_decisions row and,
-- for the well-known editable fields, applies the same field/facility
-- changes the local review tool's "Correct" action applies — see
-- mosque-db-pipeline/master/review-tool/server.py's EDITABLE_FIELDS /
-- FACILITY_FIELDS for the exact list this mirrors.
--
-- p_decision shape (matches review-log.jsonl's own event shape):
--   { "decision": "verify" | "correct",
--     "changes": [ { "field": "latitude", "newValue": 6.58 }, ... ],
--     "note": "optional text" }
-- Only previousValue-less {field,newValue} pairs are required from the
-- caller — previousValue is captured server-side from the row's actual
-- current value at write time (never trusts a client-supplied
-- previousValue), so the append-only log can't be fed a fabricated diff.
-- -----------------------------------------------------------------------------
create or replace function public.complete_review_task(p_task_id uuid, p_decision jsonb)
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
  if v_decision_type not in ('verify', 'correct') then
    raise exception 'complete_review_task only accepts verify/correct (got %) — use skip_review_task or log_review_note for other decisions', v_decision_type
      using errcode = '22023';
  end if;

  update public.review_tasks
  set status = 'completed',
      completed_at = now()
  where id = p_task_id
    and status = 'claimed'
    and assigned_reviewer_id = v_caller
  returning * into v_task;

  if v_task.id is null then
    raise exception 'task % cannot be completed by this reviewer (not claimed by you, not in claimed state, or does not exist)', p_task_id
      using errcode = '42501';
  end if;

  select * into v_mosque from public.mosque_records where id = v_task.mosque_id for update;

  -- Apply each recognized field change to mosque_records, recording the
  -- REAL previous value (from the row, not the client) into the append-only
  -- log alongside the new one.
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

grant execute on function public.complete_review_task(uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- skip_review_task — releases the claim back to 'unclaimed' so another
-- reviewer (or the same one, later) can pick it up. Unlike the local
-- single-user tool (where "skip" just moved to the next record with no
-- release concept, since there was only ever one reviewer), a real shared
-- queue needs skipped work to actually become available to someone else.
-- -----------------------------------------------------------------------------
create or replace function public.skip_review_task(p_task_id uuid, p_note text default null)
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

  update public.review_tasks
  set status = 'unclaimed',
      assigned_reviewer_id = null,
      claimed_at = null
  where id = p_task_id
    and status = 'claimed'
    and assigned_reviewer_id = v_caller
  returning * into v_task;

  if v_task.id is null then
    raise exception 'task % cannot be skipped by this reviewer (not claimed by you, not in claimed state, or does not exist)', p_task_id
      using errcode = '42501';
  end if;

  insert into public.review_decisions (task_id, mosque_id, reviewer_id, decision, note)
  values (p_task_id, v_task.mosque_id, v_caller, 'skip', p_note);

  return v_task;
end;
$$;

grant execute on function public.skip_review_task(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- log_review_note — non-terminal decisions that don't change task status:
-- 'reject_candidate' (rejecting a flagged duplicate/ambiguous source
-- candidate — see Steps 2/4's candidate model) and 'invalid' (flagging the
-- record itself, without completing or releasing the task). Requires the
-- task to still be claimed by the caller — logging notes on a task you
-- don't hold is not allowed.
-- -----------------------------------------------------------------------------
create or replace function public.log_review_note(
  p_task_id uuid,
  p_decision text,
  p_candidate_decision jsonb default null,
  p_note text default null
)
returns public.review_decisions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_task public.review_tasks;
  v_row public.review_decisions;
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_decision not in ('reject_candidate', 'invalid') then
    raise exception 'log_review_note only accepts reject_candidate/invalid (got %)', p_decision
      using errcode = '22023';
  end if;

  select * into v_task
  from public.review_tasks
  where id = p_task_id and status = 'claimed' and assigned_reviewer_id = v_caller;

  if v_task.id is null then
    raise exception 'task % is not currently claimed by this reviewer', p_task_id
      using errcode = '42501';
  end if;

  insert into public.review_decisions (task_id, mosque_id, reviewer_id, decision, candidate_decision, note)
  values (p_task_id, v_task.mosque_id, v_caller, p_decision, p_candidate_decision, p_note)
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.log_review_note(uuid, text, jsonb, text) to authenticated;
