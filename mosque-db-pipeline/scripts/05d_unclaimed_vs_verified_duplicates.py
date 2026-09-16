#!/usr/bin/env python3
"""The check that actually shrinks the pending review queue: for every
UNCLAIMED review_task whose mosque_record already has a name+coordinates
(i.e. a candidate a reviewer hasn't gotten to yet, but which already has
enough data to compare), check it against the 378 already-VERIFIED
records by distance + name. A high-confidence hit means: don't make a
reviewer redo this one — it's very likely the same building as something
already reviewed, so the task can be retired once a human confirms it,
saving that review outright rather than just tidying data after the fact.

05c checked verified-vs-verified (data cleanup, already-spent reviewer
time). This checks unclaimed-vs-verified (future reviewer time not yet
spent) — genuinely different in what confirming it buys you.

Read-only. Makes no database changes.

Inputs (regenerate before running — see each file's own header comment
for the exact psql export):
  scripts/live_unclaimed_with_coords.tsv  (mosque_id, name, district, lat, lon, task_id)
  scripts/live_all_verified.tsv           (id, name, district, lat, lon)
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path
from importlib.util import spec_from_file_location, module_from_spec

BASE = Path(__file__).resolve().parent.parent
UNCLAIMED_TSV = Path(__file__).resolve().parent / "live_unclaimed_with_coords.tsv"
VERIFIED_TSV = Path(__file__).resolve().parent / "live_all_verified.tsv"
OUT_JSON = BASE / "report" / "unclaimed-vs-verified-duplicate-candidates.json"
OUT_MD = BASE / "report" / "unclaimed-vs-verified-duplicate-candidates.md"

VERY_CLOSE_M = 50
CLOSE_M = 150
FAR_M = 400

spec = spec_from_file_location("match05", Path(__file__).resolve().parent / "05_match.py")
m = module_from_spec(spec)
sys.modules["match05"] = m
spec.loader.exec_module(m)

spec_c = spec_from_file_location("intra05c", Path(__file__).resolve().parent / "05c_intra_reviewed_duplicates.py")
c = module_from_spec(spec_c)
sys.modules["intra05c"] = c
spec_c.loader.exec_module(c)  # reuse haversine_m + tier_for exactly as-is


def load_unclaimed(path: Path) -> list[dict]:
    rows = []
    with path.open(encoding="utf-8") as f:
        for line in csv.reader(f, delimiter="\t"):
            if len(line) != 6:
                continue
            mid, name, district, lat, lon, task_id = line
            rows.append({
                "id": mid, "name": name, "district": district,
                "latitude": float(lat), "longitude": float(lon),
                "taskId": task_id, "coreName": m.core_name(name),
            })
    return rows


def load_verified(path: Path) -> list[dict]:
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


def main():
    unclaimed = load_unclaimed(UNCLAIMED_TSV)
    verified = load_verified(VERIFIED_TSV)

    results = []
    for u in unclaimed:
        best = None
        for v in verified:
            if v["id"] == u["id"]:
                continue
            dist = c.haversine_m(u["latitude"], u["longitude"], v["latitude"], v["longitude"])
            if dist > FAR_M:
                continue
            score = m.name_score(u["coreName"], v["coreName"]) if u["coreName"] and v["coreName"] else 0.0
            tier = c.tier_for(dist, score)
            if tier is None:
                continue
            if best is None or dist < best["distanceM"]:
                best = {
                    "unclaimedTaskId": u["taskId"], "unclaimedMosqueId": u["id"], "unclaimedName": u["name"],
                    "verifiedMosqueId": v["id"], "verifiedName": v["name"],
                    "district": u["district"], "distanceM": round(dist, 1), "nameScore": round(score, 1), "tier": tier,
                }
        if best:
            results.append(best)

    results.sort(key=lambda x: (-{"high": 2, "medium": 1, "low": 0}[x["tier"]], x["distanceM"]))
    from collections import Counter
    tiers = Counter(r["tier"] for r in results)

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")

    lines = [
        "# Unclaimed tasks that are likely duplicates of already-verified records",
        "",
        f"Checked {len(unclaimed)} unclaimed review_tasks (of {len(unclaimed)} that already",
        f"have both a name and coordinates — the rest can't be checked this way",
        f"until a reviewer looks at them) against all {len(verified)} verified records.",
        f"Same distance+name tiering as the intra-reviewed check.",
        "",
        f"- Total candidates: {len(results)}",
        f"  - high: {tiers.get('high', 0)}",
        f"  - medium: {tiers.get('medium', 0)}",
        f"  - low: {tiers.get('low', 0)}",
        "",
        "Confirming a `high` row here means that task can be retired without a",
        "reviewer ever needing to touch it — it's very likely the same building",
        "as something already done. No tasks have been touched yet.",
        "",
        "| Tier | Dist (m) | Score | Unclaimed task | Already-verified match |",
        "|---|---|---|---|---|",
    ]
    for r in results:
        lines.append(
            f"| {r['tier']} | {r['distanceM']} | {r['nameScore']} "
            f"| [{r['unclaimedMosqueId']}] {r['unclaimedName']} (task {r['unclaimedTaskId'][:8]}…) "
            f"| [{r['verifiedMosqueId']}] {r['verifiedName']} |"
        )
    OUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"Unclaimed (with name+coords) checked: {len(unclaimed)}")
    print(f"Candidates: {len(results)}  high={tiers.get('high',0)} medium={tiers.get('medium',0)} low={tiers.get('low',0)}")
    print(f"Wrote {OUT_JSON}")
    print(f"Wrote {OUT_MD}")


if __name__ == "__main__":
    main()
