# Mosque Database — Step 6A (master dataset foundation)

Standalone, outside the PrayerStop app. No app source, database schema, or
Supabase instance touched. Pure local computation — no network calls, safe
to re-run freely against the existing Step 1–5 outputs.

## Run order

```
scripts/01_build_master_dataset.py   # unions NSDI/DMRCA/OSM -> output/master-dataset.json (3,685 records)
scripts/02_export_csv.py             # -> output/master-dataset.csv
scripts/03_build_review_queue.py     # -> output/review-queue.{json,csv} (518 prioritized records)
```

## Output

- `output/master-dataset.json` — the source of truth.
- `output/master-dataset.csv` — spreadsheet view (nested `sources` kept as
  a JSON column).
- `output/review-queue.json` / `.csv` — the 518 `needs_review` records,
  ranked by priority, split into `quick_confirm` vs `conflict_to_resolve`.
- `SCHEMA.md` — full field-by-field schema, entity-resolution design
  (why 3,685 records, not 970 or 2,389), and the confidence/verification
  rules.
- `report.md` — record counts and the review queue write-up.

See `SCHEMA.md` for the schema and `report.md` for the numbers.
