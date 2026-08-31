# Local test harness — what's real, what's simulated, and why

This environment has no Supabase CLI and no Docker, so `supabase start`
(the normal way to get a full local Supabase stack — Postgres + GoTrue
Auth + PostgREST + Realtime) wasn't available. Everything in this folder
exists solely to validate `migrations/0001-0003` against a genuine
PostgreSQL 17 instance (installed via Homebrew) instead of leaving that
SQL untested.

## What's simulated

- **`auth.users`** — a minimal table (`id`, `email`, `raw_user_meta_data`,
  `created_at`). A real Supabase project's version has many more columns
  (password hashes, confirmation timestamps, etc.) — irrelevant to this
  schema's foreign keys and RLS, which only ever reference `id`.
- **`auth.uid()` / `auth.role()`** — reproduced byte-for-byte from
  Supabase's actual current implementation (verified via Supabase's own
  GitHub discussions/issues, not assumed): reads the `sub`/`role` claim
  out of the `request.jwt.claims` session GUC, exactly how PostgREST
  injects a verified JWT's claims into the database session for every
  request. A test "logs in as" a user by setting that same GUC — from the
  policies' point of view, indistinguishable from a real authenticated
  PostgREST request.
- **`anon` / `authenticated` / `service_role`** — created as plain
  Postgres roles with the same names and (for `service_role`) the same
  `bypassrls` attribute Supabase's real roles have.
- **`test.login(uuid)` / `test.logout()`** — harness-only helpers with no
  Supabase equivalent; they just set the JWT-claims GUC for convenience.

## What's real

Everything else. `migrations/0001-0003` are applied completely unmodified
— the exact same `CREATE TABLE`/`CREATE POLICY`/`CREATE FUNCTION`
statements that would run against a real Supabase project via
`supabase db push` or the SQL editor. The RLS enforcement, the
`SECURITY DEFINER` function behavior, the partial unique index, the
concurrent-claim row-locking — none of that is Supabase-specific
behavior; it's standard PostgreSQL, and PostgreSQL is what's actually
running here.

## What this does NOT validate

- PostgREST's own request routing/auth-header-to-JWT-claims translation
  (this harness sets the GUC directly, skipping that layer entirely).
- Supabase Auth's actual signup/login flows, email confirmation, etc.
- Realtime, Storage, or any other Supabase product beyond Postgres+RLS.

None of those are in scope for Step 7A (schema/RLS/claiming only, no new
UI), so this gap doesn't affect what's being proven here — but it's worth
being explicit that "tested against local Postgres with a faithful
`auth.uid()` stand-in" is not the same claim as "tested against a live
Supabase project," and the latter is worth doing once real project
credentials exist.
