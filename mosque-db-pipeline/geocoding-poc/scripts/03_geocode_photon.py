#!/usr/bin/env python3
"""Geocodes the same 100-record sample against Photon (komoot's public OSM
geocoder, https://photon.komoot.io), as a second free/open option to compare
against Nominatim. Also OSM/ODbL-licensed data, no API key. Its Elasticsearch
full-text search is more typo/fuzzy-tolerant than Nominatim's structured
parser — found in a manual spot-check to return a result for a full noisy
"street, village, district, country" string where Nominatim returned zero for
the identical text — at the cost of being more willing to return a loosely
related or mistagged POI as its top hit. Same rate-limit discipline as the
Nominatim script (self-imposed 1 req/sec; Photon's public instance publishes
no hard quota but is a shared community resource, not a bulk-geocoding
service, so this stays conservative for a one-time test)."""
from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
SAMPLE_PATH = BASE_DIR / "output" / "sample-100.json"
OUT_PATH = BASE_DIR / "output" / "geocode-results-photon.json"

PHOTON_URL = "https://photon.komoot.io/api/"
USER_AGENT = "PrayerStop-Mosque-Geocoding-POC/1.0 (one-time research batch-geocode test, non-commercial)"
RATE_LIMIT_SECONDS = 1.1


def normalize_city_for_query(city: str) -> str:
    return re.sub(r"\s*-\s*\d+\s*$", "", city or "").strip()


def photon_search(q: str, limit: int = 3):
    url = f"{PHOTON_URL}?{urllib.parse.urlencode({'q': q, 'limit': limit, 'lang': 'en'})}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return data.get("features", []), None
    except Exception as e:
        return [], str(e)


def geocode_record(record: dict) -> dict:
    address = record["address"]
    city = record["city"]
    district = record["district"]
    city_q = normalize_city_for_query(city)

    passes = [
        ("freeform_full", ", ".join(p for p in [address, city_q, f"{district} District", "Sri Lanka"] if p)),
        ("freeform_city_district", ", ".join(p for p in [city_q, f"{district} District", "Sri Lanka"] if p)),
    ]

    features, error, query_used = [], None, None
    for i, (label, q) in enumerate(passes):
        if i > 0:
            time.sleep(RATE_LIMIT_SECONDS)
        features, error = photon_search(q)
        query_used = label
        # Photon requires Sri Lanka be identifiable in-result too — a bare
        # global full-text search can otherwise return an unrelated country.
        features = [f for f in features if f.get("properties", {}).get("countrycode") == "LK"]
        if features or error:
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
        "resultCount": len(features),
        "results": [
            {
                "lat": f["geometry"]["coordinates"][1],
                "lon": f["geometry"]["coordinates"][0],
                "osmKey": f["properties"].get("osm_key"),
                "osmValue": f["properties"].get("osm_value"),
                "name": f["properties"].get("name"),
                "street": f["properties"].get("street"),
                "city": f["properties"].get("city"),
                "county": f["properties"].get("county"),
                "postcode": f["properties"].get("postcode"),
                "osmType": f["properties"].get("osm_type"),
                "osmId": f["properties"].get("osm_id"),
                "type": f["properties"].get("type"),
            }
            for f in features
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
