# Mosque Database — Step 4 Pipeline (OSM spatial enrichment)

Standalone, outside the PrayerStop app. No app source touched. No API keys
needed (Overpass API is open/keyless). Google not used.

## Run order

```
scripts/01_fetch_osm_mosques.sh    # 2 Overpass area queries -> raw-sources/osm-mosques-{raw,building-tag}.json
scripts/02_merge_osm_mosques.py    # dedupe -> raw-sources/osm-mosques-merged.json (588 objects)
scripts/03_match_osm_to_nsdi.py    # radius search + 1:1 assignment -> output/nsdi-osm-matches.json
scripts/04_crossref_dmrca.py       # join against ../normalized/matches.json (Step 2) -> output/combined-analysis.json
```

Step 01's queries were already run manually during this session (rate-limit
cooldown handled interactively); the script documents the exact reproducible
method for provenance. Steps 02-04 are pure local computation, no network
calls, safe to re-run freely.

## Output

- `raw-sources/osm-mosques-merged.json` — 588 deduped OSM mosque objects
  (541 via `religion=muslim`, 47 via `building=mosque` supplemental).
- `output/nsdi-osm-matches.json` — one row per NSDI point: nearest OSM
  candidate (if any within 300m), distance, name score, confidence tier
  (`high`/`medium`/`ambiguous`/`no_match`), and the reason for that tier.
- `output/combined-analysis.json` — joined against Step 2's DMRCA matches;
  the name-gain, corroboration, and three-way name-agreement numbers the
  report is built from.
- `report/report.md` — full write-up.

See `report/report.md` for the full findings and verdict.
