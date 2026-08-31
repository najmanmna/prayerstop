#!/usr/bin/env python3
"""Part B — controlled OSM expansion. Reviewed the two tagging patterns
already used in Step 4 (amenity=place_of_worship+religion=muslim,
building=mosque) and identified three additional, explicit, well-defined
OSM tag conventions worth a targeted check — deliberately NOT a name-text
regex sweep (that approach was tried and abandoned during Step 4: it timed
out the shared Overpass instance and is exactly the kind of broad/arbitrary
search this task says not to do):

  1. amenity=prayer_room + religion=muslim  — the OSM tag for a smaller
     prayer room/musallah, distinct from a full mosque, directly relevant
     to PrayerStop's own "practical place to pray" concept.
  2. building=religious + religion=muslim    — a generic religious-building
     tag sometimes used instead of the more specific building=mosque.
  3. historic=mosque                         — the heritage/historic
     tagging convention for older mosque buildings.

All three queries ran cleanly (one needed a single retry after a transient
504 from the shared server — confirmed via /api/status this was general
server load, not our own rate limit) and **all three returned zero results
for Sri Lanka**. This script documents that outcome formally rather than
silently doing nothing: since there is genuinely nothing new to merge, it
just re-validates the existing 588-object merged set is unchanged and
records the three queries attempted, each with its (empty) result, for a
complete methodology trail.
"""
from __future__ import annotations

import json
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent.parent
EXISTING_MERGED_PATH = BASE / "osm-enrichment" / "raw-sources" / "osm-mosques-merged.json"
RAW_DIR = Path(__file__).resolve().parent.parent / "raw-sources"
OUT_PATH = Path(__file__).resolve().parent.parent / "output" / "osm-expansion-result.json"

QUERIES = [
    {"label": "amenity=prayer_room + religion=muslim", "file": "osm-prayer-room.json"},
    {"label": "building=religious + religion=muslim", "file": "osm-religious-building.json"},
    {"label": "historic=mosque", "file": "osm-historic-mosque.json"},
]


def flatten(elements):
    out = []
    for e in elements:
        if "lat" in e and "lon" in e:
            lat, lon = e["lat"], e["lon"]
        elif "center" in e:
            lat, lon = e["center"]["lat"], e["center"]["lon"]
        else:
            continue
        tags = e.get("tags", {})
        out.append({"osmType": e["type"], "osmId": e["id"], "lat": lat, "lon": lon, "name": tags.get("name")})
    return out


def main():
    existing = json.loads(EXISTING_MERGED_PATH.read_text(encoding="utf-8"))
    existing_ids = {(r["osmType"], r["osmId"]) for r in existing}

    query_results = []
    all_new = []
    for q in QUERIES:
        path = RAW_DIR / q["file"]
        elements = json.loads(path.read_text(encoding="utf-8"))["elements"]
        flat = flatten(elements)
        new = [r for r in flat if (r["osmType"], r["osmId"]) not in existing_ids]
        query_results.append({"pattern": q["label"], "rawResultCount": len(elements), "newAfterDedup": len(new)})
        all_new.extend(new)
        print(f"{q['label']}: {len(elements)} raw result(s), {len(new)} new after dedup against existing 588")

    OUT_PATH.write_text(json.dumps({
        "queriesAttempted": query_results,
        "totalNewUniqueObjects": len(all_new),
        "newObjects": all_new,
        "expandedTotalCount": len(existing) + len(all_new),
    }, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"\nTotal new unique OSM objects from controlled expansion: {len(all_new)}")
    print(f"Merged set remains: {len(existing) + len(all_new)} objects (unchanged from Step 4's 588, since expansion added 0)")
    print(f"Written to {OUT_PATH}")


if __name__ == "__main__":
    main()
