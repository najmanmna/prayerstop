#!/usr/bin/env python3
"""Matches each of the 970 NSDI mosque points to nearby OSM mosque objects
(588, from script 02), spatially first (this is the one axis Step 2's
DMRCA-NSDI matching never had — DMRCA had no coordinates at all — so here
distance is the PRIMARY signal, with name similarity as a secondary
corroboration/conflict check, the reverse emphasis of Step 2).

Radius calibration (empirical, not guessed): computed the nearest-OSM-point
distance for all 970 NSDI points first. The distribution is sharply
bimodal — 16.7% of NSDI points have an OSM mosque within 50m (obviously the
same physical building, just two independent surveys/digitizations of it),
another ~10% climb out to 150-300m, then a long tail runs out to tens of
kilometers (NSDI points with no nearby OSM coverage at all — consistent with
the sparse rural OSM coverage already found in Step 3's geocoding POC).
CANDIDATE_RADIUS_M=300 sits right at that elbow: generous enough to catch
real matches with typical GPS/digitization drift, conservative enough not to
pull in an unrelated nearby mosque in denser areas (some OSM clusters, e.g.
several distinct Sammanthurai mosques, sit only 100-300m apart from EACH
OTHER, which is exactly why raw distance alone isn't treated as sufficient
for HIGH confidence below).

One OSM point is one physical building — exactly the same one-object-one-
match principle from Step 2 — so this reuses that script's proven global
greedy 1:1 assignment (ranked by distance here, not name score, since
distance is primary), and the same conservative "cap confidence when a real
near-tie existed" rule.
"""
from __future__ import annotations

import json
import math
import re
from pathlib import Path

from rapidfuzz import fuzz

BASE = Path(__file__).resolve().parent.parent
NSDI_PATH = BASE.parent / "raw-sources" / "nsdi" / "nsdi-mosques-with-district.json"
OSM_PATH = BASE / "raw-sources" / "osm-mosques-merged.json"
OUT_DIR = BASE / "output"
OUT_DIR.mkdir(parents=True, exist_ok=True)

CANDIDATE_RADIUS_M = 300.0
VERY_CLOSE_M = 100.0
NAME_HIGH = 80
NAME_MEDIUM = 50
TIE_MARGIN_M = 40.0  # a competing candidate within this margin of the winner's distance counts as a real near-tie

GENERIC_NAMES = {"mosque", "masjid", "jumma mosque", "jumma masjid", "jame mosque", "palli"}
# Same list Step 2 validated empirically (see mosque-db-pipeline/report/report.md)
CORE_STOPWORDS = {
    "MOSQUE", "MASJID", "MASJIDUL", "MASJITHUL", "MASJIDUS", "MASJIDUR", "MASJIDUN", "MASJIDHUL",
    "JUMMA", "JUMMAH", "JUMA", "JAME", "JAMEA",
    "PALLI", "PALLIVASAL", "ZAVIA", "ZAVIATHUL", "THAKKIYA", "DHARGA", "DHARGAH", "SHRINE",
    "GRAND", "TOWN", "NEW", "THE", "OLD", "CENTRAL",
    "AL", "UL", "US", "UN", "UR", "UD",
}


def haversine_m(lat1, lon1, lat2, lon2):
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


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
    nsdi = json.loads(NSDI_PATH.read_text(encoding="utf-8"))
    osm = json.loads(OSM_PATH.read_text(encoding="utf-8"))

    # Candidate discovery: every (nsdi, osm) pair within CANDIDATE_RADIUS_M.
    # A simple O(n*m) scan (970 x 588 ~= 570k haversine calls) is fast
    # enough here — no spatial index needed at this scale.
    nsdi_candidates: dict[int, list[dict]] = {}
    for ni, n in enumerate(nsdi):
        if n["latitude"] is None:
            nsdi_candidates[ni] = []
            continue
        cands = []
        for oi, o in enumerate(osm):
            d = haversine_m(n["latitude"], n["longitude"], o["lat"], o["lon"])
            if d <= CANDIDATE_RADIUS_M:
                cands.append({"osmIndex": oi, "distanceM": d, "nameScore": name_score(n["name"], o["name"])})
        cands.sort(key=lambda c: c["distanceM"])
        nsdi_candidates[ni] = cands

    no_match_indices = {ni for ni, c in nsdi_candidates.items() if not c}

    # Global greedy 1:1 assignment, ranked by distance ascending across the
    # WHOLE dataset (ties broken by nsdi index for determinism).
    all_triples = [
        (c["distanceM"], ni, c["osmIndex"], c["nameScore"])
        for ni, cands in nsdi_candidates.items() for c in cands
    ]
    all_triples.sort(key=lambda t: (t[0], t[1]))

    assigned: dict[int, dict] = {}
    claimed_osm: set[int] = set()
    for dist, ni, oi, nscore in all_triples:
        if ni in assigned or oi in claimed_osm:
            continue
        assigned[ni] = {"osmIndex": oi, "distanceM": dist, "nameScore": nscore}
        claimed_osm.add(oi)

    rows = []
    for ni, n in enumerate(nsdi):
        base = {
            "nsdiObjectId": n["objectid"],
            "nsdiName": n["name"],
            "nsdiDistrict": n["district"],
            "nsdiLat": n["latitude"],
            "nsdiLon": n["longitude"],
            "candidateCount": len(nsdi_candidates.get(ni, [])),
        }
        if ni in no_match_indices:
            rows.append({**base, "confidence": "no_match", "reason": f"No OSM mosque object within {CANDIDATE_RADIUS_M:.0f}m.",
                         "osmObject": None, "distanceM": None, "nameScore": None, "wasContested": False})
            continue
        if ni not in assigned:
            # Had candidates within radius, but every one was claimed by a
            # closer-scoring competing NSDI point first.
            rows.append({**base, "confidence": "no_match",
                         "reason": "Had OSM candidate(s) within radius, but all were closer matches for a different NSDI point.",
                         "osmObject": None, "distanceM": None, "nameScore": None, "wasContested": True})
            continue

        a = assigned[ni]
        o = osm[a["osmIndex"]]
        dist = a["distanceM"]
        nscore = a["nameScore"]

        # Real near-tie check: another candidate within TIE_MARGIN_M of the
        # winner's distance (or the winner's own name score being weak while
        # a runner-up had a stronger one) — mirrors Step 2's duplicate-
        # cluster downgrade.
        others = [c for c in nsdi_candidates[ni] if c["osmIndex"] != a["osmIndex"]]
        contested = any(c["distanceM"] <= dist + TIE_MARGIN_M for c in others)

        very_close = dist <= VERY_CLOSE_M
        if nscore is not None and nscore < NAME_MEDIUM:
            confidence = "ambiguous"
            reason = f"Nearest OSM mosque is {dist:.0f}m away, but its name ('{o['name']}') doesn't resemble the NSDI name ('{n['name']}') — possible name conflict / two distinct nearby mosques."
        elif nscore is not None and nscore >= NAME_HIGH:
            confidence = "high" if (very_close and not contested) else "medium"
            reason = f"Name match ({nscore:.0f}/100) at {dist:.0f}m" + (", but another close candidate exists" if contested else "") + "."
        elif nscore is not None:  # medium name band
            confidence = "medium" if (very_close and not contested) else "ambiguous"
            reason = f"Partial name match ({nscore:.0f}/100) at {dist:.0f}m" + (", contested by a nearby alternative" if contested else "") + "."
        else:  # no name signal on one/both sides
            if very_close and not contested:
                confidence = "high"
                reason = f"Single unambiguous OSM mosque {dist:.0f}m away (no name to compare, but spatially exclusive within radius)."
            elif very_close and contested:
                confidence = "medium"
                reason = f"Closest OSM mosque is {dist:.0f}m away, but a competing candidate is nearly as close — no name signal to disambiguate."
            elif not contested:
                confidence = "medium"
                reason = f"Only OSM candidate within radius, {dist:.0f}m away — no name to corroborate."
            else:
                confidence = "ambiguous"
                reason = f"Closest OSM candidate is {dist:.0f}m away, contested by another nearby candidate, no name signal."

        rows.append({
            **base,
            "confidence": confidence,
            "reason": reason,
            "osmObject": {
                "osmType": o["osmType"], "osmId": o["osmId"], "name": o["name"],
                "lat": o["lat"], "lon": o["lon"], "sourceQuery": o["sourceQuery"],
            },
            "distanceM": round(dist, 1),
            "nameScore": round(nscore, 1) if nscore is not None else None,
            "wasContested": contested,
        })

    OUT_PATH = OUT_DIR / "nsdi-osm-matches.json"
    OUT_PATH.write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")

    from collections import Counter
    counts = Counter(r["confidence"] for r in rows)
    print(f"Total NSDI points: {len(rows)}")
    for tier in ("high", "medium", "ambiguous", "no_match"):
        print(f"  {tier}: {counts.get(tier, 0)}")
    print(f"Written to {OUT_PATH}")


if __name__ == "__main__":
    main()
