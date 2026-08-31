-- =============================================================================
-- Step 7A — Shared Mosque Database: core schema
-- =============================================================================
-- Ships as-is to a real Supabase project (`supabase db push` or pasted into
-- the SQL Editor). Assumes `auth.users` already exists, which it always does
-- on Supabase. Run this before 0002_rls_policies.sql and 0003_functions.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- reviewers — internal reviewer profiles, 1:1 with auth.users.
-- -----------------------------------------------------------------------------
create table public.reviewers (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  role text not null default 'reviewer' check (role in ('reviewer', 'admin')),
  created_at timestamptz not null default now()
);

comment on table public.reviewers is
  'Internal reviewer profiles. role=admin grants read access to all review data via RLS; self-signup can never set role directly (see handle_new_auth_user in 0003).';

-- -----------------------------------------------------------------------------
-- mosque_records — master mosque data (mirrors master-dataset.json 1:1;
-- see mosque-db-pipeline/master/SCHEMA.md for the field-by-field rationale
-- this table preserves). `id` reuses the pipeline's own deterministic
-- string ids (e.g. "nsdi-16027", "dmrca-R-0318-AM-03", "osm-way-123") rather
-- than a fresh uuid, so every row stays directly traceable back to Steps
-- 1-6A's provenance without an extra mapping table.
-- -----------------------------------------------------------------------------
create table public.mosque_records (
  id text primary key,
  name text,
  latitude double precision,
  longitude double precision,
  district text,
  address text,
  dmrca_registration_no text,
  -- Full original sources[] array from master-dataset.json, byte-for-byte —
  -- every source's own original values (never overwritten), exactly as
  -- Step 6A's provenance model requires. jsonb rather than a relational
  -- breakout because the array is genuinely heterogeneous per source type
  -- (nsdi/dmrca/osm each carry different fields) and read-mostly.
  sources jsonb not null default '[]'::jsonb,
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  verification_status text not null default 'unverified'
    check (verification_status in ('verified', 'needs_review', 'unverified')),
  verified_at timestamptz,
  verified_by uuid references public.reviewers (id),
  women_prayer boolean,
  parking boolean,
  air_conditioning boolean,
  wudu boolean,
  jummah boolean,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint verified_fields_consistent check (
    (verification_status = 'verified' and verified_at is not null and verified_by is not null)
    or (verification_status <> 'verified' and verified_at is null and verified_by is null)
  )
);

comment on table public.mosque_records is
  'Master mosque dataset, imported from mosque-db-pipeline/master/master-dataset.json. Never overwritten directly by client mutations — only complete_review_task() (0003) writes to it, so every change is paired with an append-only review_decisions row.';

create index mosque_records_verification_status_idx on public.mosque_records (verification_status);
create index mosque_records_district_idx on public.mosque_records (district);
create index mosque_records_verified_by_idx on public.mosque_records (verified_by);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger mosque_records_set_updated_at
  before update on public.mosque_records
  for each row
  execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- review_tasks — assignment/claim state. One row per "a mosque needs (or
-- needed) review". A mosque can accumulate multiple *completed* task rows
-- over time (re-review), but at most one *active* (unclaimed/claimed) row —
-- enforced below by a partial unique index, not just application logic.
-- -----------------------------------------------------------------------------
create table public.review_tasks (
  id uuid primary key default gen_random_uuid(),
  mosque_id text not null references public.mosque_records (id) on delete cascade,
  status text not null default 'unclaimed' check (status in ('unclaimed', 'claimed', 'completed')),
  -- Mirrors the local review-tool's 3-tier queue ordering (Step 6B) so a
  -- future UI can reproduce the same priority without recomputing it.
  priority_tier text check (priority_tier in ('triple_corroborated', 'quick_confirm', 'conflict_to_resolve')),
  assigned_reviewer_id uuid references public.reviewers (id),
  claimed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint claimed_fields_consistent check (
    (status = 'unclaimed' and assigned_reviewer_id is null and claimed_at is null)
    or (status in ('claimed', 'completed') and assigned_reviewer_id is not null and claimed_at is not null)
  ),
  constraint completed_has_timestamp check (status <> 'completed' or completed_at is not null)
);

comment on table public.review_tasks is
  'Claim/assignment state. All status transitions go through claim_review_task()/complete_review_task()/skip_review_task() (0003) — there is deliberately no direct client UPDATE grant, since a multi-step claim state machine is a poor fit for RLS USING/WITH CHECK alone (see 0003 header comment).';

-- At most one ACTIVE (non-completed) task per mosque — a real constraint,
-- not just something the claim function happens to maintain.
create unique index review_tasks_one_active_per_mosque
  on public.review_tasks (mosque_id)
  where status <> 'completed';

create index review_tasks_status_idx on public.review_tasks (status);
create index review_tasks_assigned_reviewer_idx on public.review_tasks (assigned_reviewer_id);
create index review_tasks_mosque_idx on public.review_tasks (mosque_id);

-- -----------------------------------------------------------------------------
-- review_decisions — append-only review history. One row per reviewer
-- action (verify/correct/reject_candidate/skip/invalid), mirroring the
-- local tool's review-log.jsonl line-for-line (recordId -> mosque_id,
-- decision, changes[], candidateDecision, note, reviewedAt -> decided_at).
-- No UPDATE/DELETE grant exists for any non-owner role (0002) — the only
-- way a row is ever created is via the SECURITY DEFINER functions in 0003,
-- and none of them ever update or delete an existing review_decisions row.
-- -----------------------------------------------------------------------------
create table public.review_decisions (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.review_tasks (id) on delete cascade,
  mosque_id text not null references public.mosque_records (id) on delete cascade,
  reviewer_id uuid not null references public.reviewers (id),
  decision text not null check (decision in ('verify', 'correct', 'reject_candidate', 'skip', 'invalid')),
  changes jsonb not null default '[]'::jsonb,
  candidate_decision jsonb,
  note text,
  decided_at timestamptz not null default now()
);

comment on table public.review_decisions is
  'Append-only. Every row is one reviewer action, permanent — see 0002 for the explicit lack of UPDATE/DELETE grants that makes this actually append-only, not just conventionally so.';

create index review_decisions_task_idx on public.review_decisions (task_id);
create index review_decisions_mosque_idx on public.review_decisions (mosque_id);
create index review_decisions_reviewer_idx on public.review_decisions (reviewer_id);
