# Step 7C Report — Real Supabase Deployment

## Project

`https://whxpbchlkgrqeiubmgfo.supabase.co` (project ref `whxpbchlkgrqeiubmgfo`).
Deployed via direct Postgres connection (`db.whxpbchlkgrqeiubmgfo.supabase.co:5432`,
`psql`) using the database password — no Supabase CLI needed, no SQL rewritten.
The local Postgres test harness (`supabase/local-test-harness/0000_auth_stub.sql`)
was **not** touched or applied — the real project already has a real `auth`
schema; only the one real trigger-creation line
(`local-test-harness/0001_wire_auth_trigger.sql`) was run against it.

## What was executed, in order

1. **Pre-flight check** — confirmed `public` schema was empty and `auth.users`
   had 0 rows (clean project, nothing to collide with).
2. **`migrations/0001_mosque_schema.sql`** — `reviewers`, `mosque_records`,
   `review_tasks`, `review_decisions` tables, indexes, constraints. Applied
   as-is, exit 0.
3. **`migrations/0002_rls_policies.sql`** — `private.is_admin()`, RLS enabled
   + explicit grants/policies on all 4 tables. Applied as-is, exit 0.
4. **`migrations/0003_functions.sql`** — `handle_new_auth_user()`,
   `claim_review_task()`, `complete_review_task()`, `skip_review_task()`,
   `log_review_note()`. Applied as-is, exit 0.
5. **`migrations/0004_claim_next_task.sql`** — `claim_next_review_task()`.
   Applied as-is, exit 0.
6. **`local-test-harness/0001_wire_auth_trigger.sql`** — the one production-
   applicable line, run against the real `auth.users`:
   `create trigger on_auth_user_created after insert on auth.users for each
   row execute function public.handle_new_auth_user();`. Confirmed present
   via `pg_trigger` afterward.
7. **Regenerated the import SQL fresh** — `python3 scripts/migrate_to_supabase.py`
   was rerun against the *current* `master-dataset.json` and `review-log.jsonl`
   (not a stale previously-generated file) immediately before importing, so
   the deployed data reflects the current 3,685 records / 94 review events /
   58 completed reviews exactly. Script output:
   ```
   master-dataset.json records: 3685
   review-data.json (needs_review) records: 518
   review-log.jsonl events: 94
   distinct records with review history: 61
   distinct records completed (verified/corrected): 58
   ```
   Sanity-checked the generated `output/migrate_data.sql` before running it:
   3,685 `mosque_records` inserts, 518 `review_tasks` inserts, 94
   `review_decisions` inserts — matching the script's own counts exactly.
8. **Imported the data** — `psql ... -f output/migrate_data.sql`, one
   transaction (`begin;`...`commit;`). First attempt hit the sandbox's 2-minute
   foreground command limit (network round-trip latency × ~4,300 individual
   statements) and was killed before `commit` — verified this left **zero**
   rows and no lingering transaction, then reran in the background to
   completion. Log ends in `COMMIT` / exit 0, no errors.

## Post-deployment verification

All performed directly against the real project — no local/simulated
substitute involved for anything in this section.

| Check | Result |
|---|---|
| Row counts | `mosque_records`=3685, `review_tasks`=518 (completed=58, unclaimed=460, claimed=0), `review_decisions`=94, `mosque_records` verified=58, `reviewers`=1 (the migrated admin identity) |
| Existing completed reviews present | Sampled 3 `completed` tasks directly — `nsdi-16027`, `nsdi-17967`, `nsdi-18539` (the same 3 records manually corrected and restored during Step 6B), all `completed`, all with the migrated reviewer as `assigned_reviewer_id` |
| RLS enabled | `pg_class.relrowsecurity = true` for all 4 tables (`mosque_records`, `review_tasks`, `review_decisions`, `reviewers`) |
| Reviewer can authenticate | Two disposable test accounts created through the **real** `/auth/v1/signup` endpoint (never a direct `auth.users` insert, never a hand-built password hash) — see "Rate limit" below for why this needed one dashboard setting change; both produced real JWT sessions from Supabase Auth |
| `claim_next_review_task()` works | Called via the real `/rest/v1/rpc/claim_next_review_task` endpoint with a real JWT — returned a valid claimed task |
| Two simultaneous reviewers → different tasks | Fired both reviewers' `claim_next_review_task()` calls **in parallel** (backgrounded, `wait`) — reviewer A got `nsdi-19047`, reviewer B got `nsdi-14394`, two different tasks, both `status='claimed'` |
| Second reviewer cannot claim same task | Reviewer B called `claim_review_task()` on reviewer A's just-claimed task id → real `P0002` error ("not available to claim") |
| Completed tasks are never claimable | Reviewer B called `claim_review_task()` on `nsdi-16027`'s completed task id → real `P0002` error |
| Reviewer privacy / RLS | Reviewer A's `/rest/v1/reviewers?id=eq.<B>` returned `[]` (RLS hides B's profile); A's query for B's `review_tasks` returned `[]` |

### Rate limit encountered, and how it was resolved

Supabase's default project ships with email confirmation on, using its
shared low-volume test email service. The first two live signup attempts
(needed to get real, sign-in-able JWTs for the concurrency/RLS tests) hit
`over_email_send_rate_limit` (429) — the service allows only a couple of
confirmation emails before throttling, with no `Retry-After` header and an
unpredictable reset. Rather than wait an unknown amount of time, or fall
back to writing directly into `auth.users` with a hand-built bcrypt hash
(the initial approach, which the environment's own permission classifier
correctly flagged as too sensitive for a database credentials table), you
turned off **Confirm email** in the dashboard (Authentication → Email
provider). That let the real `/auth/v1/signup` endpoint return a session
immediately, with zero emails sent — same real Auth code path, just no
confirmation step. **This setting is still off** — turn it back on
whenever you're ready for real reviewers to go through normal email
confirmation; it has no effect on anything already deployed.

### Cleanup

Both disposable test accounts and every trace of their activity were
removed after verification:
- The two tasks they claimed during testing were reset directly to
  `unclaimed` / `assigned_reviewer_id = null` / `claimed_at = null` — not
  via `skip_review_task()`, specifically to avoid adding extra `skip`
  rows to `review_decisions` that weren't part of the real review history.
- Confirmed zero `review_decisions` rows existed for either test reviewer
  id before deleting them.
- `delete from auth.users where id in (...)` for both test accounts —
  cascades to their `public.reviewers` rows via the existing
  `on delete cascade` foreign key (confirmed: 0 rows left in `reviewers`
  for those ids).
- Final counts reconfirmed **after** cleanup, exactly matching the
  pre-test baseline: 3685 / 518 (58 completed / 460 unclaimed / 0 claimed)
  / 94 / 58 verified / 1 reviewer / 1 `auth.users` row (only the original
  migrated identity remains).

## Final state

```
mosque_records:            3685
review_tasks (total):      518
review_tasks (completed):  58
review_tasks (unclaimed):  460
review_tasks (claimed):    0
review_decisions:          94
mosque_records (verified): 58
reviewers:                 1
auth.users:                1
```

Exact match to the required final state. No PrayerStop runtime code was
touched (`git status` outside `mosque-db-pipeline/` unchanged from the
established ~56-line background baseline). No mosque master data was
modified — only schema + the existing, unmodified historical review data
were deployed.

## Still true / next steps

- `review-app/config.js` is already pointed at this real project — the
  app itself has not been exercised against it yet (Step 7B's Playwright
  run used a mocked Supabase, by design, to protect real data during
  development).
- **Confirm email is currently OFF** on this project — re-enable it in
  Authentication → Email provider before onboarding real reviewers, if
  you want them to go through normal email verification.
- No Supabase CLI/`supabase link` was set up — this deployment used direct
  `psql` against the connection string, matching what the migration
  script's own header comment already documented as the intended method.
