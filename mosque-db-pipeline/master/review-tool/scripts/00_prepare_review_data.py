#!/usr/bin/env python3
"""Prepares review-tool/data/review-data.json — the 518 needs_review records
from Step 6A's master dataset, each enriched with a structured `candidates`
array (pulled from the ORIGINAL Step 2/4 match files, not re-parsed from
English `notes` text) so the review UI can show real side-by-side distance/
name-similarity numbers instead of just a sentence.

Also fixes the queue ordering into three explicit, non-overlapping tiers —
Step 6A's review-queue.json sorts by a continuous priority score that
*mostly* produces "triple-corroborated, then quick_confirm, then
conflict_to_resolve" but isn't guaranteed to (a high-confidence 2-source
conflict_to_resolve can out-score a 2-source quick_confirm on raw points).
This script builds the tiers explicitly instead of trusting score ordering
to keep them separate.

Read-only against every existing Steps 1-6A output — writes only into this
review-tool's own data/ directory.
"""
from __future__ import annotations

import json
from pathlib import Path

PIPELINE_ROOT = Path(__file__).resolve().parent.parent.parent.parent
MASTER_DIR = PIPELINE_ROOT / "master"
OUT_DIR = Path(__file__).resolve().parent.parent / "data"
OUT_DIR.mkdir(parents=True, exist_ok=True)

MASTER_DATASET_PATH = MASTER_DIR / "output" / "master-dataset.json"
REVIEW_QUEUE_PATH = MASTER_DIR / "output" / "review-queue.json"

NSDI_PATH = PIPELINE_ROOT / "raw-sources" / "nsdi" / "nsdi-mosques-with-district.json"
DMRCA_RAW_PATH = PIPELINE_ROOT / "raw-sources" / "dmrca" / "dmrca-mosques-raw.json"
DMRCA_MATCHES_PATH = PIPELINE_ROOT / "normalized" / "matches.json"
OSM_MERGED_PATH = PIPELINE_ROOT / "osm-enrichment" / "raw-sources" / "osm-mosques-merged.json"
OSM_MATCHES_PATH = PIPELINE_ROOT / "osm-enrichment" / "output" / "nsdi-osm-matches.json"


def main():
    master = {r["id"]: r for r in json.loads(MASTER_DATASET_PATH.read_text(encoding="utf-8"))}
    queue = json.loads(REVIEW_QUEUE_PATH.read_text(encoding="utf-8"))

    nsdi_by_id = {n["objectid"]: n for n in json.loads(NSDI_PATH.read_text(encoding="utf-8"))}
    dmrca_by_regno = {}
    for d in json.loads(DMRCA_RAW_PATH.read_text(encoding="utf-8")):
        dmrca_by_regno.setdefault(d["registrationNo"], []).append(d)
    all_dmrca_matches = json.loads(DMRCA_MATCHES_PATH.read_text(encoding="utf-8"))
    dmrca_match_by_nsdi = {int(m["nsdiId"]): m for m in all_dmrca_matches}
    dmrca_low_match_by_regno = {m["dmrcaRegistrationNo"]: m for m in all_dmrca_matches if m["matchConfidence"] == "low"}
    osm_by_key = {(o["osmType"], o["osmId"]): o for o in json.loads(OSM_MERGED_PATH.read_text(encoding="utf-8"))}
    all_osm_matches = json.loads(OSM_MATCHES_PATH.read_text(encoding="utf-8"))
    osm_match_by_nsdi = {r["nsdiObjectId"]: r for r in all_osm_matches}
    osm_ambiguous_by_key = {
        (r["osmObject"]["osmType"], str(r["osmObject"]["osmId"])): r
        for r in all_osm_matches if r["confidence"] == "ambiguous" and r["osmObject"]
    }

    def haversine_m(lat1, lon1, lat2, lon2):
        import math
        r = 6371000.0
        p1, p2 = math.radians(lat1), math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dl = math.radians(lon2 - lon1)
        a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
        return 2 * r * math.asin(math.sqrt(a))

    enriched = []
    for q in queue:
        rec_id = q["id"]
        rec = master[rec_id]
        candidates = []

        # Already-LINKED sources (rec["sources"] beyond the anchor) are the
        # corroborating evidence behind a quick_confirm — surface them as
        # "linked" candidates too, so the UI can show every source side by
        # side uniformly, whether linked or rejected.
        anchor_type = "nsdi" if rec_id.startswith("nsdi-") else ("dmrca" if rec_id.startswith("dmrca-") else "osm")
        for s in rec["sources"]:
            if s["type"] == anchor_type and len(rec["sources"]) == 1:
                continue  # the sole anchor source, not a "candidate" to compare against
            entry = {"status": "linked", "sourceType": s["type"], "sourceId": s["id"], "name": s.get("originalName")}
            if "latitude" in s and s["latitude"] is not None and rec["latitude"] is not None:
                entry["distanceM"] = round(haversine_m(rec["latitude"], rec["longitude"], s["latitude"], s["longitude"]), 1)
            if s["type"] == "dmrca":
                entry["address"] = s.get("address")
                entry["city"] = s.get("city")
                # Pull the precomputed name score from Step 2's match record.
                dm = dmrca_match_by_nsdi.get(int(rec_id.split("-")[1])) if rec_id.startswith("nsdi-") else None
                if dm:
                    entry["nameScore"] = dm["matchScore"]
            if s["type"] == "osm":
                om = osm_match_by_nsdi.get(int(rec_id.split("-")[1])) if rec_id.startswith("nsdi-") else None
                if om:
                    entry["nameScore"] = om["nameScore"]
                    entry["distanceM"] = om["distanceM"]
                entry["osmLink"] = s.get("osmLink")
            candidates.append(entry)

        # REJECTED candidates — pulled fresh from the original match files,
        # not re-parsed from the `notes` sentence.
        if rec_id.startswith("nsdi-"):
            nsdi_obj_id = int(rec_id.split("-")[1])
            dm = dmrca_match_by_nsdi.get(nsdi_obj_id)
            if dm and dm["matchConfidence"] == "low":
                d_records = dmrca_by_regno.get(dm["dmrcaRegistrationNo"], [])
                d = d_records[0] if d_records else None
                candidates.append({
                    "status": "rejected_low_confidence", "sourceType": "dmrca", "sourceId": dm["dmrcaRegistrationNo"],
                    "name": dm["name"], "address": d["address"] if d else None, "city": d["city"] if d else None,
                    "nameScore": dm["matchScore"],
                })
            om = osm_match_by_nsdi.get(nsdi_obj_id)
            if om and om["confidence"] == "ambiguous" and om["osmObject"]:
                candidates.append({
                    "status": "rejected_ambiguous", "sourceType": "osm", "sourceId": f"{om['osmObject']['osmType']}/{om['osmObject']['osmId']}",
                    "name": om["osmObject"]["name"], "distanceM": om["distanceM"], "nameScore": om["nameScore"],
                    "reason": om["reason"],
                    "osmLink": f"https://www.openstreetmap.org/{om['osmObject']['osmType']}/{om['osmObject']['osmId']}",
                })
        elif rec_id.startswith("dmrca-"):
            regno = rec["dmrcaRegistrationNo"]
            match = dmrca_low_match_by_regno.get(regno)
            if match:
                nsdi_pt = nsdi_by_id.get(int(match["nsdiId"]))
                candidates.append({
                    "status": "rejected_low_confidence", "sourceType": "nsdi", "sourceId": str(match["nsdiId"]),
                    "name": nsdi_pt["name"] if nsdi_pt else None,
                    "latitude": nsdi_pt["latitude"] if nsdi_pt else None,
                    "longitude": nsdi_pt["longitude"] if nsdi_pt else None,
                    "nameScore": match["matchScore"],
                })
        elif rec_id.startswith("osm-"):
            osm_type, osm_id = rec_id.split("-", 2)[1], rec_id.split("-", 2)[2]
            match = osm_ambiguous_by_key.get((osm_type, osm_id))
            if match:
                candidates.append({
                    "status": "rejected_ambiguous", "sourceType": "nsdi", "sourceId": str(match["nsdiObjectId"]),
                    "name": match["nsdiName"], "latitude": match["nsdiLat"], "longitude": match["nsdiLon"],
                    "distanceM": match["distanceM"], "reason": match["reason"],
                })

        enriched.append({**rec, "candidates": candidates, "reviewType": q["reviewType"], "priorityReason": q["priorityReason"]})

    # --- Explicit 3-tier ordering ---
    triple = [r for r in enriched if len(r["sources"]) == 3]
    quick_rest = [r for r in enriched if r["reviewType"] == "quick_confirm" and len(r["sources"]) != 3]
    conflicts = [r for r in enriched if r["reviewType"] == "conflict_to_resolve"]
    assert len(triple) + len(quick_rest) + len(conflicts) == len(enriched), "tier partition must cover every record exactly once"

    def by_score(items):
        return sorted(items, key=lambda r: next(q["priorityRank"] for q in queue if q["id"] == r["id"]))

    triple_ids = {r["id"] for r in triple}
    quick_rest_ids = {r["id"] for r in quick_rest}
    ordered = by_score(triple) + by_score(quick_rest) + by_score(conflicts)
    for i, r in enumerate(ordered, 1):
        r["queuePosition"] = i
        r["tier"] = "triple_corroborated" if r["id"] in triple_ids else ("quick_confirm" if r["id"] in quick_rest_ids else "conflict_to_resolve")

    out_path = OUT_DIR / "review-data.json"
    out_path.write_text(json.dumps(ordered, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Tier 1 (triple-corroborated): {len(triple)}")
    print(f"Tier 2 (quick_confirm, rest): {len(quick_rest)}")
    print(f"Tier 3 (conflict_to_resolve): {len(conflicts)}")
    print(f"Total: {len(ordered)}")
    print(f"Written to {out_path}")


if __name__ == "__main__":
    main()
