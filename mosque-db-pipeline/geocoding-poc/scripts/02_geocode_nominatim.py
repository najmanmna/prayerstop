#!/usr/bin/env python3
"""Geocodes the 100-record sample against Nominatim (OpenStreetMap).

Why Nominatim: it's the standard free/open geocoder with no API key, built
on OpenStreetMap data (ODbL-licensed, requires only attribution). Its
official usage policy (https://operations.osmfoundation.org/policies/nominatim/)
explicitly permits exactly this kind of use — a slow, rate-limited, one-time
batch build for a dataset — while prohibiting heavy/production/real-time
autocomplete traffic. That's a materially different legal posture from
Google's Geocoding API (which this task explicitly excludes), so it fits
the "legally usable for a one-time batch dataset build" requirement. This
script respects the policy: max 1 request/second, a descriptive User-Agent
identifying the request as this research POC (no personal contact info
sent, since none was required by the policy — only a real identifying
string), no parallel requests.

Two-pass query strategy per record:
  1. Structured query (street=address, city=normalized city, county=district,
     country=Sri Lanka) — most precise when it resolves.
  2. If that returns nothing, a free-form query string combining the same
     components — Nominatim's free-text parser sometimes succeeds where the
     structured fields don't line up with OSM's own admin-boundary names.

Sri Lankan addresses often write the city as "COLOMBO - 11" (a postal-zone
convention) which does not match any real OSM place name — normalized by
stripping the "- NN" suffix before querying (the ORIGINAL city value is
still what's recorded and reported; this normalization is query-only).
"""
from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
SAMPLE_PATH = BASE_DIR / "output" / "sample-100.json"
OUT_PATH = BASE_DIR / "output" / "geocode-results.json"

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "PrayerStop-Mosque-Geocoding-POC/1.0 (one-time research batch-geocode test, non-commercial)"
RATE_LIMIT_SECONDS = 1.1


def normalize_city_for_query(city: str) -> str:
    # Strip Sri Lankan postal-zone suffixes like "COLOMBO - 11" / "COLOMBO- 2"
    # down to the base place name, since OSM has no place literally named
    # "Colombo - 11".
    return re.sub(r"\s*-\s*\d+\s*$", "", city or "").strip()


def http_get_json(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


def nominatim_search(params: dict):
    query = urllib.parse.urlencode(params)
    url = f"{NOMINATIM_URL}?{query}"
    try:
        results = http_get_json(url)
    except Exception as e:
        return [], str(e)
    return results, None


def geocode_record(record: dict) -> dict:
    address = record["address"]
    city = record["city"]
    district = record["district"]
    city_q = normalize_city_for_query(city)

    common = {"format": "json", "addressdetails": 1, "limit": 3, "countrycodes": "lk"}

    # Cascading passes, most to least precise. Found empirically that
    # Nominatim's parser can return ZERO results for a full "street, village,
    # district, country" free-text string even when the village name ALONE
    # resolves fine — it doesn't gracefully degrade within a single query,
    # so this script does the degrading itself, one query at a time, and
    # records exactly which precision level (if any) actually worked.
    passes = [
        ("structured", {**common, **({"street": address} if address else {}),
                        **({"city": city_q} if city_q else {}),
                        "county": f"{district} District", "country": "Sri Lanka"}),
        ("freeform_full", {**common, "q": ", ".join(
            p for p in [address, city_q, f"{district} District", "Sri Lanka"] if p)}),
        ("freeform_city_district", {**common, "q": ", ".join(
            p for p in [city_q, f"{district} District", "Sri Lanka"] if p)}),
        ("freeform_city_only", {**common, "q": ", ".join(
            p for p in [city_q, "Sri Lanka"] if p)}),
    ]

    results, error, query_used = [], None, None
    for i, (label, params) in enumerate(passes):
        if i > 0:
            time.sleep(RATE_LIMIT_SECONDS)
        results, error = nominatim_search(params)
        query_used = label
        if results or error:
            break

    return {
        "registrationNo": record["registrationNo"],
        "name": record["name"],
        "district": record["district"],
        "sourceAddress": address,
        "sourceCity": city,
        "addressQuality": record["addressQuality"],
        "queryStrategy": query_used,
        "error": error,
        "resultCount": len(results),
        "results": [
            {
                "displayName": r.get("display_name"),
                "lat": float(r["lat"]),
                "lon": float(r["lon"]),
                "class": r.get("class"),
                "type": r.get("type"),
                "addresstype": r.get("addresstype"),
                "placeRank": r.get("place_rank"),
                "importance": r.get("importance"),
                "osmType": r.get("osm_type"),
                "osmId": r.get("osm_id"),
                "boundingbox": r.get("boundingbox"),
            }
            for r in results
        ],
    }


def main():
    sample = json.loads(SAMPLE_PATH.read_text(encoding="utf-8"))
    out = []
    for idx, record in enumerate(sample, 1):
        result = geocode_record(record)
        out.append(result)
        print(f"[{idx}/{len(sample)}] {record['registrationNo']} ({record['district']}): "
              f"{result['resultCount']} result(s) via {result['queryStrategy']}"
              + (f" ERROR={result['error']}" if result['error'] else ""))
        time.sleep(RATE_LIMIT_SECONDS)

    OUT_PATH.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nWritten to {OUT_PATH}")


if __name__ == "__main__":
    main()
