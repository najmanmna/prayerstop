# Mosque Database — Step 3 Pipeline (free geocoding POC)

Standalone, outside the PrayerStop app. No app source touched. No API keys
needed (Nominatim and Photon are both open/keyless). Google Geocoding
excluded per the task.

## Run order

```
scripts/01_sample_records.py     # 100 stratified DMRCA records -> output/sample-100.json
scripts/02_geocode_nominatim.py  # ~3-4 min (rate-limited 1 req/sec, cascading fallback)
scripts/03_geocode_photon.py     # ~2-3 min (rate-limited 1 req/sec)
scripts/04_analyze.py            # cross-check vs NSDI + both geocoders, classify, summarize
```

## Output

- `output/sample-100.json` — the 100 sampled DMRCA records (with an added
  `addressQuality` heuristic field).
- `output/geocode-results.json` — raw Nominatim responses (top 3 candidates
  per record, plus which fallback pass succeeded).
- `output/geocode-results-photon.json` — raw Photon responses, same shape.
- `output/analysis.json` — the merged per-record classification
  (`likely_correct` / `ambiguous` / `failed`) plus the summary stats the
  report is built from.
- `report/report.md` — full write-up: methodology, headline numbers,
  precision breakdown, NSDI cross-check, good/bad examples, and the
  accuracy/scalability verdict for the full 2,389-record dataset.

See `report/report.md` for the full findings.
