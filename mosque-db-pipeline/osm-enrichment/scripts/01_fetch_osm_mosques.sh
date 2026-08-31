#!/bin/bash
# Fetches OSM mosque/place-of-worship objects for Sri Lanka via two targeted
# Overpass API queries (free, no key, ODbL-attributed). Kept to two queries
# deliberately conservative in scope and respectful of the shared public
# instance's rate limit (2 concurrent slots/IP) rather than one query per
# NSDI point (970 separate requests would be both slower and needlessly
# heavy on a shared community server for something entirely doable as one
# bulk area query + local matching).
#
# Query 1 (primary): amenity=place_of_worship + religion=muslim — the
# correct, complete OSM tagging combination for a mosque.
# Query 2 (supplemental): building=mosque — catches objects tagged as a
# mosque building that are missing the amenity/religion combo (a real,
# non-trivial gap found empirically: 47 additional distinct objects).
set -euo pipefail
cd "$(dirname "$0")/.."

UA="PrayerStop-Mosque-OSM-Enrichment-POC/1.0 (research one-time batch query, non-commercial)"
OUT_DIR="raw-sources"
mkdir -p "$OUT_DIR"

echo "Query 1/2: amenity=place_of_worship + religion=muslim ..."
cat > /tmp/overpass-mosques-primary.txt << 'EOF'
[out:json][timeout:180];
area["ISO3166-1"="LK"][admin_level=2]->.sriLanka;
(
  node["amenity"="place_of_worship"]["religion"="muslim"](area.sriLanka);
  way["amenity"="place_of_worship"]["religion"="muslim"](area.sriLanka);
  relation["amenity"="place_of_worship"]["religion"="muslim"](area.sriLanka);
);
out center tags;
EOF
curl -s --max-time 120 -H "User-Agent: $UA" \
  --data-urlencode "data@/tmp/overpass-mosques-primary.txt" \
  "https://overpass-api.de/api/interpreter" \
  -o "$OUT_DIR/osm-mosques-raw.json" -w "  HTTP %{http_code}, %{size_download} bytes\n"

sleep 30  # respect the shared instance's per-IP concurrent-slot limit

echo "Query 2/2: building=mosque (supplemental) ..."
cat > /tmp/overpass-mosques-building.txt << 'EOF'
[out:json][timeout:180];
area["ISO3166-1"="LK"][admin_level=2]->.sriLanka;
(
  node["building"="mosque"](area.sriLanka);
  way["building"="mosque"](area.sriLanka);
);
out center tags;
EOF
curl -s --max-time 120 -H "User-Agent: $UA" \
  --data-urlencode "data@/tmp/overpass-mosques-building.txt" \
  "https://overpass-api.de/api/interpreter" \
  -o "$OUT_DIR/osm-mosques-building-tag.json" -w "  HTTP %{http_code}, %{size_download} bytes\n"

echo "Done."
