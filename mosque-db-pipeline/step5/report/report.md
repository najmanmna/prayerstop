# Mosque Database — Step 5 Report: Coverage Analysis + Controlled OSM Expansion

Standalone, entirely under `scratchpad/mosque-db-pipeline/step5/`. No
PrayerStop app, database schema, or API architecture was touched.

## Methodology note: "usable verified identity"

The summary metric used throughout this report is defined precisely, not
just "has a name": an NSDI point counts as having a **usable verified
identity** only if it (a) has a real, specific name from *any* source (its
own NSDI name, or one gained from a Step 4 high/medium OSM match) **and**
(b) that identity is corroborated by at least one independent external
signal — an OSM high/medium match, or a DMRCA high/medium match (Step 2). A
name with nothing checking it is not counted as verified, matching this
project's conservative stance throughout Steps 2–4.

---

## Part A — District coverage

All 25 official Sri Lankan districts, joining the existing Step 1/2/4
outputs on the shared NSDI `objectid` (pure local computation, no new
queries):

| District | NSDI pts | Named | OSM-high | OSM-med | DMRCA H/M | Triple | Verified % |
|---|---:|---:|---:|---:|---:|---:|---:|
| Jaffna | 8 | 2 | 2 | 2 | 1 | 0 | **62.5%** |
| Colombo | 57 | 32 | 24 | 2 | 6 | 8 | **50.9%** |
| Ampara | 74 | 21 | 23 | 10 | 5 | 3 | **41.9%** |
| Vavuniya | 24 | 11 | 5 | 3 | 1 | 0 | **37.5%** |
| Batticaloa | 41 | 2 | 11 | 4 | 0 | 0 | **34.1%** |
| Gampaha | 42 | 24 | 9 | 1 | 6 | 3 | **33.3%** |
| Kalutara | 69 | 41 | 8 | 3 | 12 | 3 | **29.0%** |
| Nuwara Eliya | 21 | 4 | 5 | 2 | 1 | 0 | 28.6% |
| Galle | 18 | 3 | 6 | 3 | 0 | 0 | 27.8% |
| Badulla | 20 | 4 | 4 | 0 | 2 | 0 | 25.0% |
| Kilinochchi | 4 | 2 | 1 | 0 | 0 | 1 | 25.0% |
| Trincomalee | 61 | 32 | 5 | 4 | 8 | 1 | 21.3% |
| Matale | 48 | 21 | 5 | 2 | 5 | 0 | 20.8% |
| Kegalle | 50 | 18 | 5 | 2 | 4 | 1 | 20.0% |
| Kandy | 107 | 24 | 11 | 6 | 7 | 1 | 16.8% |
| Ratnapura | 23 | 9 | 3 | 0 | 1 | 0 | 13.0% |
| Hambantota | 8 | 2 | 0 | 0 | 1 | 0 | 12.5% |
| Mannar | 27 | 10 | 4 | 0 | 0 | 1 | 11.1% |
| Kurunegala | 70 | 17 | 3 | 3 | 3 | 0 | 10.0% |
| Matara | 20 | 10 | 1 | 0 | 1 | 1 | 10.0% |
| Puttalam | 92 | 20 | 7 | 3 | 1 | 0 | **9.8%** |
| Polonnaruwa | 12 | 6 | 0 | 0 | 1 | 0 | **8.3%** |
| Anuradhapura | 62 | 15 | 2 | 1 | 1 | 1 | **4.8%** |
| Moneragala | 11 | 0 | 0 | 0 | 0 | 0 | **0.0%** |
| Mullaitivu | 0 | 0 | 0 | 0 | 0 | 0 | **0.0%** (no NSDI points at all) |
| **National** | **969** | 313 | 144 | 51 | 67 | 24 | **22.6%** |

(969, not 970 — one NSDI point has no district polygon match at all, per
Step 2.)

### Strong coverage (≥30% verified)

**Jaffna, Colombo, Ampara, Vavuniya, Batticaloa, Gampaha** — 6 districts.
Two different underlying reasons drive strength here, worth telling apart:
- **Colombo and Gampaha** are strong because of *volume across all three
  sources* — dense NSDI survey coverage, dense OSM mapping, and a real
  DMRCA name-match rate, all at once. This is the pattern a sustainable
  pilot should be built on.
- **Jaffna (62.5%)** is the single highest percentage but only has **8**
  NSDI points total — a small base means a couple of good matches swing
  the percentage a lot. Encouraging, but not yet a statistically solid
  signal on its own.
- **Ampara, Vavuniya, Batticaloa** lean heavily on OSM coverage
  specifically (Ampara: 23 OSM-high matches off just 74 NSDI points) —
  useful, but each is a single-source strength rather than the two/three-
  source convergence Colombo and Gampaha show.

### Weak coverage (<15% verified, or no data at all)

**Moneragala (0%), Mullaitivu (no NSDI points at all), Anuradhapura
(4.8%), Polonnaruwa (8.3%), Puttalam (9.8%), Matara (10.0%), Kurunegala
(10.0%), Mannar (11.1%), Ratnapura (13.0%)** — 9 districts, including two
of the country's largest-by-NSDI-count districts: **Kurunegala (70 points,
10.0%)** and **Puttalam (92 points, 9.8%)**. These aren't small, easily-
ignored gaps — Puttalam alone has almost as many NSDI mosque points as all
of Ampara, but barely a tenth of them are independently verifiable.
Mullaitivu is a distinct, more severe case: NSDI itself has **zero**
mosque points there — not weak verification, no source data whatsoever.

---

## Part B — Controlled OSM expansion

Reviewed the two tagging patterns Step 4 already used
(`amenity=place_of_worship`+`religion=muslim`, `building=mosque`) and
identified **three** additional, explicit, well-defined OSM tag
conventions — deliberately staying within named tag=value patterns, not a
name-text regex sweep (that approach was tried and abandoned in Step 4: it
timed out the shared Overpass server and is exactly the kind of broad/
arbitrary search this task said not to repeat):

| Pattern | Rationale | Result |
|---|---|---|
| `amenity=prayer_room` + `religion=muslim` | OSM's tag for a smaller prayer room/musallah — directly relevant to PrayerStop's own "practical place to pray" concept, not just full mosques | **0 results** |
| `building=religious` + `religion=muslim` | Generic religious-building tag, sometimes used instead of the more specific `building=mosque` | **0 results** |
| `historic=mosque` | Heritage/historic tagging convention for older mosque buildings | **0 results** |

**Total new unique OSM objects: 0.** All three queries ran successfully
(one needed a single retry after a transient 504 from the shared server,
confirmed via `/api/status` as general server load, not a rate-limit
issue) and returned nothing.

**This is a real, useful finding, not a wasted step.** It means Step 4's
original two patterns already achieve comprehensive *tag-convention*
coverage for how Sri Lankan OSM contributors mark mosques — there is no
significant additional tagging style being missed by query design. The
remaining gap (740 NSDI points with no OSM match at all, from Step 4) is
confirmed to be a genuine **data-availability gap** — mosques that simply
aren't mapped in OSM under *any* tag yet — not a query-coverage gap that
more/different tag patterns could close. Since nothing new was found:

- New named objects: 0
- Additional NSDI matches created: 0
- Additional high/medium-confidence matches: 0
- New ambiguity/conflict patterns: none (nothing new to conflict with)

The merged OSM set remains Step 4's 588 objects, confirmed unchanged by
re-running the dedup check against the (empty) new-query results.

---

## Part C — Recommendation

**Recommendation: a Colombo/Western Province pilot is justified now. A
Sri Lanka-wide pilot is not, yet — coverage is too uneven, not too weak
everywhere.**

This is explicitly a district-level call, not a national-average one:

- **National average (22.6%) actively hides a 62.5-point swing** between
  the strongest and weakest districts with real data (Jaffna 62.5% vs.
  Anuradhapura 4.8%, ignoring Moneragala's 0% and Mullaitivu's total
  absence of source data). A single national number would misrepresent
  both ends.
- **Western Province (Colombo + Gampaha + Kalutara combined): 168 NSDI
  points, 37.5% verified** — meaningfully above the national average, and
  unlike the scattered strong districts (Jaffna, Ampara, Vavuniya,
  Batticaloa are geographically spread across the country, not
  contiguous), this is one coherent region where a pilot's operational
  effort (support, QA, any manual review of ambiguous matches) can
  actually concentrate. Two of the three districts (Colombo, Gampaha) show
  the "strong on all three sources" pattern that's the most trustworthy
  kind of coverage found in Part A; Kalutara at 29.0% just misses the
  ≥30% bar but is close and rising the sample.
- **A national pilot today would launch with real dead zones.**
  Kurunegala (70 points, 10.0%) and Puttalam (92 points, 9.8%) are large
  districts by mosque count where the app would frequently have nothing
  verifiable to recommend — not edge cases, but two of the bigger
  districts in the whole dataset. Anuradhapura (4.8%), Polonnaruwa (8.3%),
  and Moneragala (0%) are worse still, and Mullaitivu has no NSDI source
  data at all. That's 9 of 25 districts at or near unusable, not a long
  tail of negligible outliers.
- **Part B's finding sharpens this**: since the controlled OSM expansion
  confirmed there's no more low-hanging OSM-tagging fruit to query for,
  closing the weak-district gap requires either genuinely new data (a
  different source entirely — provincial/regional mosque federation lists,
  a crowdsourced submission flow within the app itself, or targeted local
  survey effort in Kurunegala/Puttalam/Anuradhapura/Moneragala/Mullaitivu
  specifically) or accepting a materially worse experience if those
  regions are included in an initial launch.

**Bottom line:** ship the pilot scoped to Colombo/Gampaha/Kalutara (Western
Province), where 37.5% of NSDI mosque points already have an independently
verified identity and the strong districts driving that number are
geographically contiguous with each other — not scattered wins that would
need nationwide field support to reach. Treat full national coverage as a
follow-on goal gated on new data collection for the identified weak
districts, not on more matching-algorithm work — Steps 2 through 5 have
consistently found the same thing: the bottleneck is source data coverage,
not technique.
