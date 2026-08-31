#!/usr/bin/env python3
"""Step 6A — builds the single normalized master dataset from the existing
Steps 1-5 outputs. Pure local computation; no new network calls, no new
matching logic (reuses Step 2's NSDI<->DMRCA matches and Step 4's
NSDI<->OSM matches exactly as already computed and vetted).

Entity-resolution design (see master/SCHEMA.md for the full rationale):
one master record per real-world prayer place, built as the union of three
groups so no source record is ever silently dropped:

  A) NSDI-ANCHORED (970) — one record per NSDI point (the coordinate
     backbone, ground-surveyed). Enriched with its Step 2 DMRCA match and
     Step 4 OSM match, but ONLY when that match is high/medium confidence
     — a low-confidence/ambiguous "match" is evidence of a POSSIBLE link,
     not a confirmed one, and is never silently merged in as if it were
     (see "do not force matches", carried over from Steps 2/4/5).
  B) DMRCA-ONLY (2,322) — every DMRCA record NOT merged into group A: the
     2,207 Step 2 never matched anything, plus the 115 that only had a
     LOW-confidence NSDI candidate (kept separate, not merged, but the
     rejected candidate is preserved as a note for a human reviewer).
     No coordinates (never geocoded here — Step 3 found free geocoding too
     unreliable to auto-populate this table; that stays a future/manual
     step).
  C) OSM-ONLY (393) — every merged OSM object (Step 4, 588 total) NOT
     merged into group A: 358 that had no NSDI point within the match
     radius at all, plus 35 that had a same-district NSDI point nearby but
     with a NAME CONFLICT (Step 4's `ambiguous` tier) — kept as their own
     record rather than force-linked, with the contested NSDI id preserved
     as a note.

970 + 2322 + 393 = 3685 total master records.

Facility fields (womenPrayer/parking/airConditioning/wudu/jummah): checked
every tag key present across the raw OSM dump (script output, not
guessed) — none of NSDI/DMRCA/OSM's actual captured fields carry this
information for Sri Lanka mosques. All five are therefore null on every
record, exactly as instructed ("must initially be null unless supported by
a source") — not a placeholder oversight.
"""
from __future__ import annotations

import csv
import json
import re
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent.parent
OUT_DIR = Path(__file__).resolve().parent.parent / "output"
OUT_DIR.mkdir(parents=True, exist_ok=True)

NSDI_PATH = BASE / "raw-sources" / "nsdi" / "nsdi-mosques-with-district.json"
DMRCA_RAW_PATH = BASE / "raw-sources" / "dmrca" / "dmrca-mosques-raw.json"
DMRCA_MATCHES_PATH = BASE / "normalized" / "matches.json"
OSM_MERGED_PATH = BASE / "osm-enrichment" / "raw-sources" / "osm-mosques-merged.json"
OSM_MATCHES_PATH = BASE / "osm-enrichment" / "output" / "nsdi-osm-matches.json"

GENERIC_NAMES = {"mosque", "masjid", "jumma mosque", "jumma masjid", "jame mosque", "palli"}


def is_usable_name(name):
    return bool(name) and name.strip().lower() not in GENERIC_NAMES


def sanitize_id_fragment(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "-", value.strip()).strip("-")


def build_source_entry_nsdi(n):
    return {
        "type": "nsdi",
        "id": str(n["objectid"]),
        "buildingId": n.get("buildingId"),
        "originalName": n["name"],
        "latitude": n["latitude"],
        "longitude": n["longitude"],
        "district": n["district"],
        "note": "Sri Lanka NSDI 'Place of Worship' layer, ground-surveyed point geometry.",
    }


def build_source_entry_dmrca(d):
    return {
        "type": "dmrca",
        "id": d["registrationNo"],
        "originalName": d["name"],
        "address": d["address"],
        "city": d["city"],
        "district": d["district"],
        "mosqueType": d["type"],
        "sourcePdf": d["sourcePdfFile"],
        "sourcePdfUrl": d["sourcePdfUrl"],
        "note": "Department of Muslim Religious and Cultural Affairs Registered Mosque List.",
    }


def build_source_entry_osm(o):
    return {
        "type": "osm",
        "id": f"{o['osmType']}/{o['osmId']}",
        "osmLink": f"https://www.openstreetmap.org/{o['osmType']}/{o['osmId']}",
        "originalName": o["name"],
        "nameTa": o.get("nameTa"),
        "nameSi": o.get("nameSi"),
        "latitude": o["lat"],
        "longitude": o["lon"],
        "addrCity": o.get("addrCity"),
        "addrStreet": o.get("addrStreet"),
        "sourceQuery": o.get("sourceQuery"),
        "note": "OpenStreetMap, ODbL-licensed (© OpenStreetMap contributors).",
    }


def main():
    nsdi = json.loads(NSDI_PATH.read_text(encoding="utf-8"))
    dmrca_raw = json.loads(DMRCA_RAW_PATH.read_text(encoding="utf-8"))
    dmrca_matches = json.loads(DMRCA_MATCHES_PATH.read_text(encoding="utf-8"))
    osm_merged = json.loads(OSM_MERGED_PATH.read_text(encoding="utf-8"))
    osm_matches = json.loads(OSM_MATCHES_PATH.read_text(encoding="utf-8"))

    dmrca_by_regno = {}
    for d in dmrca_raw:
        dmrca_by_regno.setdefault(d["registrationNo"], []).append(d)

    dmrca_match_by_nsdi = {int(m["nsdiId"]): m for m in dmrca_matches}
    osm_match_by_nsdi = {r["nsdiObjectId"]: r for r in osm_matches}
    osm_by_key = {(o["osmType"], o["osmId"]): o for o in osm_merged}

    used_dmrca_regnos = set()   # merged into an NSDI-anchored record (high/medium only)
    used_osm_keys = set()       # merged into an NSDI-anchored record (high/medium only)
    low_conf_dmrca_by_regno = {}  # regNo -> nsdi match record, for note-only linkage

    for m in dmrca_matches:
        if m["matchConfidence"] in ("high", "medium"):
            used_dmrca_regnos.add(m["dmrcaRegistrationNo"])
        else:
            low_conf_dmrca_by_regno[m["dmrcaRegistrationNo"]] = m

    for r in osm_matches:
        if r["confidence"] in ("high", "medium") and r["osmObject"]:
            used_osm_keys.add((r["osmObject"]["osmType"], r["osmObject"]["osmId"]))

    records = []

    # --- Group A: NSDI-anchored (970) ---
    for n in nsdi:
        oid = n["objectid"]
        sources = [build_source_entry_nsdi(n)]
        notes = []

        dmrca_match = dmrca_match_by_nsdi.get(oid)
        dmrca_conf = dmrca_match["matchConfidence"] if dmrca_match and dmrca_match["matchConfidence"] in ("high", "medium") else None
        dmrca_record = None
        if dmrca_conf:
            candidates = dmrca_by_regno.get(dmrca_match["dmrcaRegistrationNo"], [])
            dmrca_record = candidates[0] if candidates else None
            if dmrca_record:
                sources.append(build_source_entry_dmrca(dmrca_record))
        elif dmrca_match:  # low-confidence — not merged, but noted
            notes.append(
                f"A low-confidence DMRCA candidate exists (registrationNo={dmrca_match['dmrcaRegistrationNo']}, "
                f"name='{dmrca_match['name']}', score={dmrca_match['matchScore']}) — not linked, needs manual review."
            )

        osm_match = osm_match_by_nsdi.get(oid)
        osm_conf = osm_match["confidence"] if osm_match and osm_match["confidence"] in ("high", "medium") else None
        osm_obj = None
        if osm_conf and osm_match["osmObject"]:
            key = (osm_match["osmObject"]["osmType"], osm_match["osmObject"]["osmId"])
            osm_obj = osm_by_key.get(key)
            if osm_obj:
                sources.append(build_source_entry_osm(osm_obj))
        elif osm_match and osm_match["confidence"] == "ambiguous" and osm_match["osmObject"]:
            notes.append(
                f"An ambiguous OSM candidate exists ({osm_match['osmObject']['osmType']}/{osm_match['osmObject']['osmId']}, "
                f"name='{osm_match['osmObject']['name']}', {osm_match['distanceM']}m away) — {osm_match['reason']} Not linked, needs manual review."
            )

        # --- name/address/district resolution priority: DMRCA (official
        # registration) > OSM (community-mapped, often more specific) > NSDI ---
        name = None
        if dmrca_record and is_usable_name(dmrca_record["name"]):
            name = dmrca_record["name"]
        elif osm_obj and is_usable_name(osm_obj["name"]):
            name = osm_obj["name"]
        elif is_usable_name(n["name"]):
            name = n["name"]

        address = dmrca_record["address"] if dmrca_record else None
        district = (dmrca_record["district"] if dmrca_record else None) or n["district"]

        # --- confidence / verificationStatus ---
        if dmrca_conf == "high" or osm_conf == "high":
            confidence, status = "high", "needs_review"
        elif dmrca_conf == "medium" or osm_conf == "medium":
            confidence, status = "medium", "needs_review"
        elif notes:  # an ambiguous/low-confidence candidate exists — flagged, but not confirmed
            confidence, status = "low", "needs_review"
        else:
            confidence, status = "low", "unverified"

        records.append({
            "id": f"nsdi-{oid}",
            "name": name,
            "latitude": n["latitude"],
            "longitude": n["longitude"],
            "district": district,
            "address": address,
            "dmrcaRegistrationNo": dmrca_record["registrationNo"] if dmrca_record else None,
            "sources": sources,
            "confidence": confidence,
            "verificationStatus": status,
            "verifiedAt": None,
            "womenPrayer": None, "parking": None, "airConditioning": None, "wudu": None, "jummah": None,
            "notes": "; ".join(notes) if notes else None,
        })

    # --- Group B: DMRCA-only standalone (2,322) ---
    seen_regno_counts = {}
    for d in dmrca_raw:
        regno = d["registrationNo"]
        if regno in used_dmrca_regnos:
            continue
        seen_regno_counts[regno] = seen_regno_counts.get(regno, 0) + 1
        suffix = f"-{seen_regno_counts[regno]}" if seen_regno_counts[regno] > 1 else ""
        rec_id = f"dmrca-{sanitize_id_fragment(regno)}{suffix}"

        notes = []
        low_match = low_conf_dmrca_by_regno.get(regno)
        confidence, status = "low", "unverified"
        if low_match:
            notes.append(
                f"A low-confidence NSDI candidate exists (nsdiId={low_match['nsdiId']}, "
                f"name='{low_match['nsdiName']}', score={low_match['matchScore']}) — not linked, needs manual review."
            )
            status = "needs_review"

        records.append({
            "id": rec_id,
            "name": d["name"] if is_usable_name(d["name"]) else None,
            "latitude": None,
            "longitude": None,
            "district": d["district"],
            "address": d["address"],
            "dmrcaRegistrationNo": regno,
            "sources": [build_source_entry_dmrca(d)],
            "confidence": confidence,
            "verificationStatus": status,
            "verifiedAt": None,
            "womenPrayer": None, "parking": None, "airConditioning": None, "wudu": None, "jummah": None,
            "notes": "; ".join(notes) if notes else None,
        })

    # --- Group C: OSM-only standalone (393) ---
    ambiguous_osm_reason = {}
    for r in osm_matches:
        if r["confidence"] == "ambiguous" and r["osmObject"]:
            key = (r["osmObject"]["osmType"], r["osmObject"]["osmId"])
            ambiguous_osm_reason[key] = r

    for o in osm_merged:
        key = (o["osmType"], o["osmId"])
        if key in used_osm_keys:
            continue
        rec_id = f"osm-{o['osmType']}-{o['osmId']}"
        ambiguous = ambiguous_osm_reason.get(key)
        notes = []
        if ambiguous:
            notes.append(
                f"Nearest NSDI point (id={ambiguous['nsdiObjectId']}, name='{ambiguous['nsdiName']}') is "
                f"{ambiguous['distanceM']}m away — {ambiguous['reason']} Not linked, needs manual review."
            )
            confidence, status = "low", "needs_review"
        else:
            confidence = "medium" if is_usable_name(o["name"]) else "low"
            status = "unverified"

        records.append({
            "id": rec_id,
            "name": o["name"] if is_usable_name(o["name"]) else None,
            "latitude": o["lat"],
            "longitude": o["lon"],
            "district": None,  # OSM addr:city is not a reliable district; left for a future enrichment pass
            "address": o.get("addrStreet"),
            "dmrcaRegistrationNo": None,
            "sources": [build_source_entry_osm(o)],
            "confidence": confidence,
            "verificationStatus": status,
            "verifiedAt": None,
            "womenPrayer": None, "parking": None, "airConditioning": None, "wudu": None, "jummah": None,
            "notes": "; ".join(notes) if notes else None,
        })

    out_path = OUT_DIR / "master-dataset.json"
    out_path.write_text(json.dumps(records, indent=2, ensure_ascii=False), encoding="utf-8")

    from collections import Counter
    conf_counts = Counter(r["confidence"] for r in records)
    status_counts = Counter(r["verificationStatus"] for r in records)
    print(f"Total master records: {len(records)}")
    print(f"  NSDI-anchored: {len(nsdi)}")
    print(f"  DMRCA-only: {len(dmrca_raw) - len(used_dmrca_regnos)}")
    print(f"  OSM-only: {len(osm_merged) - len(used_osm_keys)}")
    print(f"Confidence: {dict(conf_counts)}")
    print(f"Verification status: {dict(status_counts)}")
    print(f"Written to {out_path}")


if __name__ == "__main__":
    main()
