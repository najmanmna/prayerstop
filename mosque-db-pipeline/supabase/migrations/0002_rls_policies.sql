-- =============================================================================
-- Step 7A — Shared Mosque Database: RLS policies + explicit grants
-- =============================================================================
-- Run after 0001_mosque_schema.sql. Every table below is protected by RLS
-- (no exceptions) and every grant is explicit — nothing relies on whatever
-- Supabase's default `public` schema grants happen to be. Policy style
-- follows Supabase's current documented conventions (verified 2026-08-31,
-- not assumed from training data): one policy per operation (never
-- `FOR ALL`), `(select auth.uid())` wrapping for the initPlan-caching
-- performance win, and `to authenticated`/`to anon` always stated explicitly
-- rather than left implicit.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- private schema — helper functions used inside RLS policies. Deliberately
-- NOT `public`: Supabase only exposes schemas explicitly listed in a
-- project's API settings (public by default) over PostgREST, so anything in
-- `private` is callable from SQL (policies, other functions) but never
-- directly reachable as a REST endpoint — the standard Supabase pattern for
-- policy-only helpers.
-- -----------------------------------------------------------------------------
create schema if not exists private;
grant usage on schema private to authenticated;
-- No usage grant to anon — admin-check helper is meaningless for anon.

create or replace function private.is_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.reviewers r
    where r.id = (select auth.uid()) and r.role = 'admin'
  );
$$;

comment on function private.is_admin() is
  'security definer + search_path pinned per Supabase''s current guidance, so it cannot be tricked by a caller-controlled search_path and so it can read public.reviewers regardless of the calling role''s own row-level access to that table (avoids the recursive-policy trap of a reviewers SELECT policy calling a function that itself selects from reviewers under the *caller''s* restricted view).';

grant execute on function private.is_admin() to authenticated;

-- -----------------------------------------------------------------------------
-- reviewers
-- -----------------------------------------------------------------------------
alter table public.reviewers enable row level security;

revoke all on public.reviewers from anon, authenticated;
grant select on public.reviewers to authenticated;
-- No insert/update/delete grant for authenticated at all: a reviewer's own
-- profile (in particular `role`) is never self-service-writable — creation
-- happens only via the handle_new_auth_user trigger (0003), and role
-- promotion is an admin/service-role-only action outside this API surface.

create policy "reviewers can view their own profile"
on public.reviewers
for select
to authenticated
using ( (select auth.uid()) = id );

create policy "admins can view all reviewer profiles"
on public.reviewers
for select
to authenticated
using ( private.is_admin() );

-- -----------------------------------------------------------------------------
-- mosque_records — the shared master dataset itself is not private data
-- (it's the same government/OSM-sourced mosque catalog every reviewer works
-- from); every registered reviewer can read all of it. What IS private is
-- who is assigned to review what (review_tasks, below) — a reviewer seeing
-- a mosque's own name/address/coordinates is not the same as seeing another
-- reviewer's identity or their claimed-task assignment.
-- -----------------------------------------------------------------------------
alter table public.mosque_records enable row level security;

revoke all on public.mosque_records from anon, authenticated;
grant select on public.mosque_records to authenticated;
-- No insert/update/delete grant for authenticated: every mutation goes
-- through complete_review_task() (0003, security definer), so a change to
-- mosque_records is always paired with an append-only review_decisions row.

create policy "authenticated users can view mosque records"
on public.mosque_records
for select
to authenticated
using ( true );

-- -----------------------------------------------------------------------------
-- review_tasks
-- -----------------------------------------------------------------------------
alter table public.review_tasks enable row level security;

revoke all on public.review_tasks from anon, authenticated;
grant select on public.review_tasks to authenticated;
-- Deliberately NO insert/update/delete grant for authenticated at all — see
-- the table comment in 0001 and the header comment in 0003 for why direct
-- client UPDATE is the wrong tool for a multi-step claim state machine.
-- All transitions go through the three SECURITY DEFINER functions in 0003.

create policy "authenticated users can view unclaimed tasks"
on public.review_tasks
for select
to authenticated
using ( status = 'unclaimed' );

create policy "reviewers can view their own tasks"
on public.review_tasks
for select
to authenticated
using ( assigned_reviewer_id = (select auth.uid()) );

create policy "admins can view all tasks"
on public.review_tasks
for select
to authenticated
using ( private.is_admin() );

-- -----------------------------------------------------------------------------
-- review_decisions — append-only. No insert/update/delete grant for
-- `authenticated` at all: the only writer is the SECURITY DEFINER functions
-- in 0003 (running as the function owner, not the calling reviewer), so
-- there is no grant to revoke a client's way around — append-only is a
-- structural fact, not just a policy.
-- -----------------------------------------------------------------------------
alter table public.review_decisions enable row level security;

revoke all on public.review_decisions from anon, authenticated;
grant select on public.review_decisions to authenticated;

create policy "reviewers can view their own decisions"
on public.review_decisions
for select
to authenticated
using ( reviewer_id = (select auth.uid()) );

create policy "admins can view all decisions"
on public.review_decisions
for select
to authenticated
using ( private.is_admin() );
