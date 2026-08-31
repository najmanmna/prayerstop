# Step 7B Report — Multi-user Mosque Review Web App

## What was built

`mosque-db-pipeline/review-app/` — a private, static, no-build-step web app
(HTML/CSS/JS modules, Supabase Auth + PostgREST via `supabase-js` from CDN)
that lets multiple reviewers do fast coordinate verification concurrently,
built entirely on top of Step 7A's schema. Full behavior, files, and
run/deploy instructions are in
[`review-app/README.md`](../review-app/README.md) — this report covers
what changed at the database level, and the test evidence.

**PrayerStop's mobile runtime was not touched.** `git status` shows the
same ~55-56 lines outside `mosque-db-pipeline/` as before this work began
(pre-existing, unrelated background changes) — zero new lines outside it.

## Database change: one new migration

`supabase/migrations/0004_claim_next_task.sql` — adds
`claim_next_review_task()`, the one piece Step 7A didn't need yet: Step 7A's
`claim_review_task(uuid)` claims a *known* task id; the review app's "Next
mosque" doesn't know an id in advance, it needs "give me *a* task." The
function does that atomically in a single statement:

```sql
update review_tasks set status = 'claimed', assigned_reviewer_id = auth.uid(), claimed_at = now()
where id = (
  select id from review_tasks
  where status = 'unclaimed'
  order by priority_tier, created_at
  for update skip locked
  limit 1
)
returning *;
```

`for update skip locked` is what makes it safe under real concurrency: two
callers racing for "the next row" each lock and claim a *different* row
instead of blocking on each other or double-claiming — see Test 07 below.
Returns `NULL` (not an exception) when the queue is empty, so the app can
show "no more mosques to review" as a normal state. Granted to
`authenticated` only, same as every other Step 7A function — no direct
table grants were added or changed.

No other schema, RLS policy, or existing function changed. The app routes
every mutation through the four `SECURITY DEFINER` functions from Step 7A
(`claim_next_review_task`, `complete_review_task`, `skip_review_task`,
`log_review_note`) plus the new one — there is still no direct client
INSERT/UPDATE/DELETE grant on `mosque_records`, `review_tasks`, or
`review_decisions` for `authenticated`.

## Test results

### Database suite (`supabase/tests/run_all_tests.sh`, clean rebuild)

Rebuilds `prayerstop_mosque_test` from scratch (harness → migrations
0001-0004 → auth trigger → re-import from `master-dataset.json` +
`review-log.jsonl`), then runs all 7 tests in order:

```
Baseline counts immediately after import:
  mosque_records: 3685
  review_tasks (total): 518   (completed: 58, unclaimed: 460)
  review_decisions: 94
  mosque_records (verified): 58

Test 01: two reviewers cannot claim the same mosque (real concurrency)      PASS
Test 02: only the assigned reviewer can complete a task                    PASS
Test 03: completed tasks cannot be reclaimed                               PASS
Test 04: reviewers cannot read other reviewers' private data               PASS
Test 05: admins can access all review data                                 PASS
Test 06: existing human-reviewed records remain completed                  PASS
Test 07: claim_next_review_task() concurrency (Step 7B, new)               PASS
  Unclaimed tasks available before the race: 457
  Reviewer A claimed: b97a377d-f55b-50f4-b09e-3cfc17d8de60
  Reviewer B claimed: 4997132d-927e-5225-ac34-6b347dffb29a
  → two simultaneous claim_next_review_task() calls, two DIFFERENT tasks

================================================
ALL TESTS PASSED
================================================
```

All 58 previously-completed human reviews are confirmed still `completed`
and unreassignable after adding the new function — migration 0004 is
additive only.

### JS unit suite (`review-app/`, `node --test`)

**36 tests, 36 passing, 0 failing** — `data.js` (20 tests: every Supabase
call's parameter shape, auth error propagation, "my data" queries always
scoped to the caller's own id, `markInvalid`'s two-call sequence and its
abort-on-first-failure behavior) + `coord-utils.js` (16 tests: coordinate
parsing/validation, full-precision display — a direct regression test for
the Step 6B truncation bug — haversine distance, save-classification,
Google Maps URL construction). Runs against a hand-built mock Supabase
client; no network, no live project required.

### Real-browser verification (Playwright, manual — not a checked-in test)

Ran once against the real `index.html`/`app.js`/`data.js`/`coord-utils.js`
in real Chromium, with only the `supabase-js` CDN import and `config.js`
intercepted (served a stateful fake in their place — see
`tests/fake-supabase-js.mjs`), so all real DOM rendering, clicks, and input
events were exercised end to end:

login screen → wrong password (friendly error shown, **typed email
preserved** — the bug this pass found and fixed, see below) → correct
sign-in → auto-claims task 1 (title, progress, 2 source rows, correct
Google Maps URL all verified) → paste a coordinate → correct live "22.42 km
away… will be saved as a correction" feedback → Save → task completes,
progress increments 5→6, auto-advances to a *different* mosque (task 2) →
Skip → advances again → Logout → back to login screen. **Zero console or
page errors** at any step. Screenshot confirmed the coordinate-review layout
matches spec: progress pill + reviewer email + logout in the header,
editable name/address, DMRCA city/district, Google Maps button, Leaflet map
with correctly-placed current (blue) and proposed (red) pins, live
coordinate feedback, Save & next.

This run is what caught the one real bug in this phase — not visible to
any unit test, since it's a DOM re-render issue: `renderAuthScreen()` was
rebuilding the login form's `<input>` elements with empty `value=""` on
every re-render, so a failed sign-in's error banner silently wiped the
email the reviewer had already typed, and a second submit attempt got
blocked by the browser's own "please fill out this field" validation.
Fixed by lifting the typed values into a `authFieldValues` variable that
survives re-renders (cleared only on success, sign-up, mode-toggle, or
logout) and re-verified with the same test.

## Requirements checklist (Step 7B's own list)

| Requirement | Status |
|---|---|
| Supabase Auth login for reviewers | ✅ `data.js` signIn/signUp/signOut, `app.js` `renderAuthScreen()` |
| Reviewer sees only their own claimed task + progress | ✅ every query filtered by caller's id; RLS backs it (test 04) |
| "Next mosque" via secure DB-side claim, no duplicate assignment | ✅ `claim_next_review_task()`; test 07 proves real concurrency safety |
| Shows name, address/city/district, coordinates, confidence/status, sources | ✅ `renderTaskScreen()` |
| Open in Google Maps (name + address) | ✅ `googleMapsSearchUrl()`, no extra API call |
| One coordinate input, auto-split/validate | ✅ `parseCoordPair()` + live feedback |
| Verify / Correct / Invalid / Skip | ✅ auto-classified Save (verify/correct) + explicit Invalid/Skip |
| Saves only through existing secure DB functions | ✅ no direct table writes anywhere in `data.js` |
| Auto-claims next task after completion | ✅ `advanceToNext()` |
| Preserves all 58 completed reviews, never requeues | ✅ additive migration only; test 03 + test 06 |
| Simple progress count, no other-reviewer exposure | ✅ bare count only; test 04 |
| Handles already-completed/claimed, network errors, logout, refresh, stale sessions | ✅ `handleActionError()`, `onAuthStateChange`, session/task persistence (see README) |
| UI focused on coordinates only (facilities deferred) | ✅ by design |
| Reuses existing RLS/SECURITY DEFINER model, no second permission system | ✅ one new function, same pattern, same grant model |
| Tests: isolation, concurrency, own-task-only, completed-protection, persistence | ✅ see Test results above |
| Full test suite run + final report | ✅ this document |

## How to run/deploy

See [`review-app/README.md`](../review-app/README.md) for local run,
deployment, and Supabase-project setup steps. Short version:

```bash
cd mosque-db-pipeline/review-app
cp config.example.js config.js   # fill in real Supabase URL + anon key
python3 -m http.server 8901
```

Deploy the directory's static files to any HTTPS static host after running
migrations 0001-0004 + the auth trigger + the Step 7A data import against
the target Supabase project.
