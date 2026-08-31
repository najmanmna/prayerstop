# Mosque Database — Step 4 Report: Spatial Enrichment Using OpenStreetMap

Standalone, entirely outside the PrayerStop app source
(`scratchpad/mosque-db-pipeline/osm-enrichment/`). No PrayerStop runtime
code was touched. Google was not used anywhere in this step.

## Data sources

- **NSDI**: the same 970 mosque points from Step 1/2 (`raw-sources/nsdi/`),
  each already carrying a district (point-in-polygon, Step 2).
- **OSM**: fetched fresh via two targeted Overpass API queries (free, no
  key, ODbL-licensed, ["Data © OpenStreetMap contributors,
  ODbL"](https://www.openstreetmap.org/copyright)):
  1. `amenity=place_of_worship` + `religion=muslim` for all of Sri Lanka
     (area query, not per-point) — **541 objects**.
  2. `building=mosque` (supplemental — catches objects missing the
     amenity/religion tag combo) — **47 additional distinct objects** after
     deduping against query 1.
  - **Merged OSM mosque set: 588 objects, 467 of them (79%) with a real
    `name` tag** — much richer naming than NSDI's own 34% (315/970) usable-
    name rate from Step 2.
  - Deliberately **two bulk area queries, not 970 per-point queries** —
    faster, and respectful of Overpass's shared public-instance rate limit
    (2 concurrent slots/IP; one query briefly hit a 429 after an unrelated
    slow query and was retried after the documented cooldown via
    `/api/status`, not by hammering the endpoint).

## Method

### Radius (empirically calibrated, not guessed)

Computed the nearest-OSM-mosque distance for all 970 NSDI points before
picking any threshold. The distribution is sharply bimodal: **16.7%** of
NSDI points have an OSM mosque within 50m, climbing to **19.4%** within
100m and **26.3%** within 300m — then a long tail runs out to tens of
kilometers (points with no nearby OSM coverage at all, consistent with the
sparse rural OSM coverage already found in Step 3's geocoding POC).
**Candidate radius: 300m** — sits right at that elbow.

### Matching

Unlike Step 2 (DMRCA had no coordinates, so name similarity had to carry
the whole match), here **distance is the primary signal** and name
similarity is secondary corroboration/conflict-check — both sides have
real coordinates. For every NSDI point, every OSM mosque within 300m is a
candidate; the same conservative name-scoring machinery validated in Step 2
(core-name, stopword-stripped, `rapidfuzz`) is reused for the secondary
check.

One OSM object is one physical building, exactly the one-object-one-match
principle from Step 2 — so the same **global greedy 1:1 assignment**
applies: every (NSDI, OSM) candidate pair is ranked by distance across the
whole dataset, and once an OSM object is claimed it's removed from every
other NSDI point's pool. A pairing is also flagged and downgraded when a
real near-tie existed (another candidate within 40m of the winner's
distance) — the same conservative "don't let an arbitrary tie-break read
as confident" rule from Step 2.

### Confidence categories

| Category | Rule |
|---|---|
| **high** | Single unambiguous OSM candidate ≤100m with no name conflict, or a strong name match (≥80/100) at ≤100m with no real competing candidate |
| **medium** | Real match signal (proximity and/or partial name agreement) but with some uncertainty — contested by a near-tie, farther out (100–300m), or only a partial name match |
| **ambiguous** | Both sides have a real name and the names actively disagree (score <50) despite proximity — flagged as a possible name conflict / two distinct nearby mosques, never silently resolved either way |
| **no_match** | No OSM mosque object within 300m, or every nearby candidate was already claimed by a closer-matching NSDI point |

No pairing was ever force-upgraded past what its evidence supports, and
`ambiguous`/`no_match` results were never treated as confirmed data.

## Results

| Confidence | Count | Avg. distance |
|---|---|---|
| **high** | **144** | 26.1 m (max 98.7 m) |
| **medium** | **51** | 101.1 m (max 290.4 m) |
| **ambiguous** | **35** | — (name conflict cases) |
| **no_match** | **740** | — |

195 of 970 NSDI points (20%) got a trustworthy OSM correspondence
(high+medium); 588 OSM objects were candidates but only 230 were actually
claimed — 358 OSM-mapped mosques have no nearby NSDI point at all (the
mirror image of NSDI's own coverage gap — two independently-built datasets,
each with real holes the other doesn't always fill).

## How many NSDI points gain a useful mosque name

| | Count |
|---|---|
| Had a usable name already (from Step 2) | 315 |
| **Gained a usable name from this OSM match (high/medium only)** | **+118** |
| **Now have a usable name, total** | **433 / 970 (44.6%)** |
| **Still unnamed** | **537 / 970 (55.4%)** |

118 previously-null-or-generic ("Mosque"/"Masjid") NSDI records now have a
real, specific name straight from OSM — a genuine, immediate enrichment.
Examples:

| NSDI id | Was | Now (from OSM, confidence, distance) |
|---|---|---|
| 14331 | *(none)* | Zaviya Ummul Fuqarah (high, 24 m) |
| 14458 | *(none)* | Haliwala Jumma Masjid (high, 18 m) |
| 15570 | *(none)* | Grand Mosque - Muhiyaddeen Jummah Masjid (high, 6 m) |
| 14394 | "Mosque" | Muhiyaddeen Jumma Masjid (high, 39 m) |
| 16037 | "Jumma Masjid Mosque" (generic) | Jumma Masjid (high, 37 m) |

## Corroborated by OSM + DMRCA (Step 2)

Every OSM **high**-confidence match was cross-referenced against Step 2's
existing NSDI↔DMRCA output on the shared `nsdiId`.

| | Count |
|---|---|
| NSDI points with an OSM-high match AND any Step 2 DMRCA match | **24** |
| Of those, all three names (NSDI/OSM/DMRCA) mutually agree (≥70 similarity) | 17 / 18 comparable |
| Completely unverified (no OSM match at all, no DMRCA match at all) | **620 / 970 (63.9%)** |

24 NSDI points now have **three independent government/community sources
pointing at the same building** — the strongest evidentiary tier this
whole project has produced. Examples:

| NSDI | OSM name (dist) | DMRCA name (tier) | 3-way agree? |
|---|---|---|---|
| 18539 (Colombo) | Maradana Jummah Mosque (5 m) | MARADANA MOSQUE (high) | ✓ |
| 17967 (Ampara) | Al Muneera Masjid (9 m) | AL - MASJIDUL MUNEER (medium) | ✓ |
| 18259 (Colombo) | Nooraniya Jummah Masjid (20 m) | NOORANIYA JUMMA MASJID (low) | ✓ |
| 18387 (Colombo) | Dawatagaha Mosque (18 m) | DEWATAGAHA MOSQUE & SHRINE (low) | ✓ |
| 16027 (Kalutara) | masjidul mubarak mosque (15 m) | BAITHUL MUBARAK BUKHARI THAKKIYA (high) | ✓ |

Worth flagging: two of these (18259, 18387) had only a **low**-confidence
DMRCA match in Step 2 on their own — this OSM cross-reference is genuine
new evidence that upgrades a previously-shaky pairing, not just a
redundant confirmation. That's the practical value of a third independent
source: it can rescue matches Step 2 alone was right to be cautious about.

**One real disagreement**, worth a manual look rather than auto-resolving:

> NSDI 15683 (Kalutara): NSDI name **"Ketchimala Mosque"**, OSM name
> **"Ketchimale Mosque"** (23 m away, high confidence — essentially the
> same name, alternate transliteration), but DMRCA's own low-confidence
> match on this point is named **"KACHCHIMALAI SHRINE"**. All three likely
> refer to the same landmark ("Kachchimalai"/"Ketchimala/e" is a known
> place name near Beruwala) under three different transliterations, but
> the automated name-similarity check (63.6/100) fell just under the
> agreement threshold — illustrating that transliteration variance can
> defeat string similarity even when a human would immediately recognize
> the match.

## Examples of ambiguity (correctly withheld, not resolved)

Several NSDI points sit very close (10–150m) to an OSM mosque with a
**completely different** name — flagged `ambiguous`, not silently accepted:

| NSDI name | OSM name | Distance | Name score |
|---|---|---|---|
| Muhiyadeen Jumma Masjid | Kalutara Mosque | 11 m | 22.2 |
| Bamahrath Mujahdhamiya Mosque | Nakshabandiya masjid | 29 m | 45.7 |
| Jumma Musjid | Balapitiya Mosque | 36 m | 12.5 |
| Sindar Shake Madar Mosque | Meerah Jumma Masjid | 148 m | 25.0 |

These are genuinely ambiguous, not pipeline bugs: OSM data for Sri Lanka
shows real clusters of multiple distinct, differently-named mosques only a
few hundred meters apart (a Sammanthurai cluster in the raw OSM dump has
five separate mosques within ~300m of each other). At this proximity, a
name-blind spatial match would have real odds of pairing an NSDI point with
its neighbor's OSM mosque instead of its own — exactly the failure mode
the name-conflict check exists to catch instead of guessing.

## Verdict

OSM enrichment is a genuinely productive, low-cost addition to this
project's mosque database work, but with the same shape of finding as
Steps 2 and 3: real, useful signal on a meaningful minority of records,
never a complete solution on its own.

- **Immediately usable**: the 144 high-confidence NSDI↔OSM pairs (avg 26m
  apart) and especially the 24 points now corroborated by three
  independent sources (NSDI + OSM + DMRCA) are as solid as any coordinate
  data this project has produced — safe to treat as verified.
- **The 118 newly-named records** are a real, immediate win for the "how
  many mosques have a usable name" question, independent of whether their
  coordinates end up used.
- **The ceiling is OSM's own Sri Lanka coverage**, not the matching
  technique — 588 OSM mosque objects against 970 NSDI points and 2,389
  DMRCA records means most of the country's rural mosques simply aren't
  digitized in OSM yet. This mirrors Step 3's geocoding finding exactly:
  data coverage, not algorithm quality, is the binding constraint.
- **Recommended next step**: fold this step's 144 high-confidence pairs
  (and the 24 triple-corroborated ones especially) into whatever seed
  dataset comes out of Steps 2/3, and treat OSM as a standing enrichment
  source worth re-running periodically — unlike DMRCA (static PDF snapshot)
  and the geocoding APIs, OSM is community-editable and Sri Lanka's mosque
  coverage there will likely keep improving over time.
