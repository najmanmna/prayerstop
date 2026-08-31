# Mosque Database — Step 3 Report: Free Geocoding Proof-of-Concept

Standalone POC, entirely outside the PrayerStop app source
(`scratchpad/mosque-db-pipeline/geocoding-poc/`). No PrayerStop runtime code
was touched. Google Geocoding was not used, per the task constraint.

## Sample

100 DMRCA records, stratified 4-per-district across all 25 districts
(`scripts/01_sample_records.py`, seeded/reproducible), further stratified
within each district by a heuristic address-quality bucket so the sample
includes a real mix of cases:

| Address quality | Definition | Count in sample |
|---|---|---|
| High | Has a house number/digit + ≥3 words | 25 |
| Medium | ≥3 words, no digit | 29 |
| Low | Very short, or address text equals the city field | 46 |

The "low" share (46%) roughly reflects the real DMRCA dataset — a large
fraction of records give only a village/town name as the address, with no
street or house number at all.

## Geocoders tested

Google Geocoding was excluded per the task. Two free/open options were
tested, both OpenStreetMap-derived (ODbL-licensed, attribution-only):

- **Nominatim** (`nominatim.openstreetmap.org`) — the standard reference
  geocoder for OSM data. Its [usage
  policy](https://operations.osmfoundation.org/policies/nominatim/)
  explicitly permits a slow, rate-limited, one-time batch job like this
  (max 1 req/sec, descriptive User-Agent, no parallel requests) while
  prohibiting production/high-volume traffic — a materially different, and
  more permissive, legal posture than Google's terms for exactly the
  "one-time batch dataset build" use case this task asked for.
- **Photon** (`photon.komoot.io`) — komoot's public OSM-based geocoder,
  also free/no-key, Elasticsearch full-text search instead of Nominatim's
  structured parser. Tested as a genuine second option, not just a fallback:
  a manual spot-check found Photon returning a result for a noisy
  "street, village, district, country" query where Nominatim's parser
  returned zero for the *identical* string — but, as the results below
  show, that extra recall comes with real precision cost.

Both were queried with the same rate-limit discipline (1 request/second,
descriptive User-Agent, sequential — no parallelism) and a cascading
fallback strategy (structured → full free-text → city+district → city-only)
so a total failure of the most precise query didn't silently end the
attempt for that record.

## Headline numbers

| | Count |
|---|---|
| Records sampled | 100 |
| **Any coordinate returned (successful geocode)** | **100 / 100** (Photon returned ≥1 result for every record; Nominatim returned zero for 16) |
| **Likely correct** (matched a real place-of-worship POI, corroborated) | **5 / 100 (5%)** |
| **Ambiguous** (coordinate returned, but not trustworthy as-is) | **95 / 100** |
| **Failed** (no result from either geocoder) | **0 / 100** |
| Nominatim: zero results after all fallback passes | 16 / 100 |
| Photon: zero results | 0 / 100 |

**"Successful" and "correct" are very different numbers here — that gap is
the central finding of this POC.** Every record got *some* coordinate back
(mostly from Photon), but only 5 of those coordinates could actually be
trusted as pinpointing the specific mosque rather than just its town.

## Why "successful" ≠ "correct": precision breakdown

Best precision level achieved by *either* geocoder, per record:

| Precision level | Count | What it means |
|---|---|---|
| Matched a real place-of-worship POI in OSM | 5 | Best case — an actual mosque/masjid mapped in OSM near the source address |
| Matched only a road/street segment | 39 | Narrows the area to a street, not a building |
| Matched only a town/village/admin centroid | 34 | Coordinate is the *town's* center point — every mosque in that town gets the same coordinate |
| Matched an unrelated POI (school, police station, cinema, library, veterinary clinic, airfield…) | 15 | A real coordinate, almost certainly not the mosque |
| No usable match / miscellaneous | 7 | — |

The 39 "street-level" and 34 "town-level" results are the bulk of what
looked like "successful geocodes" in the raw hit-rate count — but a street
segment or a town centroid does not identify *which* mosque on that street,
or *where in* that town, this specific record refers to. Per the task's
explicit instruction, none of these were auto-accepted as correct.

## Address quality did *not* predict success the way you'd expect

| Source address quality | Likely-correct rate |
|---|---|
| High (house number + detail) | 1 / 25 (4.0%) |
| Medium | 3 / 29 (10.3%) |
| Low (village name only) | 1 / 46 (2.2%) |

A cleaner-looking DMRCA address barely moved the needle. The real
bottleneck isn't address text quality — it's **whether OpenStreetMap has
that specific rural road or building mapped at all**, which is independent
of how well DMRCA wrote the address down. This matters for scalability: no
amount of address-text cleanup on the DMRCA side would meaningfully raise
the hit rate; the ceiling is set by OSM's rural Sri Lanka coverage.

## Cross-check against NSDI

For each record, the best available geocoded point was compared against the
nearest same-district NSDI mosque point (haversine distance, point-in-polygon
district assignment from Step 2).

| | Value |
|---|---|
| Records with an NSDI point within 15 km in the same district | 90 / 100 |
| **Avg. distance to nearest NSDI point — likely-correct records only** | **0.221 km (221 m)** |
| Median distance — likely-correct records | 0.158 km |
| Avg. distance to nearest NSDI point — all 90 cross-checkable records | 1.604 km |
| Avg. disagreement between Nominatim's and Photon's own top results (same record) | 7.16 km |
| Median disagreement between the two geocoders | 2.55 km |

The 221 m average for the 5 likely-correct records is genuinely good — sub-
block-level accuracy when both signals line up. But the 7.16 km average (2.55
km median) disagreement *between the two geocoders on the same address* is
the more important number: it quantifies just how often "a geocoder returned
coordinates" and "the coordinates are near the right place" are different
claims. Two independent open geocoders routinely landed several kilometers
apart on the same source text.

## Examples

**Good — likely correct, corroborated**

| DMRCA | Source | Result | Corroboration |
|---|---|---|---|
| R/1478/BT/197 "MOHIDEEN MOSOQUE" (Batticaloa) | Punanai Anikadu, Pothanai Road, Valaichenai | Both geocoders independently returned the *identical* coordinate, a real place-of-worship POI | 0.496 km from an NSDI point |
| R/2248/MT/61 "ABRAAR JUMMAH MASJID" (Matale) | Mosque Road, Warakanda, Warakamura, Ukuwela | Photon found the real POI; Nominatim only found the town, but agreed within 1.57 km | **14 m** from NSDI's "Marukona Jumma Mosque" |
| R/1367/V/17 "MASJIDUL RAHMANIYA" (Vavuniya) | (address field just repeats the mosque's own name) | Nominatim: zero results. Photon alone found a real POI | 36 m from NSDI's "Mohideen Jumma Mosque" — **worth a manual check**: the DMRCA name and the corroborating NSDI name don't match, so proximity alone doesn't prove it's the *same* mosque and not an adjacent one |

**Bad — wrong POI or wildly disagreeing**

| DMRCA | What went wrong |
|---|---|
| R/1744/AM/172 "MASJIDUL BAKIYATHIS SALIHATH" (Ampara) | Photon's top hit: "GK Cinemax Theatre Kalmunai" — a cinema |
| R/2630/A/122 "MASJIDUL MINHAJ JUMMAH MOSQUE" (Anuradhapura) | Both geocoders' top hit: "Police Station - Karuwalagaswewa" |
| R/2405/KN/06 "SALAM JUMMAH MOSQUE" (Kilinochchi) | Photon's top hit: "Open University of Sri Lanka" |
| R/106/BD/7 "UDUWELA MUSLIM MOSQUE" (Badulla) | The two geocoders' results were **61.6 km apart** — Nominatim found a town centroid, Photon returned an unrelated feature entirely outside the district |
| R/2440/H/20 (Hambantota) | Geocoders disagreed by **56.8 km** — roughly the width of the whole district |

Several "wrong POI" hits are Muslim schools (*Maha Vidyalaya*) rather than
mosques — plausible near-misses, since a village mosque and its associated
school are often genuinely close together in Sri Lanka, but still not a
verified mosque coordinate and correctly not auto-accepted.

## Verdict: accurate and scalable enough for the full 2,389 records?

**Not as a direct batch-and-trust pipeline. As a triage/seeding step, yes.**

- **Accuracy:** at a conservative, honestly-applied bar (no auto-accepting
  ambiguous coordinates, exactly as instructed), only ~5% of records
  produced a coordinate worth trusting without a human look. That's not
  because the geocoders are broken — it's because rural Sri Lankan
  addresses in DMRCA's format (village name, sometimes a road, rarely a
  house number) mostly aren't present in OpenStreetMap at the building
  level yet. This mirrors the NSDI matching finding from Step 2: the limit
  is **source data coverage**, not the matching/geocoding technique.
- **Scalability of the technique itself:** yes — the two-geocoder,
  cascading-fallback, rate-limited approach ran cleanly over 100 records in
  a few minutes each. Extrapolated to 2,389 records at the same 1 req/sec
  policy-compliant rate, a full run is ~40–70 minutes per geocoder,
  comfortably within Nominatim's and Photon's *public demo instance* usage
  policies for a **one-time** job — but running it twice more (at 24x this
  sample size) is worth a courtesy check against Nominatim's current usage
  policy page, or better, self-hosting Nominatim/Photon for the full run
  to be unambiguously safe and avoid straining the shared community
  servers.
- **Recommended path for the full dataset:** run this exact pipeline over
  all 2,389 records (cheap, ~1–2 hours), but treat the output strictly as
  this POC treated it — auto-keep only `likely_correct`-tier results (POI
  match + corroboration), and route everything else (expected to be the
  large majority, based on this sample) to either (a) the ~50–67 records
  already resolved via Step 2's NSDI name-matching, which don't need
  geocoding at all, or (b) a manual/crowdsourced review queue rather than
  silently shipping a town-centroid coordinate as if it were the mosque's
  real location.

Do not feed raw geocoder output directly into the production mosque
database without this same conservative filter — an unfiltered batch would
put a majority of records at the wrong location (a village centroid, a
school, a police station) while looking superficially "complete."
