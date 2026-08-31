# 02 — Product Requirements & MVP Scope

## Problem statement

A Muslim in Sri Lanka needs to pray while out of the house and wants a fast, reliable answer to: *where should I go, and will I make it in time?* Today this requires manually knowing prayer times, guessing which nearby mosque is realistically reachable, and separately checking traffic. PrayerStop collapses that into one screen.

## MVP scope

The MVP is a **single-purpose Home experience**. In scope:

1. **Home screen** — the app's primary (likely only) screen for MVP.
2. **NOW / NEXT selector** — lets the user switch which prayer they're planning for.
3. **Prayer timing context** — current prayer window, time remaining, and the next prayer's start time, sourced from ACJU timetables.
4. **Current location** — the user's live position, used as the origin for distance/ETA calculations.
5. **Nearby prayer places** — candidate mosques/musallahs near the user.
6. **Travel ETA** — traffic-aware estimated time to reach the top candidate(s).
7. **Recommendation** — the app surfaces the single most practical place to pray, not just the nearest one.
8. **Navigation handoff** — a way to route the user to the recommended place (e.g. an external maps app).

## Out of scope for MVP

Explicitly excluded — do not build without a new decision:

- Quran
- Hadith
- Zakat
- Social features
- User-generated reviews
- Generic Islamic content (articles, duas, etc.)
- Full prayer tracking / logging history
- Complex authentication (accounts, login, profiles)
- Unnecessary AI features

## Functional requirements

### FR1 — NOW/NEXT context
- The user can select **NOW** (currently active prayer) or **NEXT** (upcoming prayer).
- **NOW** answers whether the user can arrive before the current prayer ends, including estimated arrival and minutes available after arrival.
- **NEXT** plans against the ACJU prayer start/Adhan time: it shows a calculated leave-by time from route ETA and an arrival-by time equal to the prayer start. It must not use or imply mosque-specific Jama'ah times.
- The app must never infer or assume whether the user has personally prayed a given prayer — it only reflects timetable + selected context.
- Default selection on cold open is **NOW** (decided — see [03-ux-and-user-flows.md](./03-ux-and-user-flows.md)).

### FR2 — Prayer timing
- The app must determine, from ACJU timetable data, the currently active prayer window and the next prayer's start/end, based on the user's date and applicable zone/region.
- *Open item:* ACJU timetables may vary by district/zone in Sri Lanka. Confirm whether a single national timetable is sufficient for MVP or whether zone selection is required — this is unverified (see [06-data-and-api-plan.md](./06-data-and-api-plan.md)).

### FR3 — Location
- The app must obtain the user's current location (with permission) to use as the ETA/distance origin.
- The app must handle location permission denial gracefully (see UX doc for the fallback flow).

### FR4 — Nearby prayer places
- The app must retrieve candidate prayer places near the user via Google Places.
- Candidates should be filterable to relevant place types (mosques; "musallah"/prayer room support is aspirational and depends on Places data quality — flagged as an open item, not guaranteed for MVP).

### FR5 — Local ranking before routing
- The app must locally filter/rank candidates by straight-line distance and prayer-window feasibility **before** calling any traffic-aware routing API.
- Only a small number of top candidates may be sent to Google Routes. This is a hard architectural constraint, not a suggestion (see [05-technical-architecture.md](./05-technical-architecture.md)).

### FR6 — Recommendation logic
- The app must combine ETA, buffer time, and remaining prayer window to recommend one place as the primary answer, with the reasoning being about *reachability*, not just proximity.
- The app must clearly communicate when no candidate is reachable before the prayer window ends, using factual language (arrival time vs. window end), never a religious judgment (decided — see [03-ux-and-user-flows.md](./03-ux-and-user-flows.md)).
- Home displays **one recommendation plus two alternates** (decided — full discovery/browsing is a later phase, not MVP).

### FR7 — Navigation
- The user must be able to act on the recommendation by launching turn-by-turn navigation (external maps app) to the chosen place.

## Non-functional requirements

- **Speed**: the recommendation should feel near-instant after location is available; the 3-tier filtering strategy exists specifically to keep this fast and cheap (see architecture doc).
- **Cost control**: traffic-aware routing calls are the most expensive external dependency and must be minimized by design, not by rate-limiting after the fact.
- **Clarity over completeness**: prefer a single confident recommendation with minimal secondary detail over a dense list.

## Success criteria (qualitative — MVP)

- A user can go from opening the app to seeing a concrete "go here, you'll make it" (or "you won't — here's the closest option") answer without extra taps beyond the NOW/NEXT toggle.
- The recommended place is not simply "nearest by distance" when a better reachable option exists.

*Quantitative success metrics (e.g. target latency, accuracy thresholds) are intentionally not defined here — they are a product decision, not something to fabricate. Flagged for your input in the summary.*

## Assumptions carried into other docs

- No user accounts for MVP — session/context is ephemeral (location + selected prayer context only).
- Single country/locale scope (Sri Lanka) for MVP; no i18n requirement stated yet.
