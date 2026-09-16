-- =============================================================================
-- Step 7F — unified duplicate-candidate confirmation (generalizes the
-- paused Step 7E design from nsdi<->dmrca-only to all three checks:
--   cross_source          — reviewed record vs. a still-unreviewed record
--                            from a different source (never had a task)
--   intra_reviewed         — two already-completed reviews, same building
--   unclaimed_vs_verified — a still-pending task vs. an already-verified
--                            record; confirming this one also retires the
--                            pending task, since it cascades away with the
--                            now-redundant mosque_records row
-- =============================================================================
-- Every one of the three checks reduces to the same operation: pick a
-- survivor (the record that stays) and a redundant record (the one that's
-- the same building, described a second time), merge whatever provenance
-- the redundant record adds that the survivor doesn't already have, and
-- retire the redundant record. The one thing that must never happen,
-- regardless of check type: destroying a real human review. So the
-- decision of delete-outright vs. mark-and-preserve is made dynamically,
-- from whether the redundant record actually has any review_decisions —
-- not from which check found it. Verified empirically before writing this
-- that cross_source and unclaimed_vs_verified candidates' redundant sides
-- always have zero history (never queued / never completed), so they
-- delete cleanly; intra_reviewed's redundant side is, by definition,
-- someone's completed review, so it must be preserved.

alter table public.mosque_records
  add column merged_into_id text references public.mosque_records (id);

create index mosque_records_merged_into_idx
  on public.mosque_records (merged_into_id)
  where merged_into_id is not null;

comment on column public.mosque_records.merged_into_id is
  'Set by decide_duplicate_candidate() when this record turned out to be the same building as another, already-reviewed record that had to be preserved (real review_decisions history exists for this row). The row and its full history stay intact; only this pointer marks it as a duplicate — any downstream consumer of mosque_records should filter merged_into_id is not null.';

create table public.duplicate_candidates (
  id uuid primary key default gen_random_uuid(),
  check_type text not null check (check_type in ('cross_source', 'intra_reviewed', 'unclaimed_vs_verified')),
  survivor_mosque_id text not null references public.mosque_records (id) on delete cascade,
  redundant_mosque_id text not null references public.mosque_records (id) on delete cascade,
  match_score numeric not null,
  match_tier text not null check (match_tier in ('high', 'medium', 'low')),
  distance_m numeric,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  decided_by uuid references public.reviewers (id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  unique (survivor_mosque_id, redundant_mosque_id)
);

comment on table public.duplicate_candidates is
  'A queue of proposed (survivor, redundant) mosque_records pairs likely describing the same building, from three independent checks (see check_type). Confirming or rejecting is the only human action needed — see decide_duplicate_candidate(). Never auto-applied.';

alter table public.duplicate_candidates enable row level security;
revoke all on public.duplicate_candidates from anon, authenticated;
grant select on public.duplicate_candidates to authenticated;

create policy "authenticated users can view pending duplicate candidates"
on public.duplicate_candidates for select to authenticated
using (status = 'pending');

create policy "reviewers can view candidates they decided"
on public.duplicate_candidates for select to authenticated
using (decided_by = (select auth.uid()));

create policy "admins can view all duplicate candidates"
on public.duplicate_candidates for select to authenticated
using (private.is_admin());

-- Read-only peek at the next undecided candidate, highest score first.
-- No row lock/claim state — a single button-click decision has no
-- abandon-partway-through risk worth a separate claim step.
create or replace function public.claim_next_duplicate_candidate()
returns public.duplicate_candidates
language sql
security definer
set search_path = ''
stable
as $$
  select * from public.duplicate_candidates
  where status = 'pending'
  order by match_score desc, created_at
  limit 1;
$$;

grant execute on function public.claim_next_duplicate_candidate() to authenticated;

create or replace function public.decide_duplicate_candidate(p_id uuid, p_decision text, p_note text default null)
returns public.duplicate_candidates
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_row public.duplicate_candidates;
  v_survivor public.mosque_records;
  v_redundant public.mosque_records;
  v_new_sources jsonb;
  v_has_history boolean;
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.reviewers where id = v_caller) then
    raise exception 'caller is not a registered reviewer' using errcode = '42501';
  end if;
  if p_decision not in ('confirmed', 'rejected') then
    raise exception 'decide_duplicate_candidate only accepts confirmed/rejected (got %)', p_decision
      using errcode = '22023';
  end if;

  update public.duplicate_candidates
  set status = p_decision, decided_by = v_caller, decided_at = now(), decision_note = p_note
  where id = p_id and status = 'pending'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'candidate % already decided by someone else', p_id using errcode = 'P0002';
  end if;

  if p_decision = 'confirmed' then
    select * into v_survivor from public.mosque_records where id = v_row.survivor_mosque_id for update;
    select * into v_redundant from public.mosque_records where id = v_row.redundant_mosque_id for update;

    -- Only add source types the survivor doesn't already carry — never
    -- overwrites, only fills in new provenance.
    select coalesce(jsonb_agg(elem), '[]'::jsonb) into v_new_sources
    from jsonb_array_elements(v_redundant.sources) elem
    where not exists (
      select 1 from jsonb_array_elements(v_survivor.sources) existing
      where existing ->> 'type' = elem ->> 'type'
    );

    update public.mosque_records
    set sources = v_survivor.sources || v_new_sources,
        dmrca_registration_no = coalesce(v_survivor.dmrca_registration_no, v_redundant.dmrca_registration_no),
        address = coalesce(v_survivor.address, v_redundant.address)
    where id = v_row.survivor_mosque_id;

    select exists(select 1 from public.review_decisions where mosque_id = v_redundant.id) into v_has_history;

    if v_has_history then
      update public.mosque_records set merged_into_id = v_row.survivor_mosque_id where id = v_redundant.id;
    else
      -- Safe: no review_decisions to lose. Also cascades away any still-
      -- unclaimed review_task for this record — the actual queue reduction
      -- for check_type = 'unclaimed_vs_verified'.
      delete from public.mosque_records where id = v_redundant.id;
    end if;
  end if;

  return v_row;
end;
$$;

grant execute on function public.decide_duplicate_candidate(uuid, text, text) to authenticated;

comment on function public.decide_duplicate_candidate(uuid, text, text) is
  'The one state-changing action for duplicate_candidates. On confirm: merges new-source-type provenance into the survivor, fills blank address/dmrca_registration_no only, then either marks the redundant record merged_into_id (if it has real review_decisions — never destroyed) or deletes it outright (if it has none — which also retires any still-pending review_task for it via FK cascade).';
