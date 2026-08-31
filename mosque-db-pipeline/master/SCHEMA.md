# PrayerStop Mosque Master Dataset — Schema (Step 6A)

Built entirely from the outputs of Steps 1–5, under
`scratchpad/mosque-db-pipeline/`. No PrayerStop runtime app, database
schema, or Supabase instance was touched — this is a staging dataset for
future import, not a live one.

## Fields

| Field | Type | Description |
|---|---|---|
| `id` | string | Stable, deterministic, human-readable. See "ID scheme" below. |
| `name` | string \| null | Best available display name (see "Name/address/district resolution priority"). |
| `latitude` / `longitude` | number \| null | WGS84. Null when the record has no coordinate-bearing source (DMRCA-only records — see "Entity groups"). |
| `district` | string \| null | One of Sri Lanka's 25 districts. |
| `address` | string \| null | Free text, DMRCA-sourced only (the only source with real street addresses). |
| `dmrcaRegistrationNo` | string \| null | The DMRCA registration number, when a DMRCA record is linked. |
| `sources` | array | Full, unmodified provenance — see "Provenance model" below. **Never overwritten.** |
| `confidence` | `high` \| `medium` \| `low` | How much the underlying match evidence supports this being one real place. See "Confidence rules". |
| `verificationStatus` | `verified` \| `needs_review` \| `unverified` | Workflow state. **No record in this build is `verified`** — that status is reserved for a human decision, never set automatically (see below). |
| `verifiedAt` | ISO 8601 timestamp \| null | Null on every record in this build, for the same reason. |
| `womenPrayer`, `parking`, `airConditioning`, `wudu`, `jummah` | boolean \| null | Facility flags. **Null on every record** — checked every tag key present across the raw NSDI/DMRCA/OSM data pulled in Steps 1–5, and none of it currently captures these facilities for Sri Lanka mosques. Per the task's own rule ("must initially be null unless supported by a source or verified manually"), inventing a value here would be worse than leaving it null — these are only ever set by a future source that actually carries this data, or by a human reviewer. |
| `notes` | string \| null | Human-readable flags — most often a rejected low-confidence/ambiguous candidate from a *different* source, preserved so a reviewer doesn't have to re-derive it. |

## Entity groups (why 3,685, not 970 or 2,389)

One master record per real-world prayer place, built as the union of three
groups so **no source record from Steps 1–5 is ever silently dropped**:

| Group | Count | Anchor / coordinates | What it is |
|---|---:|---|---|
| **NSDI-anchored** | 970 | NSDI (ground-surveyed) | One record per NSDI point, enriched with its Step 2 DMRCA match and Step 4 OSM match — but **only when that match is high/medium confidence**. |
| **DMRCA-only** | 2,322 | None (no coordinates) | Every DMRCA record not merged into an NSDI-anchored record: the 2,207 Step 2 never matched at all, plus 115 that only had a *low*-confidence NSDI candidate (kept separate, not merged — the rejected candidate is preserved in `notes`). |
| **OSM-only** | 393 | OSM (community-mapped) | Every OSM object (588 total from Step 4) not merged into an NSDI-anchored record: 358 with no NSDI point within the 300m match radius at all, plus 35 with a same-district NSDI point nearby but a **name conflict** (Step 4's `ambiguous` tier — kept separate, not force-linked). |

**970 + 2,322 + 393 = 3,685.**

This directly implements "do not force matches" (carried over from Steps
2/4/5) at the master-dataset level: a low-confidence or ambiguous pairing
from any prior step becomes a *note* pointing a reviewer at the candidate,
never a silent merge into one record.

## Confidence rules

Applied per record, using only the already-vetted Step 2/4 match
confidences (never re-derived or loosened here):

**NSDI-anchored records:**
| Condition | confidence | verificationStatus |
|---|---|---|
| DMRCA match = high, OR OSM match = high | `high` | `needs_review` |
| DMRCA match = medium, OR OSM match = medium (and neither is high) | `medium` | `needs_review` |
| No high/medium match on either axis, but a low-confidence/ambiguous candidate exists (see `notes`) | `low` | `needs_review` |
| No match evidence at all | `low` | `unverified` |

**DMRCA-only records:**
| Condition | confidence | verificationStatus |
|---|---|---|
| Always (no coordinates to corroborate against) | `low` | `needs_review` if a low-confidence NSDI candidate exists (see `notes`), else `unverified` |

**OSM-only records:**
| Condition | confidence | verificationStatus |
|---|---|---|
| Ambiguous NSDI candidate exists (name conflict) | `low` | `needs_review` |
| Has a real, specific OSM name, no candidate conflict | `medium` | `unverified` |
| No usable name, no candidate conflict | `low` | `unverified` |

**`verified` is never set automatically.** It's earned by a human working
the review queue (Step 6B and beyond) — this build only ever produces
`needs_review` or `unverified`, which is the whole point of Step 6A being
a *foundation*, not a finished dataset.

## Name / address / district resolution priority

The top-level `name`/`address`/`district` fields are a **derived
convenience projection** — a "best current guess" for display — never a
destructive overwrite of any source's own value (every source's original
`name`/`address`/etc. stays intact, verbatim, inside `sources`).

- **name**: DMRCA (official government registration name) > OSM (often
  more specific on the ground, per Step 4's findings) > NSDI (frequently
  null or generic).
- **address**: DMRCA only — the only source with real street-level
  addresses. (OSM's `addr:street`/`addr:city`, when present, stay inside
  that source's own entry in `sources` but aren't promoted to the
  top-level `address` in this build, to keep the field single-provenance
  and unambiguous.)
- **district**: DMRCA's district (explicit, government-assigned) if
  matched, else NSDI's point-in-polygon district assignment (Step 2).

## Provenance model (`sources`)

An array, one entry per contributing source, each carrying that source's
**original, unmodified** values plus a link/id back to it:

```json
"sources": [
  { "type": "nsdi",  "id": "16027", "buildingId": "7400522",
    "originalName": "Mubarak Mosque", "latitude": 6.5776, "longitude": 80.1474,
    "district": "Kalutara",
    "note": "Sri Lanka NSDI 'Place of Worship' layer, ground-surveyed point geometry." },
  { "type": "dmrca", "id": "R/807/KL.42",
    "originalName": "BAITHUL MUBARAK BUKHARI THAKKIYA",
    "address": "MALIGAWATTE, MALIGAHENA", "city": "BERUWELA", "district": "Kalutara",
    "mosqueType": "T", "sourcePdf": "kalutura__KALUTARA-DISTRICT.pdf",
    "sourcePdfUrl": "https://muslimaffairs.gov.lk/wp-content/uploads/2023/12/KALUTARA-DISTRICT.pdf",
    "note": "Department of Muslim Religious and Cultural Affairs Registered Mosque List." },
  { "type": "osm", "id": "way/1189115488",
    "osmLink": "https://www.openstreetmap.org/way/1189115488",
    "originalName": "masjidul mubarak mosque", "latitude": 6.5775, "longitude": 80.1475,
    "sourceQuery": "building=mosque",
    "note": "OpenStreetMap, ODbL-licensed (© OpenStreetMap contributors)." }
]
```

- `type`: `"nsdi"` \| `"dmrca"` \| `"osm"`.
- `id`: source-native identifier — NSDI `objectid`, DMRCA `registrationNo`,
  OSM `"{type}/{id}"` (matches the OSM website's own URL scheme).
- Every other field in a `sources[]` entry is that source's own original
  value, copied as-is (never recomputed, never overwritten by another
  source).
- OSM entries additionally carry `osmLink` — a direct, clickable
  `openstreetmap.org` URL — and DMRCA entries carry `sourcePdfUrl`, the
  original government PDF the record came from (both real, dereferenceable
  links back to the source of record, per the task's "preserve source
  IDs/links" requirement).

## ID scheme

Deterministic and human-readable, not opaque UUIDs — so anyone reading a
raw id can tell its provenance at a glance:

- NSDI-anchored: `nsdi-{objectid}` — e.g. `nsdi-16027`.
- DMRCA-only: `dmrca-{sanitized registrationNo}` — e.g.
  `dmrca-R-0318-AM-03` (slashes/spaces replaced with `-`). One real
  duplicate registration number existed in the raw DMRCA data
  (`R/2628/BD/92`, noted back in Step 2); the second occurrence gets a
  `-2` suffix so every id stays globally unique.
- OSM-only: `osm-{osmType}-{osmId}` — e.g. `osm-way-1189115488`.

Re-running the build scripts against the same Step 1–5 outputs reproduces
identical ids — this is a deterministic function of the source data, not a
random assignment.

## Known limitations (carried forward honestly, not hidden)

- **63% of records have no coordinates** (the 2,322 DMRCA-only group) —
  Step 3 found free/open geocoding too unreliable (~5% trustworthy hit
  rate) to auto-populate this; closing this gap needs either a better
  geocoding pass with strict human filtering, or field/crowdsourced
  collection, not a rerun of this script.
- **Only 8 records have all three sources** (NSDI+DMRCA+OSM) — the
  "triple-corroborated" ideal case from Step 4 is real but rare.
- **District coverage is highly uneven** (Step 5) — this dataset inherits
  that unevenness directly; a Colombo/Western-Province-scoped view of it
  is meaningfully more trustworthy than the national figures.
- **No manual verification has happened yet.** Every `needs_review` record
  is a *candidate*, not a fact.
