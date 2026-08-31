# Step 7A Report — Shared Mosque Database in Supabase

Standalone, under `mosque-db-pipeline/supabase/`. PrayerStop app code: not
touched. New web UI: not built (as scoped). Everything below was actually
run against a real local PostgreSQL 17 instance — see
`local-test-harness/README.md` for exactly what's real vs. simulated and
why (no Supabase CLI/Docker available in this environment).

## Final schema

**`reviewers`** — 1:1 with `auth.users`. `role` is `reviewer` or `admin`
(self-signup can never set `admin` — see `handle_new_auth_user()`).

**`mosque_records`** — the master dataset, 1:1 with
`master-dataset.json`'s own fields (see `master/SCHEMA.md`), plus
`verified_by uuid references reviewers(id)` (new — tracks *who* verified
each record, information the flat JSON file never carried at the record
level). `sources jsonb` preserves the full original provenance array
byte-for-byte.

**`review_tasks`** — claim/assignment state machine (`unclaimed` →
`claimed` → `completed`). A partial unique index
(`review_tasks_one_active_per_mosque ... where status <> 'completed'`)
enforces "at most one active task per mosque" as a real constraint, not
application logic — verified directly (see Test 06a below).

**`review_decisions`** — append-only, one row per reviewer action
(`verify`/`correct`/`reject_candidate`/`skip`/`invalid`), mirroring
`review-log.jsonl`'s own shape field-for-field.

Full DDL: `migrations/0001_mosque_schema.sql`.

## Access model

| Rule | How it's enforced |
|---|---|
| One mosque → at most one active task | Partial unique index (schema-level, not app logic) |
| Only one reviewer can claim a task | Atomic `UPDATE ... WHERE status='unclaimed'` inside `claim_review_task()` — Postgres row-locking does the rest (see `0003_functions.sql` header) |
| Only the assigned reviewer can complete/update | `complete_review_task()`/`skip_review_task()` check `assigned_reviewer_id = auth.uid()` explicitly in code |
| Completed tasks can't be reclaimed | Same atomic `WHERE status='unclaimed'` guard — a completed task never matches |
| Review history is append-only | No `INSERT`/`UPDATE`/`DELETE` grant on `review_decisions` for `authenticated` at all — the only writer is the `SECURITY DEFINER` functions |
| Reviewers can't see others' identities/assignments | RLS: `reviewers` own-row-only; `review_tasks` own-assignment-only (+ unclaimed pool visible to all) |
| Admin sees everything | `private.is_admin()` (`SECURITY DEFINER`, pinned `search_path`) permissive policy on every table |

**Why `SECURITY DEFINER` functions instead of direct client `UPDATE` +
RLS `USING`/`WITH CHECK`**: with multiple permissive `UPDATE` policies on
one table, Postgres OR's every policy's `USING` together for row
visibility and OR's every policy's `WITH CHECK` together for the new-row
check — independently, not pairwise. Two narrow-looking policies ("claim"
and "complete-your-own") can combine into an unintended third transition
(a `USING` from one policy + a `WITH CHECK` from the other = instantly
completing an unclaimed task in one step, skipping the claim). Routing
every transition through one function per operation sidesteps that risk
entirely — full rationale in `0003_functions.sql`'s header comment.

Grants are explicit throughout (`revoke all ... from anon, authenticated`
followed by exactly the `select`/`execute` each role needs — see
`0002_rls_policies.sql`). Verified directly: `anon` has zero grants on any
of the four tables and a query as `anon` gets a hard `permission denied`
(grant-level denial, RLS never even needs to run).

## Migration steps (real project)

```bash
supabase db push                                       # 0001, 0002, 0003
psql "$DATABASE_URL" -f local-test-harness/0001_wire_auth_trigger.sql   # one-time trigger attach
python3 scripts/migrate_to_supabase.py
psql "$DATABASE_URL" -f output/migrate_data.sql
```

## Imported record counts

Source: `master/output/master-dataset.json` (3,685 records) +
`master/review-results/review-log.jsonl` (94 real events, all genuine
local review-tool history — not synthetic).

| | Count |
|---|---:|
| `mosque_records` | 3,685 (all of master-dataset.json) |
| `review_tasks` | 518 (all `needs_review` records — the local tool's full queue) |
| `review_tasks`, `status='completed'` | **58** |
| `review_tasks`, `status='unclaimed'` | 460 |
| `review_decisions` | 94 (the complete, unmodified local history) |
| `mosque_records`, `verification_status='verified'` | 58 |
| `reviewers` | 1 (the migrated local-tool identity, imported as `admin`) |

One honest correction to the task's own framing: the task said "existing
60 human-reviewed records" — the actual current `review-log.jsonl` has
**58** distinct records with a real `verify`/`correct` decision (plus 2
`skip`-only and 1 `invalid`-only, imported as history but left
`unclaimed` since neither of those completes a task locally either).
Used the real number from the actual file rather than forcing a match to
60.

Field-value replay was verified directly against a known multi-edit
record (`nsdi-16027`, corrected 4 times locally): the imported
`mosque_records` row holds exactly the *last* correction's coordinates,
and all 4 corrections are preserved verbatim, in order, in
`review_decisions` — "last write wins" for current state, full history
kept regardless.

## Test results — all passing, run via `tests/run_all_tests.sh`

| # | Proves | Result |
|---|---|---|
| 01 | Two reviewers cannot claim the same mosque | **PASS** — real 2-process concurrency test (not simulated): Session A claims and holds its transaction open 2s before committing; Session B, started 0.3s later, blocks on A's row lock mid-`UPDATE`, then correctly fails once A commits (`task ... is not available to claim`). Exactly 1 of 2 simultaneous attempts succeeded. |
| 02 | Only the assigned reviewer can complete a task | **PASS** — Reviewer B (not assigned) rejected attempting to complete Reviewer A's claimed task; task provably unchanged afterward; Reviewer A then completes it successfully. |
| 03 | Completed tasks cannot be reassigned | **PASS** — an uninvolved reviewer *and* the original completing reviewer both rejected trying to reclaim an already-completed task; status unchanged. |
| 04 | Reviewers cannot read other reviewers' private data | **PASS**, 5 checks — Reviewer A cannot see Reviewer B's profile row, cannot see B's claimed task by direct ID lookup, cannot enumerate any task assigned to B, cannot see B's `review_decisions`; A's own-scoped queries still work normally. |
| 05 | Admins can access all review data | **PASS**, 4 checks — admin's row counts on `reviewers`/`review_tasks`/`review_decisions` exactly match the unrestricted ground truth (not filtered), and admin specifically sees Reviewer B's profile — the exact thing Test 04 proved A cannot see. |
| 06 | Existing human-reviewed records remain completed | **PASS**, 5 checks — completed-task count matches verified-mosque count exactly; every completed task's mosque has `verified_at`+`verified_by` set; every completed task has a real `verify`/`correct` row backing it in the append-only log; all 3,685 mosque records present. |

Two additional direct verifications beyond the required list:
- **One-active-task-per-mosque constraint**: attempting to `INSERT` a
  second `unclaimed` task for a mosque that already has one fails with
  `duplicate key value violates unique constraint
  review_tasks_one_active_per_mosque` — a real schema-level rejection, not
  application logic.
- **RLS is actually enabled** (`pg_class.relrowsecurity = true`) on all
  four tables, confirmed directly via `pg_class`, not assumed from the
  migration having run without error.

## What's not done (by design, per scope)

- No new web UI (task said not to build it yet).
- No live Supabase project — this was validated against a real local
  Postgres instance with a faithful `auth.uid()`/RLS stand-in (see
  `local-test-harness/README.md`); running the same migrations against an
  actual Supabase project is the natural next step once credentials
  exist, and nothing about `migrations/0001-0003` would need to change to
  do that.
- PrayerStop's runtime app: untouched, as instructed.
