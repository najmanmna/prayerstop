# Mosque Database — Step 5 Pipeline (coverage analysis + controlled OSM expansion)

Standalone, outside the PrayerStop app. No app source, database schema, or
API architecture touched. No new API keys.

## Run order

```
scripts/01_district_coverage.py   # pure local join of Steps 1/2/4 outputs -> output/district-coverage.json
scripts/02_expand_osm.py          # dedups the 3 new-tag query results against Step 4's 588 -> output/osm-expansion-result.json
```

Script 02 depends on three raw Overpass query results already saved in
`raw-sources/` (`osm-prayer-room.json`, `osm-religious-building.json`,
`osm-historic-mosque.json`) — fetched manually during this session using the
same rate-limit-respecting method as Step 4 (2 concurrent slots/IP,
descriptive User-Agent, one query retried once after a transient 504). All
three returned zero results for Sri Lanka — a real finding (Step 4's two
original tag patterns already have comprehensive tag-convention coverage),
not a placeholder.

## Output

- `output/district-coverage.json` — all 25 districts × 7 metrics (NSDI
  points, usable names, OSM-high/medium, DMRCA-high/medium, triple-
  corroborated, verified-identity %).
- `output/osm-expansion-result.json` — the three new-pattern query outcomes
  (all empty) and confirmation the merged OSM set is unchanged at 588.
- `report/report.md` — full write-up: the district table with strong/weak
  district analysis, the expansion findings, and the Colombo/Western-
  Province-pilot recommendation with explicit district-level reasoning.

See `report/report.md` for the full findings and the final recommendation.
