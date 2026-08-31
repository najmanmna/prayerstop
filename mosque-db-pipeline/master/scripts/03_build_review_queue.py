#!/usr/bin/env python3
"""Builds the manual-verification review queue: every record with
verificationStatus == 'needs_review' (518), ranked by priority.

Two distinct reasons a record ends up in this queue, scored differently:
  - QUICK CONFIRM: strong automated signal (high/medium confidence, no open
    conflict) — reviewing these is fast and high-value, since confirming
    promotes them straight to 'verified'.
  - CONFLICT TO RESOLVE: a `notes` field is set (a rejected low-confidence
    DMRCA candidate, or an ambiguous OSM candidate) — these need an actual
    judgment call, not just a glance, but resolving them prevents a wrong
    pairing from ever entering the verified dataset.

Priority score = confidence tier (high=3/medium=2/low=1) * 100
               + source count * 10
               + 5 if it has an open conflict note (worth surfacing, but
                 never let a bare conflict alone outrank a strong
                 multi-source quick-confirm — that's why it's a small
                 addend, not a separate higher tier)
"""
from __future__ import annotations

import csv
import json
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent.parent / "output"
IN_PATH = OUT_DIR / "master-dataset.json"
OUT_JSON_PATH = OUT_DIR / "review-queue.json"
OUT_CSV_PATH = OUT_DIR / "review-queue.csv"

CONF_RANK = {"high": 3, "medium": 2, "low": 1}


def main():
    records = json.loads(IN_PATH.read_text(encoding="utf-8"))
    queue = [r for r in records if r["verificationStatus"] == "needs_review"]

    for r in queue:
        has_conflict = bool(r["notes"])
        score = CONF_RANK[r["confidence"]] * 100 + len(r["sources"]) * 10 + (5 if has_conflict else 0)
        r["_priorityScore"] = score
        r["_reviewType"] = "conflict_to_resolve" if has_conflict else "quick_confirm"
        r["_priorityReason"] = (
            f"{len(r['sources'])} source(s) ({','.join(s['type'] for s in r['sources'])}), "
            f"{r['confidence']} confidence" + (" — has an unresolved candidate to adjudicate." if has_conflict else " — corroborated, ready for a quick manual confirm.")
        )

    queue.sort(key=lambda r: -r["_priorityScore"])
    for i, r in enumerate(queue, 1):
        r["priorityRank"] = i

    # Reorder fields for readability: priority info first.
    ordered = []
    for r in queue:
        ordered.append({
            "priorityRank": r["priorityRank"],
            "reviewType": r["_reviewType"],
            "priorityReason": r["_priorityReason"],
            **{k: v for k, v in r.items() if not k.startswith("_") and k != "priorityRank"},
        })

    OUT_JSON_PATH.write_text(json.dumps(ordered, indent=2, ensure_ascii=False), encoding="utf-8")

    csv_columns = [
        "priorityRank", "reviewType", "priorityReason", "id", "name", "district", "address",
        "dmrcaRegistrationNo", "latitude", "longitude", "confidence", "notes",
    ]
    with open(OUT_CSV_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=csv_columns)
        writer.writeheader()
        for r in ordered:
            writer.writerow({k: r.get(k) for k in csv_columns})

    from collections import Counter
    type_counts = Counter(r["reviewType"] for r in ordered)
    conf_counts = Counter(r["confidence"] for r in ordered)
    print(f"Review queue: {len(ordered)} records")
    print(f"  By type: {dict(type_counts)}")
    print(f"  By confidence: {dict(conf_counts)}")
    print(f"Top 10 priority records:")
    for r in ordered[:10]:
        print(f"  #{r['priorityRank']} [{r['reviewType']}] {r['id']} '{r['name']}' ({r['district']}) — {r['priorityReason']}")
    print(f"\nWritten to {OUT_JSON_PATH} and {OUT_CSV_PATH}")


if __name__ == "__main__":
    main()
