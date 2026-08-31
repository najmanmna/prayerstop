# Mosque Database — Step 2 Report: DMRCA ↔ NSDI Matching

Standalone pipeline, kept entirely outside the PrayerStop app source
(`scratchpad/mosque-db-pipeline/`). No PrayerStop runtime code was touched.

## Sources

- **DMRCA** (Department of Muslim Religious and Cultural Affairs) —
  Registered Mosque List, scraped from `https://muslimaffairs.gov.lk/mosque/`.
  That page links to 25 per-district pages
  (`https://muslimaffairs.gov.lk/<district>/`), each of which embeds its
  mosque list as a PDF inside a flipbook-viewer widget — the PDF URL lives in
  a `<script>` JSON blob (`window.option_df_NNNN = {..."source":"...pdf"}`),
  not a plain `<a href>` link, so a naive HTML link scan misses it entirely.
  All 25 district PDFs were downloaded and parsed with `pdfplumber`'s
  grid-aware table extraction (confirmed reliable — these are real,
  text-based PDF tables, not scans).
- **NSDI** (Sri Lanka National Spatial Data Infrastructure) — the 970-record
  "Place of Worship / Mosque" dataset from Step 1
  (`scratchpad/nsdi-mosque-investigation/`), plus the official NSDI
  **District Boundary** layer (25 polygons), fetched fresh in this step to
  assign each NSDI point a district via point-in-polygon.

## Pipeline

1. `scripts/01_fetch_district_pages.sh` — fetch all 25 DMRCA district pages.
2. `scripts/02_extract_and_fetch_pdfs.py` — extract each page's embedded PDF
   URL, download all 25 mosque-list PDFs.
3. `scripts/03_extract_dmrca_tables.py` — extract raw table rows (`pdfplumber`),
   filtering only genuine header/title rows and stray single-fragment table
   artifacts (never real data rows).
4. `scripts/04_assign_nsdi_districts.py` — point-in-polygon district
   assignment for all 970 NSDI points against the official boundary layer
   (`shapely`).
5. `scripts/05_match.py` — the matcher (see below).

## Counts

| | Count |
|---|---|
| **Total DMRCA mosque records extracted** | **2,389** (across all 25 districts) |
| **Total NSDI mosque records** | **970** (969 successfully district-assigned) |
| NSDI records with *any* name | 426 |
| NSDI records with a real, non-generic name (usable for matching) | 330 |
| **High-confidence matches** | **50** |
| **Medium-confidence matches** | **17** |
| **Low-confidence matches** | **115** |
| **Unmatched NSDI records** | **788** |
| **Unmatched DMRCA records** | **2,207** |
| Duplicate-candidate NSDI points (contested by >1 DMRCA record) | 116 |

Per-district DMRCA record counts range from 8 (Kilinochchi) to 286 (Kandy).

## Data-reality constraint that shaped the matching design

NSDI's raw records have **no address, city, or district field at all** —
only geometry and a free-text `name` that is frequently null or a bare
placeholder ("Mosque"). Only 330 of 970 NSDI points (34%) have a real,
specific name at all, so **the other 66% can never be matched by this
pipeline** — not a bug, a direct consequence of "never invent a name for an
unnamed NSDI record." That leaves exactly two usable signals, matching the
task's own scoping:

- **Normalized name similarity** (`rapidfuzz`, order- and subset-tolerant),
  scored on a *core* form of each name with generic mosque-type words
  (MOSQUE, MASJID, JUMMA, THAKKIYA, ZAVIA, GRAND, and Arabic-transliteration
  grammatical particles AL-/-UL-/-US-/-UN-/-UR-) stripped out. Without this
  step, a short NSDI entry like "AC Mosque" spuriously matched dozens of
  unrelated DMRCA records purely because both strings contained the word
  "Mosque" — an empirically observed failure mode from an early pass of this
  pipeline (841 false "low" matches), not a hypothetical one.
- **Geographic proximity "where coordinates are available from NSDI"** —
  operationalized as *district agreement*. DMRCA records have no coordinates
  of their own (their "location" is only the source PDF's district), so a
  literal distance can never be computed; the practical, honest form of this
  signal here is: an NSDI point is only ever considered a candidate match for
  a DMRCA record from the *same* district (via point-in-polygon against the
  official boundaries).
- **Address/city text similarity** was explicitly part of the requested
  matching combination but turned out to be structurally unusable — NSDI has
  no address/city field to compare DMRCA's address/city text against. This
  is reported honestly rather than silently dropped; DMRCA's normalized
  address/city is preserved on every record regardless.

## The one-mosque-one-point rule

An NSDI point is one physical building — it cannot legitimately be "the
match" for more than one DMRCA registration. An earlier version of this
matcher scored each DMRCA record independently, which let many different
DMRCA records separately claim the *same* NSDI point (worst case: 32
different "Mohideen"-type registrations all scoring against the same single
NSDI point — "Mohideen"/"Muhiyadeen" honors a widely venerated Sufi figure
and is an extremely common mosque name across Sri Lanka). The final matcher
instead runs a **global greedy 1:1 assignment**: every scored (DMRCA, NSDI)
pair is ranked across the whole dataset, and once an NSDI point is claimed it
is removed from every other DMRCA record's candidate pool. Confidence is
further capped at **low** whenever a genuine multi-way tie existed for the
winning NSDI point (several equally-scoring DMRCA claimants) — the winner is
then an arbitrary tie-break, not a confident identification, and is labeled
accordingly rather than allowed to read as more certain than it is.

## Confidence tiers

- **HIGH** (50) — name score ≥ 93, a clear margin (≥ 5 points) over this
  DMRCA record's own runner-up candidate, and no unresolved multi-way tie
  for the winning NSDI point.
- **MEDIUM** (17) — name score ≥ 85 (or a high score with too thin a margin
  to trust as HIGH).
- **LOW** (115) — name score ≥ 70 but below the medium bar, *or* a
  high/medium-scoring pair whose winning NSDI point was a genuine multi-way
  tie among several DMRCA claimants. Never treated as a confirmed match.
- **UNMATCHED** — no in-district usable NSDI candidate reached 70, no
  usable in-district NSDI candidates existed at all, or every reasonable
  candidate was already claimed by a higher-scoring competitor.

No match was ever force-upgraded past what its evidence supports.

## Examples

**High confidence**
| DMRCA name | NSDI name | District | Score |
|---|---|---|---|
| MUTWAL JUMMA MOSQUE | Mutwal Jumma Mosque | Colombo | 100 |
| MARADANA MOSQUE | Maradana Mosque | Colombo | 100 |
| MANABODA JUMMA MOSQUE | Manaboda Jumma Mosque | Matale | 100 |
| WATAWALA JUMMAH MOSQUE | Watawala Jumma Mosque | Nuwara Eliya | 100 |
| MASJIDUL HAQ | Masjithul Haq Mosque | Ampara | 100 |
| KALUTARA BAZAAR MOSQUE | Kalutara Bazar | Kalutara | 97 |

One high-confidence pairing is worth a manual look before trusting it
blindly: `MASJIDUL MUBARAK & THAKKIYA` (Gampaha) matched NSDI's
`"Al Mubarak Primary School"` — the NSDI record's own `name` field appears
to describe a school, not a mosque, despite being tagged
`place_of_worship_category = 'Mosque'` in NSDI's own data. Likely a shared
compound (a common pattern — a mosque and its attached school), but this is
an NSDI source-data quirk, not a pipeline error, and is worth a human check
before shipping.

**Medium confidence** (real name overlap, but score or margin fell short of
HIGH)
| DMRCA name | NSDI name | District | Score |
|---|---|---|---|
| AL - MASJIDUL MUNEER | Al Muneera Mosque | Ampara | 92 |
| AL MASJITHUL ILAHI | Masjithul Hilahi Mosque | Ampara | 91 |

**Low confidence** (weak or ambiguous — never treated as a real match)
| DMRCA name | NSDI name | District | Score | Why low |
|---|---|---|---|---|
| DEWATAGAHA MOSQUE & SHRINE | Davatagaha Mosque | Colombo | 80 | Below medium bar |
| HIDAYATH MOSQUE | Masjidul Hidyih Jumma Mosque | Colombo | 71 | Below medium bar |
| MOHIDEEN JUMMA MOSQUE | Mohideen Jumma Mosque | Puttalam | 100 | One of 32 equally-scoring claimants for the same NSDI point — winner is an arbitrary tie-break |

**Unmatched DMRCA** (no in-district NSDI candidate at all, or none with a
usable name)
- `MASJIDUL KABEER JUMMA MOSQUE`, Kalmunai, Ampara
- `KHAJA JOWHARALISHA MACCAM`, Sainthamaruthu, Ampara
- `NINTAVUR JUMMA MOSQUE` (a *different* Nintavur mosque than the one that
  did match), Ampara

**Unmatched NSDI** (has a real name, but no DMRCA record scored high enough
against it in its district)
- `Hawulana Kamakana Mosque`, Matara
- `Kapuwatta Jumma Mosque`, Matara
- `Takva Mosque`, Kalutara

## Duplicate candidates

116 NSDI points were scored against by more than one DMRCA record before the
1:1 assignment resolved a single winner. Cluster sizes:

| Claimants | Cluster count |
|---|---|
| 2 | 31 |
| 3 | 26 |
| 4–9 | 27 |
| 10–15 | 11 |
| 22–32 | 21 |

The largest clusters are entirely driven by a handful of extremely common
Sri Lankan mosque name-roots — **Mohideen/Muhiyadeen** (the single biggest
source, six separate 32-way clusters), **Nooraniya**, and **Al-Falah** — all
in districts with a NSDI dataset that also uses only that bare root name
with no locality qualifier. Full detail, including every claimant and its
score, is in `normalized/duplicate-candidates.json`.

## Verdict: is this good enough to found the PrayerStop mosque database?

**Partially — with an important shape to the "good enough" answer.**

- **What's solid:** 2,389 DMRCA records is a real, government-sourced,
  address-bearing mosque registry covering all 25 districts — genuinely
  useful as a mosque *directory* (name/address/city/type) on its own, with
  or without NSDI matching. The 970 NSDI points contribute real, surveyed
  **coordinates**, which DMRCA completely lacks. Where the two sources
  cleanly agree (the 50 high-confidence matches, and a good share of the 17
  medium ones), you get a mosque with both a verified official registration
  *and* a real GPS location — exactly the kind of record PrayerStop's
  recommendation engine needs.
- **What's the real limit:** only **67 records (50 high + 17 medium)** out
  of 2,389 DMRCA registrations currently carry a trustworthy coordinate this
  way — under 3%. The bottleneck is NSDI, not the matching logic: 66% of
  NSDI points have no usable name at all, so most of the 970 coordinates
  can never be tied to a specific DMRCA registration by text matching, full
  stop — no amount of matching-algorithm tuning changes that without a
  different data source or a manual/crowdsourced enrichment pass.
  Symmetrically, most of DMRCA's 2,389 addressed records have no matching
  coordinate yet.
- **Recommendation:** treat this pass as validating the *approach*, not as
  a finished coordinate set. Reasonable next moves, in rough order of
  effort: (a) use the 50–67 confirmed matches as a seed/validation set now;
  (b) for the large "unmatched DMRCA" pool, a geocoding pass on DMRCA's own
  address+city text (a separate, disclosed data source — not blending NSDI
  and DMRCA text, and explicitly not Google Places per this task's
  constraint) could realistically produce far more coordinates than
  NSDI-matching ever will, since DMRCA's real bottleneck is "no
  coordinates" rather than "no name"; (c) the 116 duplicate-candidate
  clusters are worth a manual/crowdsourced disambiguation pass before
  trusting any of their individual low-confidence pairings.

Do not build the production mosque database directly on the current
`normalized/matches.json` alone (too few confirmed matches to be the whole
dataset) — but the DMRCA extraction, the NSDI district assignment, and the
matching methodology are all sound enough to build on.
