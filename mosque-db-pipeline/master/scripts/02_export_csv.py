#!/usr/bin/env python3
"""Exports the master JSON dataset as CSV. The `sources` array (nested,
provenance-preserving) doesn't flatten losslessly into CSV columns, so this
keeps both: convenience columns (nsdiId/dmrcaRegNo/osmId/sourceTypes) for
quick filtering in a spreadsheet, PLUS a `sourcesJson` column with the
complete nested detail — the CSV is a view, the JSON file remains the
source of truth."""
from __future__ import annotations

import csv
import json
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent.parent / "output"
IN_PATH = OUT_DIR / "master-dataset.json"
OUT_PATH = OUT_DIR / "master-dataset.csv"

COLUMNS = [
    "id", "name", "latitude", "longitude", "district", "address", "dmrcaRegistrationNo",
    "confidence", "verificationStatus", "verifiedAt",
    "womenPrayer", "parking", "airConditioning", "wudu", "jummah",
    "notes", "sourceTypes", "nsdiId", "osmId", "sourcesJson",
]


def main():
    records = json.loads(IN_PATH.read_text(encoding="utf-8"))
    with open(OUT_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        for r in records:
            source_types = ",".join(sorted({s["type"] for s in r["sources"]}))
            nsdi_id = next((s["id"] for s in r["sources"] if s["type"] == "nsdi"), None)
            osm_id = next((s["id"] for s in r["sources"] if s["type"] == "osm"), None)
            writer.writerow({
                "id": r["id"], "name": r["name"], "latitude": r["latitude"], "longitude": r["longitude"],
                "district": r["district"], "address": r["address"], "dmrcaRegistrationNo": r["dmrcaRegistrationNo"],
                "confidence": r["confidence"], "verificationStatus": r["verificationStatus"], "verifiedAt": r["verifiedAt"],
                "womenPrayer": r["womenPrayer"], "parking": r["parking"], "airConditioning": r["airConditioning"],
                "wudu": r["wudu"], "jummah": r["jummah"], "notes": r["notes"],
                "sourceTypes": source_types, "nsdiId": nsdi_id, "osmId": osm_id,
                "sourcesJson": json.dumps(r["sources"], ensure_ascii=False),
            })
    print(f"Wrote {len(records)} rows to {OUT_PATH}")


if __name__ == "__main__":
    main()
