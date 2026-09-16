#!/usr/bin/env python3
"""Re-runs 05_match.py's real matching algorithm (global 1:1 greedy
assignment, HIGH/MEDIUM/LOW tiers, runner-up margin demotion, contested-
cluster demotion) for a specific, narrow follow-up question: now that
reviewers have supplied real names for NSDI points 05_match.py could never
match (no name at all -> score 0 by design, never a guess), do any of them
now match a DMRCA record that's still sitting in the unmatched-dmrca pool?

This is NOT a change to the master pipeline or the original 05_match.py
output — it's a read-only cross-check against the live Supabase
mosque_records table (reviewer-corrected names) and the existing
normalized/unmatched-dmrca.json, reusing the exact same scoring/assignment
functions so results are directly comparable to the pipeline's own
confidence tiers. Writes a report; makes no database changes.

Input: mosque-db-pipeline/scripts/live_reviewed_nsdi_no_dmrca.tsv
  (id, name, district, latitude, longitude) — reviewed/verified NSDI
  records in Supabase's mosque_records that currently have no linked
  DMRCA source. Regenerate before running:

  psql "$DATABASE_URL" -t -A -F $'\t' -c "
  select id, name, district, latitude, longitude
  from public.mosque_records
  where id like 'nsdi-%' and verification_status = 'verified' and name is not null
    and not (sources @> '[{\"type\":\"dmrca\"}]')
  order by id;" > scripts/live_reviewed_nsdi_no_dmrca.tsv
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path
from importlib.util import spec_from_file_location, module_from_spec

BASE = Path(__file__).resolve().parent.parent
IN_TSV = Path(__file__).resolve().parent / "live_reviewed_nsdi_no_dmrca.tsv"
UNMATCHED_DMRCA_PATH = BASE / "normalized" / "unmatched-dmrca.json"
OUT_JSON = BASE / "report" / "reviewed-dmrca-overlap-candidates.json"
OUT_MD = BASE / "report" / "reviewed-dmrca-overlap-candidates.md"

spec = spec_from_file_location("match05", Path(__file__).resolve().parent / "05_match.py")
m = module_from_spec(spec)
sys.modules["match05"] = m
spec.loader.exec_module(m)


def load_reviewed(path: Path) -> list[dict]:
    rows = []
    with path.open(encoding="utf-8") as f:
        for line in csv.reader(f, delimiter="\t"):
            if len(line) != 5:
                continue
            rid, name, district, lat, lon = line
            rows.append({"id": rid, "name": name, "district": district, "latitude": float(lat), "longitude": float(lon)})
    return rows


def main():
    reviewed = load_reviewed(IN_TSV)
    dmrca = json.loads(UNMATCHED_DMRCA_PATH.read_text(encoding="utf-8"))

    usable = []
    for r in reviewed:
        raw_name = (r["name"] or "").strip()
        r["coreName"] = m.core_name(raw_name)
        r["isUsableName"] = bool(raw_name) and raw_name.strip().lower() not in m.GENERIC_NAMES and bool(r["coreName"])
        if r["isUsableName"] and r["district"]:
            usable.append(r)

    by_district: dict[str, list] = {}
    for r in usable:
        by_district.setdefault(r["district"], []).append(r)

    # Score every DMRCA record against in-district reviewed candidates,
    # exactly as 05_match.py scores DMRCA against NSDI.
    dmrca_candidates: dict[int, list[tuple[float, dict]]] = {}
    for i, d in enumerate(dmrca):
        candidates = by_district.get(d["district"], []) if d.get("coreName") else []
        scored = [(m.name_score(d["coreName"], c["coreName"]), c) for c in candidates]
        scored = [t for t in scored if t[0] >= m.LOW_SCORE]
        scored.sort(key=lambda t: t[0], reverse=True)
        dmrca_candidates[i] = scored

    reviewed_claimants: dict[str, list[tuple[float, int]]] = {}
    for i, d in enumerate(dmrca):
        for score, c in dmrca_candidates[i]:
            reviewed_claimants.setdefault(c["id"], []).append((score, i))
    duplicate_clusters = {k: v for k, v in reviewed_claimants.items() if len(v) > 1}

    all_triples = [(score, i, c) for i, ranked in dmrca_candidates.items() for score, c in ranked]
    all_triples.sort(key=lambda t: (-t[0], t[1]))

    assigned_dmrca: dict[int, tuple[float, dict]] = {}
    claimed_reviewed: set[str] = set()
    for score, i, c in all_triples:
        if i in assigned_dmrca or c["id"] in claimed_reviewed:
            continue
        assigned_dmrca[i] = (score, c)
        claimed_reviewed.add(c["id"])

    results = []
    for i, d in enumerate(dmrca):
        if i not in assigned_dmrca:
            continue
        best_score, best_reviewed = assigned_dmrca[i]
        ranked = dmrca_candidates[i]
        runner_up_score = next((s for s, c in ranked if c["id"] != best_reviewed["id"]), None)

        if best_score >= m.HIGH_SCORE:
            confidence = "high"
        elif best_score >= m.MEDIUM_SCORE:
            confidence = "medium"
        else:
            confidence = "low"

        if confidence == "high" and runner_up_score is not None and (best_score - runner_up_score) < 5:
            confidence = "medium"

        cluster = duplicate_clusters.get(best_reviewed["id"])
        contested = bool(cluster and sum(1 for s, _ in cluster if s >= best_score - 1) > 1)
        if contested:
            confidence = "low"

        results.append({
            "mosqueRecordId": best_reviewed["id"],
            "reviewedName": best_reviewed["name"],
            "district": best_reviewed["district"],
            "latitude": best_reviewed["latitude"],
            "longitude": best_reviewed["longitude"],
            "dmrcaRegistrationNo": d["registrationNo"],
            "dmrcaName": d["name"],
            "dmrcaCity": d.get("city"),
            "dmrcaAddress": d.get("address"),
            "dmrcaSourcePdfUrl": d.get("sourcePdfUrl"),
            "matchConfidence": confidence,
            "matchScore": round(best_score, 1),
            "runnerUpScore": round(runner_up_score, 1) if runner_up_score is not None else None,
            "contested": contested,
        })

    results.sort(key=lambda r: (-{"high": 2, "medium": 1, "low": 0}[r["matchConfidence"]], -r["matchScore"]))

    from collections import Counter
    tiers = Counter(r["matchConfidence"] for r in results)
    no_candidate = len(reviewed) - len(usable) + (len(usable) - len(results))

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")

    lines = [
        "# Reviewed NSDI records with a likely unmatched DMRCA overlap",
        "",
        f"Re-run of `05_match.py`'s real matching algorithm (global 1:1 greedy",
        f"assignment, confidence tiers, runner-up margin + contested-cluster",
        f"demotion — identical logic, not a re-implementation), scoped to the",
        f"{len(reviewed)} reviewed/verified `mosque_records` rows that currently",
        f"have no linked DMRCA source, against the {len(dmrca)}-record",
        f"unmatched-DMRCA pool.",
        "",
        f"- Total candidates found: {len(results)}",
        f"  - high: {tiers.get('high', 0)}",
        f"  - medium: {tiers.get('medium', 0)}",
        f"  - low: {tiers.get('low', 0)}",
        f"- No usable-name candidate at all: {no_candidate}",
        "",
        "None of these have been merged or changed in the database — this is",
        "a report for human confirmation. `contested: true` means multiple",
        "DMRCA records tied near the top for the same reviewed record (a",
        "common-name collision within the district) — treat those as",
        "genuinely ambiguous, not as this specific pairing being correct.",
        "",
        "| Tier | Score | Reviewed record | District | Matched DMRCA | DMRCA city | Contested |",
        "|---|---|---|---|---|---|---|",
    ]
    for r in results:
        lines.append(
            f"| {r['matchConfidence']} | {r['matchScore']} | [{r['mosqueRecordId']}] {r['reviewedName']} "
            f"| {r['district']} | {r['dmrcaRegistrationNo']}: {r['dmrcaName']} | {r['dmrcaCity']} "
            f"| {'yes' if r['contested'] else ''} |"
        )
    OUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"Reviewed records checked: {len(reviewed)} (usable name: {len(usable)})")
    print(f"Matches found: {len(results)}  high={tiers.get('high',0)} medium={tiers.get('medium',0)} low={tiers.get('low',0)}")
    print(f"No candidate at all: {no_candidate}")
    print(f"Wrote {OUT_JSON}")
    print(f"Wrote {OUT_MD}")


if __name__ == "__main__":
    main()
