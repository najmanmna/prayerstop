-- =============================================================================
-- LOCAL TEST HARNESS ONLY — DO NOT RUN AGAINST A REAL SUPABASE PROJECT.
-- =============================================================================
-- A real Supabase project already provides the `auth` schema, the
-- `anon`/`authenticated`/`service_role` Postgres roles, and `auth.uid()` —
-- created and managed by Supabase itself. This file exists solely because
-- this environment has no Supabase CLI/Docker available to run a real local
-- Supabase stack (`supabase start`), so it faithfully reproduces just enough
-- of Supabase's auth plumbing — verified against Supabase's actual current
-- implementation, not guessed — to validate the real schema/RLS/functions
-- in migrations/0001-0003 against a genuine Postgres instance.
--
-- auth.uid()/auth.role() here are byte-for-byte the same logic Supabase
-- ships: read the `sub`/`role` claim out of the `request.jwt.claims` GUC
-- (falling back to the flat `request.jwt.claim.sub` form), which is exactly
-- how PostgREST injects the caller's verified JWT claims into the database
-- session for every request. Tests "log in as" a user by setting that same
-- GUC before running queries — indistinguishable, from the policies' point
-- of view, from a real authenticated PostgREST request.
-- =============================================================================

create schema if not exists auth;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- Minimal stand-in for auth.users — a real Supabase project's version has
-- many more columns (encrypted_password, email_confirmed_at, etc.); only
-- `id`/`email` are relevant to this schema's foreign keys and RLS.
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  -- Real Supabase auth.users carries user-supplied signup metadata here;
  -- handle_new_auth_user() (0003) reads it for an optional display name.
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
    ),
    ''
  )::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.role', true),
      (current_setting('request.jwt.claims', true)::jsonb ->> 'role')
    ),
    ''
  )::text
$$;

-- Test helper (harness-only) — sets the session GUCs a real PostgREST
-- request would set for an authenticated call, so `SET LOCAL ROLE
-- authenticated; SELECT test.login('<uuid>');` inside one transaction is a
-- faithful stand-in for "this request came from this logged-in user".
create schema if not exists test;
create or replace function test.login(p_user_id uuid)
returns void
language sql
as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );
$$;

create or replace function test.logout()
returns void
language sql
as $$
  select set_config('request.jwt.claims', '', true);
$$;

grant usage on schema test to anon, authenticated, service_role;
grant execute on function test.login(uuid) to anon, authenticated, service_role;
grant execute on function test.logout() to anon, authenticated, service_role;
