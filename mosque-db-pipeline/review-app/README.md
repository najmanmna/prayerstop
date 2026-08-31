# Mosque Review — Multi-user Web App (Step 7B)

A private, multi-reviewer web app for fast coordinate verification, built
directly on Step 7A's Supabase schema. **Not part of the PrayerStop mobile
app** — a separate static site under `mosque-db-pipeline/`.

Zero build step, zero framework, zero bundler: plain HTML/CSS/JS modules,
Supabase Auth + the existing RLS/`SECURITY DEFINER` functions do all the
work. The browser talks directly to Supabase (Postgres + PostgREST + Auth)
using the public `anon` key — there is no custom backend server, matching
"use the existing Supabase RLS/SECURITY DEFINER architecture rather than
creating a second permission system" literally: there's nowhere else for a
second permission system to even live.

## What it does

- **Supabase Auth login** (email + password) — sign in or create a
  reviewer account. New accounts are automatically provisioned as
  `role='reviewer'` (never `admin`) via the `handle_new_auth_user` trigger
  from Step 7A — there's no separate app-level user table.
- **One task at a time.** On login (or refresh — the session and the
  reviewer's in-progress claim both survive a reload, see "Persistence"
  below), the app checks for an already-claimed task and resumes it; if
  there isn't one, it calls `claim_next_review_task()` automatically.
- **"Next mosque" = a real database-side claim.** `claim_next_review_task()`
  (new in `supabase/migrations/0004_claim_next_task.sql`) picks the
  highest-priority unclaimed task and claims it atomically in one
  statement (`for update skip locked`) — two reviewers hitting "next" at
  the same moment are guaranteed two different tasks, never a race one of
  them silently loses. See Step 7A's `claim_review_task(uuid)` for the
  sibling function used when a specific task id is already known; this one
  exists because the app doesn't know an id in advance.
- **Shows exactly what was asked for, nothing more**: name (editable),
  DMRCA-sourced address/city/district, current coordinates + map,
  confidence/status badges, the full `sources` table (NSDI/DMRCA/OSM,
  with real links), an **Open in Google Maps** button (name + address, no
  extra Places API call), one coordinate paste box with live parse +
  range validation, and the reviewer's own progress count. Facility
  fields are deliberately absent — out of scope for this coordinate-focused
  pass, exactly as instructed.
- **Verify / Correct / Invalid / Skip** — one **Save & next** button
  auto-classifies Verify vs. Correct from whether anything actually
  changed (name/address/coordinate), calling `complete_review_task()`
  either way; this mirrors Step 6B's own hard-won UX lesson (a reviewer
  explicitly asked for exactly this unification rather than two separate
  buttons they'd have to choose between for every record) while still
  recording the real, distinct decision type server-side. **Invalid**
  calls `log_review_note()` (preserving the distinct audit-trail decision
  type) *and* `skip_review_task()` in sequence, so the reviewer isn't left
  holding a task they've already decided isn't reviewable — **Skip** calls
  `skip_review_task()` alone. All four ultimately call only the four
  Step 7A/7B database functions — never a direct table write.
- **Never exposes another reviewer.** Every query the app makes is scoped
  to the signed-in user's own id (`data.js`'s `getMyActiveTask`/
  `getMyCompletedCount`), and that's enforced twice over: the client code
  filters by it, *and* Step 7A's RLS policies would block a leak even if
  the client code had a bug — see `supabase/tests/04_reviewer_privacy.sql`.
  Progress is shown as a bare count ("12 reviewed"), never a list, never
  another reviewer's name or task.
- **Graceful error handling**: a lost claim race (someone else finished
  the mosque first) silently fetches a fresh task with a one-line
  explanation rather than dead-ending; a network failure shows a
  retry button; an expired/invalid session drops back to the login screen
  automatically (both via `onAuthStateChange`'s `SIGNED_OUT` event and via
  catching auth-coded errors from any RPC call).

## Persistence across refresh/reload

Two independent things persist, both already-real Supabase behavior, not
anything this app invented:
1. **The Supabase session** — `supabase-js` persists it in `localStorage`
   by default and auto-refreshes the token; `getSession()` on page load
   picks it back up with no re-login needed.
2. **The claimed task itself** — it's a real row in `review_tasks` with
   `status='claimed'`, not app/browser state. `getMyActiveTask()` on load
   finds it again regardless of which device/tab/browser the reviewer
   uses next.

## Files

```
index.html, style.css      — shell + styling (adapted from Step 6B's proven design)
app.js                     — UI rendering + event wiring (the only file with DOM code)
data.js                    — Supabase calls, wrapped for testability (see below)
coord-utils.js             — pure coordinate parsing/formatting (no Supabase, no DOM)
config.example.js          — copy to config.js (gitignored) with your real project URL/anon key
.assetsignore              — files Wrangler must never upload in a Cloudflare Pages deploy
CLOUDFLARE_DEPLOY.md        — Cloudflare Pages direct-upload steps + security checklist
tests/
  coord-utils.test.mjs     — node:test, pure-function tests
  data.test.mjs            — node:test, data.js tested against a mock Supabase client
  mock-supabase.mjs        — the mock used above
  fake-supabase-js.mjs     — a stateful fake used only by the Playwright browser test (see report.md)
  test-config.js           — fake credentials for the same browser test
```

## Running it locally

```bash
cd mosque-db-pipeline/review-app
cp config.example.js config.js   # fill in your real Supabase project URL + anon key
python3 -m http.server 8901      # any static file server works — no build step
# open http://127.0.0.1:8901/
```

## Deploying

Any static host works — this is plain files, no build step. **For
Cloudflare Pages direct upload specifically, see
[CLOUDFLARE_DEPLOY.md](./CLOUDFLARE_DEPLOY.md)** — exact file list,
`.assetsignore`, and a pre-flight security checklist.

For any other static host:

```bash
# Netlify / Vercel / GitHub Pages / Supabase Hosting / a bucket — pick one:
netlify deploy --dir=mosque-db-pipeline/review-app --prod
# or just upload the directory's contents (minus config.example.js) anywhere
# that serves static files over HTTPS.
```

Before deploying, in your Supabase project's dashboard:
1. Run `supabase/migrations/0001-0005` in order (`supabase db push`, or
   paste each into the SQL editor).
2. Run `supabase/local-test-harness/0001_wire_auth_trigger.sql`'s one
   `create trigger on_auth_user_created ...` line once, manually.
3. Run the Step 7A data import (`scripts/migrate_to_supabase.py` +
   `output/migrate_data.sql`) if you haven't already.
4. Under **Authentication → Providers**, email/password sign-up is on by
   default — decide whether to require email confirmation (the app
   handles both: a confirmation-required project shows "check your email"
   after sign-up instead of logging straight in).
5. Put your project's real URL + anon key in `config.js`.

## Tests

- `npm test` (or `node --test`) — 36 unit tests for `data.js`/`coord-utils.js`
  against a mock Supabase client (no network, no live project needed).
- The database-level guarantees this app depends on (claim concurrency,
  ownership, RLS privacy, admin access, the 58 completed reviews staying
  completed) are Step 7A's `supabase/tests/` suite, extended with one more
  script (`07_claim_next_concurrency.sh`) specifically for the new
  `claim_next_review_task()` function this app's "Next mosque" button
  calls — run via `supabase/tests/run_all_tests.sh`.
- A full real-browser run (Playwright, network-level Supabase mocking) was
  used during development to catch DOM-level bugs no unit test could see
  — see `report.md` for what it caught and confirmed. It's not checked in
  as a repeatable test (would need a Playwright dependency this project
  doesn't otherwise have) — the coverage it validated is captured in the
  unit tests plus this report.
