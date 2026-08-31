#!/usr/bin/env python3
"""Cross-references the NSDI<->OSM matches (script 03) against Step 2's
existing NSDI<->DMRCA matches (mosque-db-pipeline/normalized/matches.json),
joined on the shared nsdiId, and computes the final Step 4 reporting
numbers: how many NSDI points gain a useful name from OSM, how many are
corroborated by BOTH OSM and DMRCA independently, and how many remain
unnamed/unverified by anything."""
from __future__ import annotations

import json
from pathlib import Path

from rapidfuzz import fuzz
import re

BASE = Path(__file__).resolve().parent.parent
OSM_MATCHES_PATH = BASE / "output" / "nsdi-osm-matches.json"
DMRCA_MATCHES_PATH = BASE.parent / "normalized" / "matches.json"
NSDI_PATH = BASE.parent / "raw-sources" / "nsdi" / "nsdi-mosques-with-district.json"
OUT_PATH = BASE / "output" / "combined-analysis.json"

GENERIC_NAMES = {"mosque", "masjid", "jumma mosque", "jumma masjid", "jame mosque", "palli"}
CORE_STOPWORDS = {
    "MOSQUE", "MASJID", "MASJIDUL", "MASJITHUL", "MASJIDUS", "MASJIDUR", "MASJIDUN", "MASJIDHUL",
    "JUMMA", "JUMMAH", "JUMA", "JAME", "JAMEA",
    "PALLI", "PALLIVASAL", "ZAVIA", "ZAVIATHUL", "THAKKIYA", "DHARGA", "DHARGAH", "SHRINE",
    "GRAND", "TOWN", "NEW", "THE", "OLD", "CENTRAL",
    "AL", "UL", "US", "UN", "UR", "UD",
}


def normalize_text(value):
    if not value:
        return ""
    value = value.upper()
    value = re.sub(r"[^A-Z0-9\s]", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def core_name(value):
    tokens = [t for t in normalize_text(value).split(" ") if t and t not in CORE_STOPWORDS]
    return " ".join(tokens)


def is_usable_name(name):
    if not name:
        return False
    n = name.strip().lower()
    return n not in GENERIC_NAMES and bool(core_name(name))


def name_score(a, b):
    ca, cb = core_name(a), core_name(b)
    if not ca or not cb:
        return None
    return max(fuzz.token_sort_ratio(ca, cb), fuzz.token_set_ratio(ca, cb))


def main():
    osm_matches = {r["nsdiObjectId"]: r for r in json.loads(OSM_MATCHES_PATH.read_text(encoding="utf-8"))}
    dmrca_matches_list = json.loads(DMRCA_MATCHES_PATH.read_text(encoding="utf-8"))
    dmrca_by_nsdi = {int(m["nsdiId"]): m for m in dmrca_matches_list}
    nsdi = json.loads(NSDI_PATH.read_text(encoding="utf-8"))

    rows = []
    for n in nsdi:
        oid = n["objectid"]
        osm = osm_matches.get(oid)
        dmrca = dmrca_by_nsdi.get(oid)

        nsdi_had_usable_name = is_usable_name(n["name"])
        osm_high_or_medium = osm and osm["confidence"] in ("high", "medium") and osm["osmObject"] and osm["osmObject"]["name"]
        gained_name_from_osm = (not nsdi_had_usable_name) and bool(osm_high_or_medium)

        three_way_name_score = None
        three_way_agree = None
        if osm_high_or_medium and dmrca:
            three_way_name_score = name_score(osm["osmObject"]["name"], dmrca["name"])
            three_way_agree = three_way_name_score is not None and three_way_name_score >= 70

        corroborated_osm_dmrca = bool(osm and osm["confidence"] == "high" and dmrca is not None)

        rows.append({
            "nsdiObjectId": oid,
            "nsdiName": n["name"],
            "nsdiDistrict": n["district"],
            "nsdiHadUsableName": nsdi_had_usable_name,
            "osmConfidence": osm["confidence"] if osm else None,
            "osmName": osm["osmObject"]["name"] if osm and osm["osmObject"] else None,
            "osmDistanceM": osm["distanceM"] if osm else None,
            "gainedNameFromOsm": gained_name_from_osm,
            "dmrcaMatch": (
                {
                    "registrationNo": dmrca["dmrcaRegistrationNo"],
                    "name": dmrca["name"],
                    "confidence": dmrca["matchConfidence"],
                }
                if dmrca else None
            ),
            "corroboratedByOsmHighAndDmrca": corroborated_osm_dmrca,
            "threeWayNameScore": round(three_way_name_score, 1) if three_way_name_score is not None else None,
            "threeWayNamesAgree": three_way_agree,
        })

    # --- Summary ---
    total = len(rows)
    gained_name = sum(1 for r in rows if r["gainedNameFromOsm"])
    corroborated = sum(1 for r in rows if r["corroboratedByOsmHighAndDmrca"])
    corroborated_broad = sum(1 for r in rows if r["osmConfidence"] == "high" and r["dmrcaMatch"] is not None)
    had_name_originally = sum(1 for r in rows if r["nsdiHadUsableName"])
    has_name_now = sum(1 for r in rows if r["nsdiHadUsableName"] or r["gainedNameFromOsm"])
    still_unnamed = total - has_name_now
    unverified = sum(
        1 for r in rows
        if r["osmConfidence"] in (None, "no_match", "ambiguous") and r["dmrcaMatch"] is None
    )

    three_way_checked = [r for r in rows if r["threeWayNameScore"] is not None]
    three_way_disagree = [r for r in three_way_checked if not r["threeWayNamesAgree"]]

    summary = {
        "totalNsdiPoints": total,
        "hadUsableNameOriginally": had_name_originally,
        "gainedUsableNameFromOsm": gained_name,
        "hasUsableNameNow": has_name_now,
        "stillUnnamed": still_unnamed,
        "corroboratedByOsmHighConfidenceAndAnyDmrcaMatch": corroborated_broad,
        "corroboratedByOsmHighAndDmrca_strict": corroborated,
        "completelyUnverified_noOsmMatch_noDmrcaMatch": unverified,
        "threeWayComparisons": len(three_way_checked),
        "threeWayNameDisagreements": len(three_way_disagree),
    }

    OUT_PATH.write_text(json.dumps({"summary": summary, "rows": rows}, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    print(f"\nWritten to {OUT_PATH}")


if __name__ == "__main__":
    main()
