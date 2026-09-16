#!/usr/bin/env python3
"""Finds likely duplicate *pairs* within the already-reviewed/verified
mosque_records set itself — as opposed to 05b, which checks reviewed NSDI
records against the still-unmatched DMRCA pool. This catches a different
failure mode: two independently-reviewed records (regardless of original
source — nsdi/dmrca/osm) that turn out to be the same physical building,
most commonly because NSDI's own survey layer had two adjacent points for
one mosque, or a reviewer added real coordinates to a standalone DMRCA
registration that happens to be the same building as an already-reviewed
NSDI point nearby.

Once a record is reviewed/verified, it has real, human-confirmed
coordinates regardless of which source it started from — so this check
uses actual distance (haversine) as the primary signal, which is far more
reliable than the name+district-only matching 05_match.py/05b have to
fall back on for records that never got real coordinates. Name similarity
(reusing 05_match.py's own core_name/name_score) is a secondary,
tier-raising signal, not required on its own.

Read-only: cross-checks live Supabase data against itself, makes no
database changes.

Input: mosque-db-pipeline/scripts/live_all_verified.tsv (id, name,
district, latitude, longitude) — every verification_status='verified'
mosque_records row, any source. Regenerate before running:

  psql "$DATABASE_URL" -t -A -F $'\t' -c "
  select id, name, district, latitude, longitude
  from public.mosque_records
  where verification_status = 'verified' and name is not null
    and latitude is not null and longitude is not null
  order by id;" > scripts/live_all_verified.tsv
"""
from __future__ import annotations

import csv
import json
import math
import sys
from pathlib import Path
from importlib.util import spec_from_file_location, module_from_spec

BASE = Path(__file__).resolve().parent.parent
IN_TSV = Path(__file__).resolve().parent / "live_all_verified.tsv"
OUT_JSON = BASE / "report" / "intra-reviewed-duplicate-candidates.json"
OUT_MD = BASE / "report" / "intra-reviewed-duplicate-candidates.md"

# Distance tiers (meters) — real building/GPS/survey jitter easily
# accounts for tens of meters; beyond ~400m two records need a very
# strong name match to be worth a look at all, since Sri Lanka has many
# genuinely distinct, densely-packed, identically-named mosques (see
# 05_match.py's own documented "26 different Mohideen Jumma Mosque
# registrations" finding).
VERY_CLOSE_M = 50
CLOSE_M = 150
FAR_M = 400

spec = spec_from_file_location("match05", Path(__file__).resolve().parent / "05_match.py")
m = module_from_spec(spec)
sys.modules["match05"] = m
spec.loader.exec_module(m)


def haversine_m(lat1, lon1, lat2, lon2) -> float:
    r = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def load(path: Path) -> list[dict]:
    rows = []
    with path.open(encoding="utf-8") as f:
        for line in csv.reader(f, delimiter="\t"):
            if len(line) != 5:
                continue
            rid, name, district, lat, lon = line
            rows.append({
                "id": rid, "name": name, "district": district,
                "latitude": float(lat), "longitude": float(lon),
                "coreName": m.core_name(name),
            })
    return rows


def tier_for(distance_m: float, name_score: float) -> str | None:
    if distance_m <= VERY_CLOSE_M:
        return "high"
    if distance_m <= CLOSE_M:
        return "high" if name_score >= 85 else "medium"
    if distance_m <= FAR_M:
        return "medium" if name_score >= 93 else ("low" if name_score >= 70 else None)
    return None


def main():
    records = load(IN_TSV)

    # Bucket by ~0.01deg (~1km) lat/lon grid cell so we only compare pairs
    # in the same or adjacent cells — avoids an O(n^2) full scan needlessly
    # comparing e.g. a Jaffna record against a Galle one, though at n=378
    # the brute force would finish instantly anyway; this just keeps it
    # trivially cheap if the reviewed set grows much larger.
    def cell(r):
        return (round(r["latitude"], 2), round(r["longitude"], 2))

    from collections import defaultdict
    buckets: dict[tuple, list[dict]] = defaultdict(list)
    for r in records:
        buckets[cell(r)].append(r)

    seen_pairs = set()
    results = []
    for r in records:
        lat_cell, lon_cell = cell(r)
        for dlat in (-1, 0, 1):
            for dlon in (-1, 0, 1):
                for other in buckets.get((lat_cell + dlat, lon_cell + dlon), []):
                    if other["id"] >= r["id"]:
                        continue  # each unordered pair exactly once, deterministic order
                    pair_key = (other["id"], r["id"])
                    if pair_key in seen_pairs:
                        continue
                    seen_pairs.add(pair_key)

                    dist = haversine_m(r["latitude"], r["longitude"], other["latitude"], other["longitude"])
                    if dist > FAR_M:
                        continue
                    score = m.name_score(r["coreName"], other["coreName"]) if r["coreName"] and other["coreName"] else 0.0
                    tier = tier_for(dist, score)
                    if tier is None:
                        continue
                    results.append({
                        "idA": other["id"], "nameA": other["name"], "districtA": other["district"],
                        "idB": r["id"], "nameB": r["name"], "districtB": r["district"],
                        "distanceM": round(dist, 1),
                        "nameScore": round(score, 1),
                        "tier": tier,
                    })

    results.sort(key=lambda x: (-{"high": 2, "medium": 1, "low": 0}[x["tier"]], x["distanceM"]))

    from collections import Counter
    tiers = Counter(r["tier"] for r in results)

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")

    lines = [
        "# Duplicate candidates within the already-reviewed set",
        "",
        f"Pairwise check across all {len(records)} `verification_status='verified'`",
        f"`mosque_records` rows (any source — nsdi/dmrca/osm mixed), using real",
        f"human-confirmed coordinates (haversine distance) as the primary signal",
        f"and name similarity as a secondary, tier-raising one. Thresholds:",
        f"<= {VERY_CLOSE_M}m always flagged high; <= {CLOSE_M}m high if names are",
        f"similar (>=85) else medium; <= {FAR_M}m only flagged at all if the name",
        f"match is very strong (medium at >=93, low at >=70). Nothing beyond",
        f"{FAR_M}m is considered, regardless of name.",
        "",
        f"- Total candidate pairs: {len(results)}",
        f"  - high: {tiers.get('high', 0)}",
        f"  - medium: {tiers.get('medium', 0)}",
        f"  - low: {tiers.get('low', 0)}",
        "",
        "No database changes made — this is a report for human confirmation.",
        "",
        "| Tier | Dist (m) | Name score | Record A | Record B |",
        "|---|---|---|---|---|",
    ]
    for r in results:
        lines.append(
            f"| {r['tier']} | {r['distanceM']} | {r['nameScore']} "
            f"| [{r['idA']}] {r['nameA']} ({r['districtA']}) "
            f"| [{r['idB']}] {r['nameB']} ({r['districtB']}) |"
        )
    OUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"Verified records checked: {len(records)}")
    print(f"Candidate duplicate pairs: {len(results)}  high={tiers.get('high',0)} medium={tiers.get('medium',0)} low={tiers.get('low',0)}")
    print(f"Wrote {OUT_JSON}")
    print(f"Wrote {OUT_MD}")


if __name__ == "__main__":
    main()
