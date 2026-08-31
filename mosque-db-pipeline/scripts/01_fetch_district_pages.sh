#!/bin/bash
# Fetches all 25 DMRCA district pages (each embeds its mosque-list PDF via a
# flipbook viewer widget, source URL is inside a <script> JSON blob, not a
# plain <a href>).
set -euo pipefail
cd "$(dirname "$0")/.."

UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
OUT_DIR="raw-sources/dmrca/district-pages"
mkdir -p "$OUT_DIR"

# Slugs exactly as found on the "Registered Mosque List" toggle at
# https://muslimaffairs.gov.lk/mosque/ — includes the site's own misspellings
# (jaffana, kalutura, killinochchi, monaragale) which we preserve verbatim
# since that's the real URL.
SLUGS=(
  ampara anuradhapura badulla batticaloa colombo galle gampaha hambantota
  jaffana kalutura kandy kegalle killinochchi kurunegala mannar matale
  matara mullaitivu monaragale nuwara-eliya polonnaruwa puttalam ratnapura
  trincomalee vavuniya
)

echo "Fetching ${#SLUGS[@]} district pages..."
for slug in "${SLUGS[@]}"; do
  out="$OUT_DIR/$slug.html"
  if [ -f "$out" ] && [ -s "$out" ]; then
    echo "  $slug: already present, skipping"
    continue
  fi
  code=$(curl -s -L --max-time 30 -A "$UA" "https://muslimaffairs.gov.lk/$slug/" -o "$out" -w "%{http_code}")
  size=$(wc -c < "$out" | tr -d ' ')
  echo "  $slug: HTTP $code, $size bytes"
  sleep 0.5
done
echo "Done."
