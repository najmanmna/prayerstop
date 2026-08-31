#!/usr/bin/env python3
"""Part A — District coverage table. Pure local computation joining three
existing outputs on the shared nsdiId/objectid, no new network calls:
  - raw-sources/nsdi/nsdi-mosques-with-district.json   (Step 2: district assignment)
  - osm-enrichment/output/nsdi-osm-matches.json         (Step 4: NSDI<->OSM, per point)
  - normalized/matches.json                             (Step 2: NSDI<->DMRCA, per matched point)
  - osm-enrichment/output/combined-analysis.json         (Step 4: OSM+DMRCA corroboration flags)

"Usable verified identity" (the summary percentage) is defined precisely,
not just "has a name": an NSDI point counts only if it (a) has a real name
from ANY source (its own NSDI name, or one gained from a high/medium OSM
match) AND (b) that identity is corroborated by at least one independent
external signal (an OSM high/medium match, or a DMRCA high/medium match).
A name alone, with nothing checking it, is not treated as "verified" —
consistent with this project's conservative stance throughout Steps 2-4.
"""
from __future__ import annotations

import json
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent.parent
NSDI_PATH = BASE / "raw-sources" / "nsdi" / "nsdi-mosques-with-district.json"
OSM_MATCHES_PATH = BASE / "osm-enrichment" / "output" / "nsdi-osm-matches.json"
DMRCA_MATCHES_PATH = BASE / "normalized" / "matches.json"
COMBINED_PATH = BASE / "osm-enrichment" / "output" / "combined-analysis.json"
OUT_DIR = Path(__file__).resolve().parent.parent / "output"
OUT_DIR.mkdir(parents=True, exist_ok=True)

GENERIC_NAMES = {"mosque", "masjid", "jumma mosque", "jumma masjid", "jame mosque", "palli"}

# All 25 official Sri Lankan districts, used explicitly (rather than derived
# from which districts happen to appear in the NSDI data) so that a district
# with ZERO NSDI points — a real, important finding in its own right — shows
# up as a visible gap instead of silently disappearing from the table.
ALL_25_DISTRICTS = [
    "Ampara", "Anuradhapura", "Badulla", "Batticaloa", "Colombo", "Galle", "Gampaha",
    "Hambantota", "Jaffna", "Kalutara", "Kandy", "Kegalle", "Kilinochchi", "Kurunegala",
    "Mannar", "Matale", "Matara", "Moneragala", "Mullaitivu", "Nuwara Eliya", "Polonnaruwa",
    "Puttalam", "Ratnapura", "Trincomalee", "Vavuniya",
]


def is_usable_name(name):
    return bool(name) and name.strip().lower() not in GENERIC_NAMES


def main():
    nsdi = json.loads(NSDI_PATH.read_text(encoding="utf-8"))
    osm_by_nsdi = {r["nsdiObjectId"]: r for r in json.loads(OSM_MATCHES_PATH.read_text(encoding="utf-8"))}
    dmrca_by_nsdi = {int(m["nsdiId"]): m for m in json.loads(DMRCA_MATCHES_PATH.read_text(encoding="utf-8"))}
    combined_by_nsdi = {r["nsdiObjectId"]: r for r in json.loads(COMBINED_PATH.read_text(encoding="utf-8"))["rows"]}

    districts = ALL_25_DISTRICTS
    table = {d: {
        "nsdiPoints": 0, "nsdiUsableNames": 0,
        "osmHigh": 0, "osmMedium": 0,
        "dmrcaHighMedium": 0,
        "tripleCorroborated": 0,
        "usableVerifiedIdentity": 0,
    } for d in districts}

    for n in nsdi:
        d = n["district"]
        if not d:
            continue
        row = table[d]
        row["nsdiPoints"] += 1
        if is_usable_name(n["name"]):
            row["nsdiUsableNames"] += 1

        osm = osm_by_nsdi.get(n["objectid"])
        if osm and osm["confidence"] == "high":
            row["osmHigh"] += 1
        elif osm and osm["confidence"] == "medium":
            row["osmMedium"] += 1

        dmrca = dmrca_by_nsdi.get(n["objectid"])
        if dmrca and dmrca["matchConfidence"] in ("high", "medium"):
            row["dmrcaHighMedium"] += 1

        combined = combined_by_nsdi.get(n["objectid"])
        if combined and combined["corroboratedByOsmHighAndDmrca"]:
            row["tripleCorroborated"] += 1

        has_name = is_usable_name(n["name"]) or (combined and combined["gainedNameFromOsm"])
        is_verified = bool(osm and osm["confidence"] in ("high", "medium")) or bool(dmrca and dmrca["matchConfidence"] in ("high", "medium"))
        if has_name and is_verified:
            row["usableVerifiedIdentity"] += 1

    for d, row in table.items():
        row["usableVerifiedIdentityPct"] = round(100 * row["usableVerifiedIdentity"] / row["nsdiPoints"], 1) if row["nsdiPoints"] else 0.0

    OUT_PATH = OUT_DIR / "district-coverage.json"
    OUT_PATH.write_text(json.dumps(table, indent=2, ensure_ascii=False), encoding="utf-8")

    # Print a readable table sorted by verified-identity % descending.
    header = f"{'District':<14}{'NSDI':>6}{'Named':>7}{'OSM-H':>7}{'OSM-M':>7}{'DMRCA':>7}{'Triple':>8}{'Verified%':>11}"
    print(header)
    print("-" * len(header))
    for d, row in sorted(table.items(), key=lambda kv: -kv[1]["usableVerifiedIdentityPct"]):
        print(f"{d:<14}{row['nsdiPoints']:>6}{row['nsdiUsableNames']:>7}{row['osmHigh']:>7}{row['osmMedium']:>7}"
              f"{row['dmrcaHighMedium']:>7}{row['tripleCorroborated']:>8}{row['usableVerifiedIdentityPct']:>10}%")

    total_nsdi = sum(r["nsdiPoints"] for r in table.values())
    total_verified = sum(r["usableVerifiedIdentity"] for r in table.values())
    print(f"\nNational: {total_verified}/{total_nsdi} = {100*total_verified/total_nsdi:.1f}% usable verified identity")
    print(f"Written to {OUT_PATH}")


if __name__ == "__main__":
    main()
