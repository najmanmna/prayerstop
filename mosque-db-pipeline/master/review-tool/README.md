# Mosque Database — Step 6B: Internal Review Tool

A private, local, single-user tool for manually reviewing the 518
`needs_review` records from Step 6A's master dataset. **Not part of the
PrayerStop app, not deployed anywhere, not connected to Supabase.**

Zero external dependencies to run — pure Python 3 stdlib backend
(`http.server`), vanilla JS frontend, no `npm install`/build step. The only
network access at runtime is the browser loading Leaflet.js + OpenStreetMap
map tiles from their public CDNs for the location map.

## Run it

```bash
cd mosque-db-pipeline/master/review-tool
python3 scripts/00_prepare_review_data.py   # run once (or after re-running Step 6A) to build data/review-data.json
python3 server.py
```

Then open **http://127.0.0.1:8765/** in a browser. Stop with Ctrl+C.

The prep script does one-time local computation only (joins the existing
Step 1–6A outputs, all already on disk) — no network calls, safe to re-run
any time the upstream master dataset changes.

## What it does

- Shows the 518 `needs_review` records **one at a time**, in three fixed
  priority tiers: the 8 triple-corroborated records first, then the
  remaining `quick_confirm` records, then all `conflict_to_resolve`
  records — exactly the order the task specified, built explicitly (not
  left to a raw priority-score sort, which doesn't reliably keep the tiers
  separate — see the comment at the top of `scripts/00_prepare_review_data.py`).
- Every record has two view modes, toggled at the top of the page:

  **⚡ Coordinate check (default)** — the fast path for verifying just the
  location. Shows the mosque name, the DMRCA-sourced address/city/district,
  and the current coordinates; an **Open in Google Maps** button (name +
  address, opens in a new tab); one input where you paste whatever Google
  Maps gives you (`6.024733676809003, 80.21743036899329`) — it's parsed
  live as latitude/longitude, range-validated (-90..90 / -180..180, plus a
  non-blocking warning if it's well outside Sri Lanka — likely a copy
  mistake), and shown against the current coordinate's distance so you know
  before saving whether it'll register as unchanged or a correction. A
  small map shows the current pin and, once you've pasted something
  different, a second "proposed" pin so you can see both before committing.
  **Save** logs the decision as `verify` if the pasted point is within 1m
  of the current one, or `correct` (with the real previous/new lat/lon) if
  it's different — then auto-advances to the next record. **Skip** and
  **Invalid** are both one click away and also auto-advance.

  **Full review** — the original detailed view: proposed identity fields
  (editable via *Correct…*), the interactive map, every source's original
  values with clickable NSDI/DMRCA/OSM identifiers (OSM links to
  openstreetmap.org, DMRCA links to the original government PDF), and
  **candidate comparison** — every linked source AND every rejected
  candidate (a low-confidence DMRCA match, or a name-conflicting OSM match
  from Steps 2/4) shown side by side with real distance-in-meters and
  name-similarity numbers, pulled directly from the original match files,
  never re-parsed from the English `notes` sentence.
- Five actions, available from both modes: **Verify**, **Correct…** (full
  mode only — inline edit of name/district/address/coordinates),
  **Reject candidate** (full mode, per candidate card — does *not* verify
  the record, since rejecting a candidate and confirming the base record's
  own identity are different decisions), **Skip / review later**, and
  **Invalid** (flags the record as not a legitimate/reviewable mosque
  record — logged distinctly, does *not* touch `verificationStatus`, shows
  as a red banner + red sidebar dot until a later Verify/Correct clears it;
  deliberately does **not** introduce a 4th `verificationStatus` value, to
  keep Step 6A's documented schema contract — `master/SCHEMA.md` — intact).
- Five facility fields (women's prayer area, parking, air conditioning,
  wudu, jummah), each a three-state Yes/No/Unknown toggle, defaulting to
  Unknown exactly as the master dataset has them.
- Progress shown as **"Verified X / 518"** in the top bar at all times.

## Persistence — how it stays lightweight but real

- **`master/review-results/review-log.jsonl`** — append-only. Every review
  action writes one line: `recordId`, `decision`, `reviewer`, `reviewedAt`,
  `changes` (an array of `{field, previousValue, newValue}` — only fields
  that actually changed), any `candidateDecision`, and an optional
  reviewer `note`. **This file is never rewritten or truncated by the
  server, only appended to** — it's the actual, permanent provenance
  record.
- **`master/review-results/review-state.json`** — a derived cache (current
  effective value per field per record), rebuilt by replaying the log
  every time the server starts or handles a request. Safe to delete at any
  time; it regenerates from the log.
- **Nothing under `master/output/` or any other Step 1–6A output is ever
  written to.** The server only reads those. `master-dataset.json` stays
  exactly as Step 6A produced it — a future step (turning reviewed
  decisions into an updated dataset) would read the log and produce a
  *new* file, never overwrite the original.
- **`master/review-results/.backups/`** — timestamped copies of
  `review-log.jsonl`, made before any risky change to this tool's own code.
  Not written to automatically during normal review use (only when the
  tool itself is being modified) — a manual extra safety net on top of the
  append-only log, not a replacement for it.

## Files

```
review-tool/
  server.py                          — the whole backend (stdlib http.server)
  scripts/00_prepare_review_data.py  — one-time data prep (candidates + tier ordering)
  data/review-data.json              — prep script's output, read by the server
  static/
    index.html, app.js, style.css    — the frontend
../review-results/
  review-log.jsonl                   — append-only audit log (created on first review action)
  review-state.json                  — derived cache (regenerable)
```
