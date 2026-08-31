# 06 — Data & API Architecture

> **Important**: this document deliberately does not assert specific external API request/response shapes, endpoints, auth schemes, quotas, or pricing for an ACJU feed/API, since none of that has been verified yet. Anything of that nature must be confirmed against current official documentation at implementation time, not assumed from prior/general knowledge. **Google Places (New) was verified 2026-08-21** and **Google Routes (New) was verified 2026-08-21** — see sections 2 and 3 below — so those are no longer "verify at implementation time" items. Where a concrete detail would normally go for the still-unverified ACJU feed, this doc says "verify" instead of guessing.

## Data domains

### 1. Prayer timetable data (ACJU)

- **Purpose**: source of truth for daily prayer start/end times.
- **Status**: ACJU publishes monthly, per-zone PDF timetables (confirmed from a real sample — Zone 01 covers Colombo/Gampaha/Kalutara Districts). Whether there's an official API/feed instead of manual PDF distribution is still unconfirmed — see "Open verification items" below.
- **Confirmed shape**: a table keyed by date (day + month abbreviation, no year printed) with Fajr, Sunrise, Dhuhr ("LUHR" in the PDF's own header text), Asr, Maghrib, Isha — plus an apartment-height time-adjustment table (not yet parsed/used).
- **Extraction tooling**: `scripts/acju/parse-acju-pdf.js` parses one month's PDF into normalized JSON — ISO `date`, 24-hour `HH:MM` times, plus `zone`/`regions`/`country` metadata. It locates the header row and column order from the PDF's own text rather than assuming fixed positions, and validates the parsed days (sequential day numbers, correct day-count for the month, chronological time ordering) before writing output. `scripts/acju/build-zone-dataset.js` then merges every month's extraction for a zone into one consolidated `data/acju/zone-<id>.json` (sorted, deduped, and checked for date gaps) — this merged file is what the app actually consumes (see "Prayer-time architecture" in [05-technical-architecture.md](./05-technical-architecture.md)).
- **Coverage so far**: Zone 01 (Colombo/Gampaha/Kalutara), August–December 2026 — 153 days, no gaps, no parser changes needed between months. Each month was independently spot-checked against its source PDF's raw text with an exact match, on top of both scripts' own internal validation. Per-month extractions live in `assets/images/prayer-times-acju-pdfs/` (raw pipeline artifacts); the consolidated, app-consumed dataset is `data/acju/zone-01.json`.
- **Integrated as of Phase 2**: this data now powers the real prayer engine and Home UI — see [05-technical-architecture.md](./05-technical-architecture.md) and `lib/prayer-times/`.
- **Not yet tried**: a different zone's PDF, which may have different regions/districts text worth spot-checking when it's available.
- **Proposed storage (still open)**: whether this eventually moves to Supabase Postgres (for easier updates without a new app release) instead of a bundled JSON file is undecided — bundled JSON works fine for a single zone's fixed 5-month window today. Ingestion process (manual PDF download + run the two scripts, vs. some future scrape) is also still manual.

### 2. Prayer places (mosques / musallahs)

- **Purpose**: candidate destinations for the recommendation engine.
- **Source — verified 2026-08-21, implemented in Phase 3**: Google Places API (New), specifically **Nearby Search (New)**: `POST https://places.googleapis.com/v1/places:searchNearby`. Authenticated via a plain API key sent as the `X-Goog-Api-Key` header (no OAuth needed for this endpoint) — the (New) family of Places APIs also requires an `X-Goog-FieldMask` header naming exactly which response fields to return (there is no default field set; an unset mask is rejected). Request body used here: `includedTypes: ['mosque']` (a valid Places Table A type), `locationRestriction.circle` (center lat/lng + radius, max 50,000m), `maxResultCount` (max 20 per call), and `regionCode: 'LK'` to bias/interpret results for Sri Lanka. Implemented server-side only, in `app/api/nearby-places+api.ts` — see "Prayer-place architecture" in [05-technical-architecture.md](./05-technical-architecture.md).
- **The real Google Place ID (`places.id`) is kept all the way through the pipeline** (added Phase 5) — not just for internal candidate identification, but because `lib/prayer-places/navigation.ts` uses it as `destination_place_id` when opening Google Maps, so navigation lands on the actual named mosque listing rather than an anonymous coordinate pin. No extra API call or field needed — `id` was already part of the field mask from Phase 3.
- **Temporarily closed places are filtered out (verified field name 2026-08-21, added Phase 4)**: the field mask also requests `places.businessStatus` (verified enum: `OPERATIONAL` / `CLOSED_TEMPORARILY` / `CLOSED_PERMANENTLY` / `FUTURE_OPENING`). `lib/prayer-places/normalize-nearby-places.ts` drops any place with `businessStatus === 'CLOSED_TEMPORARILY'` **before** local distance ranking or the Route Matrix candidate limit is ever applied — PrayerStop must never recommend or send a Routes request for a place nobody can currently visit. A place with **no** `businessStatus` at all is kept, not excluded — missing data is never treated as evidence of closure (see the "known vs. unknown" rule in CLAUDE.md). This is deliberately narrower than "any closed-looking signal": it does **not** look at `currentOpeningHours`/open-now status at all — see the standing constraint below on why ordinary opening-hours data still isn't a real accessibility signal.
- **Pricing (re-verified 2026-08-21)**: Nearby Search (New) is billed under the **"Nearby Search Pro"** SKU (99F9-A108-83A6). Pay-as-you-go, no subscription required:

  | Monthly volume | Price / 1,000 calls |
  |---|---|
  | 0 – 5,000 | Free |
  | 5,001 – 100,000 | $32.00 |
  | 100,001 – 500,000 | $25.60 |
  | 500,001 – 1,000,000 | $19.20 |
  | 1,000,001 – 5,000,000 | $9.60 |
  | 5,000,000+ | $2.40 |

  Optional subscription plans exist as an alternative (Essentials $275/mo includes 100,000 calls/mo, Pro $1,200/mo includes 250,000/mo; overage bills at the table above) — not relevant until real scale. This app calls the endpoint once per Home load / manual refresh (no caching yet — see below), so a single developer/tester stays far inside the free tier; this becomes a real cost line item only once there's uncached public traffic.
- **Coverage in Sri Lanka — confirmed live 2026-08-21**: a real query against central Colombo (6.9271, 79.8612) returned 10 real, named mosques with correct coordinates and street addresses (e.g. Jami Ul-Alfar Mosque, Colombo Grand Mosque, Dawatagaha Jumma Masjid) — see "Verification status" in [05-technical-architecture.md](./05-technical-architecture.md). Coverage for broader "musallah"/prayer-room-type places (vs. `mosque` specifically), and coverage outside dense Colombo, is still unconfirmed and should be spot-checked as real usage expands to other areas.
- **Proposed caching**: cache Places responses (or a curated subset) in Supabase, keyed by geographic tile/area, to avoid repeat calls for the same area across users/sessions. TTL and refresh strategy TBD — not implemented in Phase 3 (every Home load currently makes a fresh call).
- **Standing constraint (2026-08-21, reaffirmed with the Phase 4 closure filter)**: Google Places' `currentOpeningHours`/opening-hours data must **not** be treated as proof a mosque is actually open/accessible for prayer, and Places has no concept of Jama'ah (congregation) time at all. Mosque closing time, physical accessibility, and Jama'ah timing are all currently unknown and unverifiable from any data source this app has access to. This mirrors the ACJU/Isha situation in [05-technical-architecture.md](./05-technical-architecture.md) — the general rule is the same: **only make a feasibility claim when the required timing information is actually available**. The `businessStatus`-based `CLOSED_TEMPORARILY` filter above is a narrow, deliberate exception to this caution, not a reversal of it: `businessStatus` is Google's own explicit closure signal (an operator or Google marking the place closed), not an inference from opening hours — ordinary "closed right now" (outside business hours) is *not* filtered, and current opening-hours status still does not mean guaranteed prayer accessibility.

### 3. Travel ETA

- **Purpose**: traffic-aware travel time from the user's current location to a short list of candidate places.
- **Source — verified 2026-08-21, implemented in Phase 4**: Google Routes API (New), specifically **Compute Route Matrix**: `POST https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix` — one call returns travel time/distance for *all* origin×destination pairs at once, rather than one call per destination (`Compute Routes`, the single-pair sibling endpoint, is not used here). Authenticated via `X-Goog-Api-Key` (a plain API key, same mechanism as Places, but **Routes API must be separately enabled** in Google Cloud Console — it's a distinct product even under the same project/key). The `X-Goog-FieldMask` header is **strictly required** (no default field set) — this app requests `originIndex,destinationIndex,duration,distanceMeters,condition,status`; `status` is included deliberately, since Google's own docs warn that omitting it makes failed elements look OK. Request body: `travelMode: 'DRIVE'`, `routingPreference: 'TRAFFIC_AWARE'` (traffic-aware; `TRAFFIC_AWARE_OPTIMAL` also exists — more accurate, slower, capped at 100 elements — not needed at our scale), 1 origin (device location) × **up to 3 destinations** (see below). Implemented server-side only, in `app/api/route-matrix+api.ts` — see "Prayer-place architecture" in [05-technical-architecture.md](./05-technical-architecture.md).
- **Candidate cap — 3 destinations per call**: only the 3 *nearest-by-straight-line-distance* candidates (from the already-fetched Places results) are ever sent to Routes — never the full Places result set. This is `lib/prayer-places/select-candidates.ts#selectNearestCandidates`, the "local filter/rank before Routes" step from the pipeline below, made concrete.
- **Pricing (verified 2026-08-21)**: traffic-aware routing (`TRAFFIC_AWARE`/`TRAFFIC_AWARE_OPTIMAL`) bills at the **Pro** tier, billed **per element** (1 origin × N destinations = N elements), not per call:

  | Tier | Free/month | $/1,000 elements (0–100K) | at 5M+ |
  |---|---|---|---|
  | Essentials (non-traffic-aware) | 10,000 | $5.00 | $0.38 |
  | **Pro (traffic-aware — what we use)** | **5,000** | **$10.00** | **$0.75** |
  | Enterprise (two-wheel, etc.) | 1,000 | $15.00 | $1.14 |

  At 3 elements/Home-load, 5,000 free elements/month ≈ **~1,600 Home loads/month** free — same "fine for dev, revisit before public launch without caching" caveat as Places pricing above.
- **Coverage confirmed live 2026-08-21**: a real Route Matrix call against 3 real Colombo mosque coordinates (from the Places verification above) returned real `ROUTE_EXISTS` durations and distances for all 3 (e.g. 419s/2.9km, 586s/3.9km, 423s/3.2km) — confirming the endpoint, auth, field mask, and request shape all work correctly end to end with a real key that has both Places and Routes enabled.
- **Limits**: standard `TRAFFIC_AWARE` allows up to 625 elements/request — far more than this app's 1×3 usage ever needs.
- **Not cached / ephemeral**: real traffic-aware ETA is time- and traffic-sensitive and is not persisted as reusable data — it's recomputed on every Home load / manual refresh.
- **Graceful degradation**: an individual destination Google can't route to (`ROUTE_NOT_FOUND`) or that fails independently is dropped from the ranked results rather than given a fabricated ETA (`lib/prayer-places/normalize-route-matrix.ts`, `apply-travel-times.ts`) — if *all* 3 nearest candidates turn out unroutable, the app surfaces this as a distinct "no reachable prayer places found" state, not silently as "no places exist" (`hooks/nearby-places-session.tsx`'s `unreachable` status).

### 4. Map display (Nearby screen, Phase 6)

- **Purpose**: visual map of the same already-fetched candidates — not a data source itself. Adds **no new Places/Routes calls**; it renders the exact session data described in sections 2–3.
- **Source**: **expo-maps**, iOS only (`AppleMaps.View`). Uses Apple's own MapKit under the hood — no Google Maps JavaScript/SDK product involved on iOS, so there's no additional Google API cost or key for the iOS map itself.
- **Android — a real, currently-unmet requirement, not yet configured**: expo-maps' Android path (`GoogleMaps.View`) requires its own **Maps SDK for Android** API key (`android.config.googleMaps.apiKey` in `app.json`) — a *third* Google credential, distinct from the Places and Routes keys, requiring its own Cloud Console setup (enable the API, generate a key, register the app's SHA-1 certificate fingerprint). Not configured as of Phase 6; the Nearby screen simply doesn't offer the Map toggle on Android as a result — see [05-technical-architecture.md](./05-technical-architecture.md). Setting this up is a prerequisite for Phase 7's "Android map support" item in [07-roadmap.md](./07-roadmap.md).

### 5. User/session context

- **Purpose**: current location, selected NOW/NEXT context.
- **Status**: ephemeral, client-side only for MVP — no account, no persistence, per the "no complex auth" requirement in [02-product-requirements.md](./02-product-requirements.md).
- **Location — real as of Phase 2, now wired into ranking as of Phase 3**: device GPS coordinates via `expo-location` (foreground permission + `getCurrentPositionAsync`), held only in React state (`hooks/use-device-location.ts`) — never persisted. Reverse-geocoded to a short "neighborhood, city" label via `Location.reverseGeocodeAsync` (the OS's on-device geocoder, not a Google API) when available, falling back to raw coordinates otherwise. As of Phase 3, the same coordinates are also sent (server-side, via our own API route, never directly to Google from the client) to Google Places to discover nearby mosques — see "Prayer places" above and "Prayer-place architecture" in [05-technical-architecture.md](./05-technical-architecture.md).

## Proposed conceptual data model (first pass — subject to revision)

This is a starting proposal for discussion, not a committed schema:

```
prayer_timetable
  id
  date
  zone (nullable if a single national timetable is sufficient — TBD)
  fajr_start, sunrise, dhuhr_start, asr_start, maghrib_start, isha_start

prayer_place (cached from Google Places)
  id
  google_place_id
  name
  lat, lng
  place_type
  last_synced_at

place_area_cache (optional — for reducing repeat Places calls)
  tile_key / area_key
  fetched_at
  place_ids[]
```

No `user` table is proposed for MVP, consistent with the no-accounts decision.

## API integration strategy (from product spec — binding constraint)

1. **Discover** nearby candidates via Google Places. — *Implemented, Phase 3.*
2. **Filter/rank locally** using straight-line distance — *Implemented, Phase 4: `selectNearestCandidates` keeps only the nearest 3 before any Routes call.*
3. **Send only the top few candidates** (3) **to Google Routes** for traffic-aware ETA. — *Implemented, Phase 4.*
4. **Apply PrayerStop's own recommendation logic** (feasibility vs. the real prayer window) to pick the best option from that small, already-ETA'd set. — *Implemented: `build-place-scenario.ts`, unchanged in shape since Phase 3 — it was already ETA-source-agnostic.*

This ordering exists to control cost and latency and must not be short-circuited (e.g. by calling Routes for the full candidate list "for simplicity").

## Open verification items (must resolve before implementation)

1. **ACJU data source**: no official API/feed has been found — ACJU publishes monthly per-zone PDF timetables (e.g. "01-COLOMBO DISTRICT, GAMPAHA DISTRICT, KALUTARA DISTRICT" = Zone 01), confirming timetables **do** vary by zone, so a single national timetable is not sufficient. A parser for this PDF format now exists (`scripts/acju/parse-acju-pdf.js`, see below) — but *how ACJU's PDFs get into this repo/pipeline each month* (manual download vs. some scrape) is still unresolved.
   - **Process note**: the PDF itself never states the calendar year — only day and month (e.g. "1-Aug"). The parser requires an explicit `--year` and will not infer it from the file's creation metadata or upload path (both can be misleading — e.g. this file's metadata says it was generated `2025-07-01`, but the actual published schedule it contains has been confirmed as **August 2026**, Zone 01). The year must be confirmed against the real published schedule each time, by a human, before running the parser — this is a per-PDF confirmation step, not something the tooling can determine on its own.
2. ~~**Google Places coverage**~~ — **partially resolved 2026-08-21**: confirmed real, correct mosque results for central Colombo with a live key (see section 2 above). Coverage for musallah/prayer-room-type places and areas outside Colombo is still unconfirmed.
3. ~~**Google Places / Routes API current specifics**~~ — **resolved 2026-08-21 for both**: Google Places (New), see section 2 above; Google Routes (New) Compute Route Matrix, see section 3 above.
4. **Supabase schema finalization**: the conceptual model above needs a real design pass once ingestion sources are confirmed (item 1 in particular may change the shape significantly, e.g. if zone-based timetables are required).
5. ~~**API key handling**~~ — **resolved 2026-08-21**: both Google Places and Google Routes calls are proxied server-side via Expo Router API routes (`app/api/nearby-places+api.ts`, `app/api/route-matrix+api.ts`), never called from the client. See [05-technical-architecture.md](./05-technical-architecture.md).
