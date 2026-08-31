# Mosque Database — Step 6A Report: Master Dataset Foundation

Standalone, entirely under `scratchpad/mosque-db-pipeline/master/`. No
PrayerStop app, database schema, or Supabase instance was touched — this is
a staging dataset, not yet imported anywhere.

See `SCHEMA.md` for the full field-by-field schema, entity-resolution
design, and confidence/verification rules. This report covers the record
counts and the review queue.

## What was built

| File | Contents |
|---|---|
| `output/master-dataset.json` | The full normalized dataset, 3,685 records — the source of truth. |
| `output/master-dataset.csv` | The same data, spreadsheet-friendly (nested `sources` kept as a JSON column for full fidelity). |
| `output/review-queue.json` / `.csv` | The 518 `needs_review` records, prioritized. |
| `SCHEMA.md` | Full schema documentation. |

## Record counts

### By entity group

| Group | Count | Has coordinates? |
|---|---:|---|
| NSDI-anchored | 970 | Yes (all) |
| DMRCA-only | 2,322 | No (none — not geocoded, per Step 3's finding that free geocoding isn't reliable enough to auto-populate this) |
| OSM-only | 393 | Yes (all) |
| **Total** | **3,685** | **1,363 (37.0%)** |

### By confidence

| Confidence | Count | % |
|---|---:|---:|
| high | 188 | 5.1% |
| medium | 333 | 9.0% |
| low | 3,164 | 85.9% |

### By verification status

| Status | Count | % |
|---|---:|---:|
| verified | 0 | 0% — never set automatically, see `SCHEMA.md` |
| needs_review | 518 | 14.1% |
| unverified | 3,167 | 85.9% |

### Cross-tab

| | verified | needs_review | unverified |
|---|---:|---:|---:|
| **high** | 0 | 188 | 0 |
| **medium** | 0 | 66 | 267 |
| **low** | 0 | 264 | 2,900 |

Every `high`-confidence record is in the review queue — none of them can
reach `verified` without a human, but none of them are sitting idle as
`unverified` either; the automated pipeline already did everything it can
for them. The 267 `medium`/`unverified` records are OSM-only records with a
real specific name but no corroborating match — plausible, but genuinely
nothing further to check automatically, so they wait for either a future
source or direct field verification rather than a review click.

### Other counts

- Records with a usable name: 3,028 / 3,685 (82.2%)
- Records with a DMRCA registration number: 2,388 / 3,685
- Records with 2+ sources: 254
- Records with all 3 sources (NSDI+DMRCA+OSM): **8**

## Review queue

518 records, split into two genuinely different kinds of work:

| Review type | Count | What it means |
|---|---:|---|
| **quick_confirm** | 227 | Strong automated signal (high/medium confidence, no open conflict) — a reviewer just needs to glance and confirm to promote it to `verified`. |
| **conflict_to_resolve** | 291 | An actual judgment call — a rejected low-confidence DMRCA candidate or a name-conflicting OSM candidate is attached in `notes`, and a human needs to decide whether it's really the same place. |

Priority score = confidence tier × 100 + source count × 10 + 5 if a
conflict note exists — ranks strong multi-source records first (fastest,
highest-value confirms), without letting a bare unresolved conflict alone
outrank a solid triple-corroborated match.

**Top 10 priority records** (full list in `output/review-queue.json`):

| Rank | Type | Id | Name | District | Why |
|---|---|---|---|---|---|
| 1 | quick_confirm | nsdi-16027 | BAITHUL MUBARAK BUKHARI THAKKIYA | Kalutara | 3 sources, high confidence |
| 2 | quick_confirm | nsdi-17967 | AL - MASJIDUL MUNEER | Ampara | 3 sources, high confidence |
| 3 | quick_confirm | nsdi-18539 | MARADANA MOSQUE | Colombo | 3 sources, high confidence |
| 4 | quick_confirm | nsdi-18963 | THALDUWA JUMMA MOSQUE | Kegalle | 3 sources, high confidence |
| 5 | quick_confirm | nsdi-19030 | MUTWAL JUMMA MOSQUE | Colombo | 3 sources, high confidence |
| 6 | quick_confirm | nsdi-20227 | RADDOLUGAMA JUMMAH MOSQUE | Gampaha | 3 sources, high confidence |
| 7 | quick_confirm | nsdi-21297 | KATUKELLE JUMMA MOSQUE | Kandy | 3 sources, high confidence |
| 8 | quick_confirm | nsdi-21883 | AL MASJITHUL ILAHI | Ampara | 3 sources, high confidence |
| 9 | conflict_to_resolve | nsdi-14694 | PORWAI JUMMAH MOSQUE | Matara | 2 sources (NSDI+OSM) high confidence, but a rejected low-confidence DMRCA candidate needs a decision |
| 10 | conflict_to_resolve | nsdi-15683 | Ketchimale Mosque | Kalutara | 2 sources, high confidence, but DMRCA's "KACHCHIMALAI SHRINE" candidate (likely the same place under a different transliteration — see Step 4) needs a human's judgment |

Ranks 1–8 are exactly the 8 triple-corroborated records — the highest-value
targets in the whole dataset: confirming these 8 is the fastest path to
real `verified` records.

## What's deliberately not in this dataset

- **No Supabase import** — this is a staging JSON/CSV pair only, per the
  task.
- **No coordinates invented for DMRCA-only records** — Step 3 already
  showed free geocoding isn't trustworthy enough to auto-fill 2,322 blanks.
- **No facility data invented** — `womenPrayer`/`parking`/
  `airConditioning`/`wudu`/`jummah` are null on every record; none of
  NSDI/DMRCA/OSM's actual captured fields carry this for Sri Lanka mosques
  (checked, not assumed — see `SCHEMA.md`).
- **No `verified` records** — that status is reserved for an actual human
  decision, which is exactly what the review queue exists to collect.

## Next step

Work the review queue (`output/review-queue.json`), starting with the 8
triple-corroborated `quick_confirm` records — the review action itself
(setting `verificationStatus: "verified"`, `verifiedAt`, and any confirmed
facility data) is a Step 6B concern, not done here.
