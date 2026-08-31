#!/usr/bin/env python3
"""Cross-checks both geocoders' results against each other and against the
NSDI mosque points (same-district, nearest-neighbor), classifies each of the
100 sample records, and writes the final per-record table + summary stats
that report.md is built from.

Classification is deliberately conservative — per the task's explicit "do
not automatically accept low-confidence or ambiguous coordinates," a result
only ever gets marked LIKELY_CORRECT when it hit a real place_of_worship POI
in OSM AND has independent corroboration (either the other geocoder agrees
within ~2km, or a same-district NSDI point sits within ~1km). Everything
else that returned coordinates but doesn't clear that bar is AMBIGUOUS —
including the very common case of a geocoder only resolving to a town/
village administrative centroid, which is a real coordinate but not
specific to the mosque at all (every mosque in that town would geocode to
the same point).
"""
from __future__ import annotations

import json
import math
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
SAMPLE_PATH = BASE / "output" / "sample-100.json"
NOM_PATH = BASE / "output" / "geocode-results.json"
PHOTON_PATH = BASE / "output" / "geocode-results-photon.json"
NSDI_PATH = BASE.parent / "raw-sources" / "nsdi" / "nsdi-mosques-with-district.json"
OUT_PATH = BASE / "output" / "analysis.json"

POI_CORROBORATION_KM = 2.0
NSDI_CORROBORATION_KM = 1.0
NSDI_CROSSCHECK_RADIUS_KM = 15.0


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def classify_nominatim_precision(result) -> str:
    cls, typ = result.get("class"), result.get("type")
    if cls == "amenity" and typ == "place_of_worship":
        return "poi_worship"
    if cls == "amenity":
        return "other_poi"
    if cls == "highway":
        return "street_level"
    if cls in ("place", "boundary"):
        return "town_level"
    return "other"


def classify_photon_precision(result) -> str:
    key, val = result.get("osmKey"), result.get("osmValue")
    if key == "amenity" and val == "place_of_worship":
        return "poi_worship"
    if key == "amenity":
        return "other_poi"
    if key == "highway":
        return "street_level"
    if key in ("place", "boundary"):
        return "town_level"
    return "other"


PRECISION_LABEL = {
    "poi_worship": "matched a real place-of-worship POI in OSM",
    "other_poi": "matched an unrelated POI (not a mosque)",
    "street_level": "matched only a road/street, not a specific building",
    "town_level": "matched only a town/village/admin-area centroid",
    "other": "matched a miscellaneous feature (not address-specific)",
    "none": "no result",
}


def main():
    sample = {r["registrationNo"]: r for r in json.loads(SAMPLE_PATH.read_text(encoding="utf-8"))}
    nom_by_id = {r["registrationNo"]: r for r in json.loads(NOM_PATH.read_text(encoding="utf-8"))}
    photon_by_id = {r["registrationNo"]: r for r in json.loads(PHOTON_PATH.read_text(encoding="utf-8"))}
    nsdi = json.loads(NSDI_PATH.read_text(encoding="utf-8"))

    nsdi_by_district: dict[str, list] = {}
    for r in nsdi:
        if r["district"] and r["latitude"] is not None:
            nsdi_by_district.setdefault(r["district"], []).append(r)

    def nearest_nsdi(district, lat, lon):
        candidates = nsdi_by_district.get(district, [])
        best = None
        for c in candidates:
            d = haversine_km(lat, lon, c["latitude"], c["longitude"])
            if best is None or d < best[0]:
                best = (d, c)
        return best  # (distance_km, nsdi_record) or None

    rows = []
    for reg_no, record in sample.items():
        nom = nom_by_id.get(reg_no, {})
        pho = photon_by_id.get(reg_no, {})
        nom_top = nom.get("results", [None])[0] if nom.get("results") else None
        pho_top = pho.get("results", [None])[0] if pho.get("results") else None

        nom_precision = classify_nominatim_precision(nom_top) if nom_top else "none"
        pho_precision = classify_photon_precision(pho_top) if pho_top else "none"

        # Agreement between the two independent geocoders.
        geocoder_agreement_km = None
        if nom_top and pho_top:
            geocoder_agreement_km = round(
                haversine_km(nom_top["lat"], nom_top["lon"], pho_top["lat"], pho_top["lon"]), 3
            )

        # NSDI cross-check for whichever result is more precise (prefer a
        # poi_worship hit from either geocoder; else Nominatim's top result
        # if present, else Photon's).
        ref_lat = ref_lon = None
        ref_source = None
        for label, top, prec in (("nominatim", nom_top, nom_precision), ("photon", pho_top, pho_precision)):
            if prec == "poi_worship":
                ref_lat, ref_lon, ref_source = top["lat"], top["lon"], label
                break
        if ref_lat is None and nom_top:
            ref_lat, ref_lon, ref_source = nom_top["lat"], nom_top["lon"], "nominatim"
        elif ref_lat is None and pho_top:
            ref_lat, ref_lon, ref_source = pho_top["lat"], pho_top["lon"], "photon"

        nsdi_match = None
        if ref_lat is not None:
            nearest = nearest_nsdi(record["district"], ref_lat, ref_lon)
            if nearest and nearest[0] <= NSDI_CROSSCHECK_RADIUS_KM:
                nsdi_match = {
                    "distanceKm": round(nearest[0], 3),
                    "nsdiObjectId": nearest[1]["objectid"],
                    "nsdiName": nearest[1]["name"],
                }

        # --- Classification ---
        has_any_result = bool(nom_top or pho_top)
        best_precision = "poi_worship" if "poi_worship" in (nom_precision, pho_precision) else (
            "other_poi" if "other_poi" in (nom_precision, pho_precision) else (
                "street_level" if "street_level" in (nom_precision, pho_precision) else (
                    "town_level" if "town_level" in (nom_precision, pho_precision) else (
                        "other" if has_any_result else "none"
                    )
                )
            )
        )

        corroborated = (
            (geocoder_agreement_km is not None and geocoder_agreement_km <= POI_CORROBORATION_KM)
            or (nsdi_match is not None and nsdi_match["distanceKm"] <= NSDI_CORROBORATION_KM)
        )

        if not has_any_result:
            verdict = "failed"
            reason = "Both geocoders returned zero results after all fallback passes — address/village likely absent from OSM."
        elif best_precision == "poi_worship" and corroborated:
            verdict = "likely_correct"
            reason = "Matched a real place-of-worship POI in OSM, corroborated by " + (
                "agreement between both geocoders" if geocoder_agreement_km is not None and geocoder_agreement_km <= POI_CORROBORATION_KM
                else "a nearby NSDI mosque point"
            )
        elif best_precision == "poi_worship" and not corroborated:
            verdict = "ambiguous"
            reason = "Matched a place-of-worship POI but with no independent corroboration (geocoders disagree or no nearby NSDI point) — could be a different mosque in the same area."
        elif best_precision == "other_poi":
            verdict = "ambiguous"
            reason = "Top result is an unrelated OSM feature (school/shop/office/etc), not a mosque — coordinate is not trustworthy as-is."
        elif best_precision == "street_level":
            verdict = "ambiguous"
            reason = "Matched only a road/street segment, not a specific building — narrows the area but does not pinpoint the mosque."
        elif best_precision == "town_level":
            verdict = "ambiguous"
            reason = "Query only resolved at town/village level (the specific street/address was not found in OSM) — coordinate is a locality centroid shared by every mosque in that town."
        else:
            verdict = "ambiguous"
            reason = "Result did not match a recognizable address/POI category."

        rows.append({
            "registrationNo": reg_no,
            "name": record["name"],
            "district": record["district"],
            "sourceAddress": record["address"],
            "sourceCity": record["city"],
            "addressQuality": record["addressQuality"],
            "nominatim": {
                "queryStrategy": nom.get("queryStrategy"),
                "resultCount": nom.get("resultCount", 0),
                "topDisplayName": nom_top["displayName"] if nom_top else None,
                "lat": nom_top["lat"] if nom_top else None,
                "lon": nom_top["lon"] if nom_top else None,
                "precision": nom_precision,
                "precisionLabel": PRECISION_LABEL[nom_precision],
                "importance": nom_top.get("importance") if nom_top else None,
            },
            "photon": {
                "queryStrategy": pho.get("queryStrategy"),
                "resultCount": pho.get("resultCount", 0),
                "topName": pho_top.get("name") if pho_top else None,
                "lat": pho_top["lat"] if pho_top else None,
                "lon": pho_top["lon"] if pho_top else None,
                "precision": pho_precision,
                "precisionLabel": PRECISION_LABEL[pho_precision],
            },
            "geocoderAgreementKm": geocoder_agreement_km,
            "nsdiCrossCheck": nsdi_match,
            "verdict": verdict,
            "reason": reason,
        })

    # --- Summary ---
    from collections import Counter
    verdict_counts = Counter(r["verdict"] for r in rows)
    successful = sum(1 for r in rows if r["nominatim"]["resultCount"] or r["photon"]["resultCount"])

    nsdi_distances_poi = [
        r["nsdiCrossCheck"]["distanceKm"] for r in rows
        if r["nsdiCrossCheck"] and r["verdict"] == "likely_correct"
    ]
    nsdi_distances_all = [r["nsdiCrossCheck"]["distanceKm"] for r in rows if r["nsdiCrossCheck"]]
    agreements = [r["geocoderAgreementKm"] for r in rows if r["geocoderAgreementKm"] is not None]

    summary = {
        "totalRecords": len(rows),
        "successful": successful,
        "verdictCounts": dict(verdict_counts),
        "nominatimZeroResults": sum(1 for r in rows if r["nominatim"]["resultCount"] == 0),
        "photonZeroResults": sum(1 for r in rows if r["photon"]["resultCount"] == 0),
        "avgNsdiDistanceKmLikelyCorrect": round(sum(nsdi_distances_poi) / len(nsdi_distances_poi), 3) if nsdi_distances_poi else None,
        "medianNsdiDistanceKmLikelyCorrect": (
            round(sorted(nsdi_distances_poi)[len(nsdi_distances_poi) // 2], 3) if nsdi_distances_poi else None
        ),
        "avgNsdiDistanceKmAll": round(sum(nsdi_distances_all) / len(nsdi_distances_all), 3) if nsdi_distances_all else None,
        "nsdiCrossCheckCount": len(nsdi_distances_all),
        "avgGeocoderAgreementKm": round(sum(agreements) / len(agreements), 3) if agreements else None,
        "medianGeocoderAgreementKm": round(sorted(agreements)[len(agreements) // 2], 3) if agreements else None,
    }

    OUT_PATH.write_text(json.dumps({"summary": summary, "rows": rows}, indent=2, ensure_ascii=False), encoding="utf-8")

    print("=== SUMMARY ===")
    print(json.dumps(summary, indent=2))
    print(f"\nWritten to {OUT_PATH}")


if __name__ == "__main__":
    main()
