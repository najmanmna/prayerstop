# 07 — Development Roadmap

This is a phased plan, not a scheduled/dated commitment. Sequencing reflects dependency order (e.g. timetable + location must exist before recommendation logic can be tested meaningfully).

## Phase 0 — Documentation & architecture foundation (this work)

- [x] `/docs` structure established.
- [x] `CLAUDE.md` updated as the AI development guide.
- No application code changes.

## Phase 1 — Home UI (mock data) — complete for now

Key decisions resolved: default-NOW, single-Home-route navigation, factual "too late to reach" language, one recommendation + two alternates, server-side API layer, no data-fetching library yet, forest-green accent, light-mode-only. See decision logs in [02](./02-product-requirements.md), [03](./03-ux-and-user-flows.md), [04](./04-design-system.md), [05](./05-technical-architecture.md).

- [x] Home screen UI built end-to-end with mock prayer times, places, ETA, and recommendation/feasibility status.
- [x] NOW/NEXT selector as the core interaction, including a live per-second countdown and NEXT's "leave by" framing.
- Further visual iteration is paused — Phase 1 is considered done unless a future change is required for functionality (see Phase 2+).

## Phase 2 — Real data foundations — in progress

- [x] Add `expo-location`, request foreground permission, and read the device's current coordinates (`hooks/use-device-location.ts`), reverse-geocoded to a "neighborhood, city" label via the OS's own geocoder. Home now displays the real location in place of the mock location string. See [05-technical-architecture.md](./05-technical-architecture.md).
- [x] Real ACJU prayer-timetable logic: `PrayerTimeRepository` → prayer engine → `usePrayerTimes()` hook → Home UI, backed by the extracted Zone 01 Aug–Dec 2026 dataset. Active/next prayer, live per-second countdowns, and the daily schedule strip are all real now — see [05-technical-architecture.md](./05-technical-architecture.md) for the architecture and `lib/prayer-times/__tests__/` for coverage (36 tests: normal days, exact-boundary transitions, midnight/Isha→Fajr in both directions, and all four Aug–Dec month boundaries against the real dataset).
- [x] Wire the server-side API layer for Google Places and Google Routes — mosque/place data and travel time are both real (Phase 3 and 4, below).
- Still open: how ACJU PDFs actually get into this repo each month (manual download + `parse-acju-pdf.js`/`build-zone-dataset.js`, vs. some future scrape) — see [06-data-and-api-plan.md](./06-data-and-api-plan.md).

## Phase 3 — Places & local ranking — complete

- [x] Verified current (2026) Google Places API (New) specifics — endpoint, auth, pricing, field masks — against live documentation rather than assumptions. See [06-data-and-api-plan.md](./06-data-and-api-plan.md).
- [x] Integrated Google Places (New) Nearby Search for nearby mosque discovery, via a server-side Expo Router API route (`app/api/nearby-places+api.ts`) so the API key never reaches the client. See "Prayer-place architecture" in [05-technical-architecture.md](./05-technical-architecture.md).
- [x] `PrayerPlaceRepository` abstraction (`lib/prayer-places/`) so the UI depends only on an interface, mirroring `PrayerTimeRepository`.
- [x] Local ranking module and feasibility windowing (`lib/prayer-places/build-place-scenario.ts`), with test coverage.
- [x] Replaced mock nearby places with real results on Home; handles loading, permission failure, API failure, zero results, and stale-location states gracefully. (The original `hooks/use-nearby-places.ts`/`app/index.tsx` from this phase were later retired in Phase 6 in favor of a shared session — see below.)
- [x] Verified the real success path with a live `GOOGLE_PLACES_API_KEY` — confirmed real, correct mosque results for central Colombo (see "Verification status" in [05-technical-architecture.md](./05-technical-architecture.md)). Coverage outside Colombo/for musallah-type places is still an open spot-check item.

## Phase 4 — Traffic-aware travel time — complete

- [x] Verified current (2026) Google Routes API (New) specifics — Compute Route Matrix endpoint, auth, required/response fields, pricing, limits — against live documentation. See [06-data-and-api-plan.md](./06-data-and-api-plan.md).
- [x] `selectNearestCandidates` (`lib/prayer-places/select-candidates.ts`) — local straight-line-distance pre-filter, capped at 3 candidates, run *before* any Routes call.
- [x] `app/api/route-matrix+api.ts` — server-side Google Routes proxy (Compute Route Matrix, `TRAFFIC_AWARE`, 1 origin × ≤3 destinations), holding `GOOGLE_ROUTES_API_KEY` server-side only.
- [x] `TravelTimeRepository` abstraction (`lib/prayer-places/travel-time-repository.ts`) + `GoogleRouteMatrixRepository`, mirroring `PrayerPlaceRepository`.
- [x] `normalizeRouteMatrixResponse` + `applyTravelTimes` — normalize Google's raw response and merge real durations onto candidates, dropping (never fabricating) any `ROUTE_NOT_FOUND` or individually-failed destination.
- [x] Replaced the Phase 3 straight-line ETA placeholder (`estimateEtaMinutes`, deleted) with real traffic-aware duration from Route Matrix — `build-place-scenario.ts` and the Home UI needed no changes, since they already consumed `etaMinutes` as an opaque number.
- [x] NOW arrival/feasibility (`getArrivalOutcome` vs. the known deadline), NEXT leave-by (`offsetClock(start, -etaMinutes)`), and Isha's permanently-unknown deadline all verified to work correctly against real durations — see `lib/prayer-places/__tests__/travel-time-feasibility.test.ts`.
- [x] Handles individual failed elements, `ROUTE_NOT_FOUND`, whole-request API errors, timeouts (8s, server-side `AbortController`), and zero routable candidates (`unreachable` hook state) gracefully.
- [x] Verified the real success path live: a real Route Matrix call against 3 real Colombo mosque coordinates returned real durations/distances for all 3. See "Verification status" in [05-technical-architecture.md](./05-technical-architecture.md).
- [ ] A full visual check of Home rendering real, traffic-aware ETA — deferred by explicit choice (would require installing browser-automation tooling not currently in this project); the pipeline itself is verified live end to end.

## Phase 5 — Real recommendation logic & navigation — complete

- [x] NOW feasibility (arrival vs. the active prayer's known deadline) confirmed correct against real Places/Routes data — unchanged logic from Phase 4, re-verified here as part of the final recommendation.
- [x] **Fixed a real bug found via live testing**: NEXT's feasibility previously compared an arrival time computed from "now" against the next prayer's bare `HH:MM` window strings — silently wrong whenever the next prayer is tomorrow (e.g. planning for Fajr late at night), producing a false "too late." `buildPlaceScenario` now takes an explicit `context` + the engine's own day-rollover-safe `secondsUntilNextStart`/`secondsUntilActiveEnds` instead of re-deriving timing from window strings. See "Prayer-place architecture" in [05-technical-architecture.md](./05-technical-architecture.md) and the regression tests in `lib/prayer-places/__tests__/build-place-scenario.test.ts` and `recommendation.test.ts`.
- [x] Fajr/Sunrise, Isha's unknown deadline, and the between-prayers (Sunrise-to-Dhuhr) gap all re-verified correct under the new context-aware logic.
- [x] New deterministic "practicality" tiebreak for multiple reachable candidates: prefer the closer mosque when real ETAs are similar (within 5 min); prefer the significantly faster mosque when traffic makes the closer one materially slower (`lib/prayer-places/build-place-scenario.ts#comparePracticality`).
- [x] Temporarily-closed and unroutable places confirmed excluded from the final recommendation end-to-end (already enforced upstream in Phase 3/4; now covered by a full-pipeline test in `recommendation.test.ts`).
- [x] `PrayerPlace`/`RankedPrayerPlaceCandidate` now carry `coordinates`, threaded through from Google Places all the way to the recommendation, so navigation has a real destination to point at.
- [x] **Navigate is wired up**: `lib/prayer-places/navigation.ts` opens Google Maps (not Apple Maps) with the recommended place's real Google Place ID — the Android `google.navigation:` intent, or the universal Google Maps web/app-link URL on iOS and web. Kept separate from UI components and fully unit-tested (`lib/prayer-places/__tests__/navigation.test.ts`), including the platform-specific-URL → web-URL fallback path.
- [x] Verified the complete flow live: real GPS-standin coordinates → real ACJU prayer state → real Google Places → real Route Matrix → correct recommendation → correct Google Maps navigation URL with the real Place ID — see "Verification status" in [05-technical-architecture.md](./05-technical-architecture.md).
- Existing UI/visual design unchanged — only the underlying recommendation data and the Navigate button's behavior changed.

## Deployment prep — real-world TestFlight testing — in progress

Not a product-feature phase; tracked separately since it's infrastructure, not app logic. Goal: distribute to the project owner's iPhone and a few friends via TestFlight, with `GOOGLE_PLACES_API_KEY`/`GOOGLE_ROUTES_API_KEY` staying server-side.

- [x] Verified current (2026) EAS Hosting / Expo Router API-route deployment specifics against live documentation. Decision: **EAS Hosting** (Expo Router-native, reuses the same `eas` CLI/account as EAS Build, no second hosting vendor). See "High-level shape" in [05-technical-architecture.md](./05-technical-architecture.md).
- [x] `app.json`: `web.output` changed to `"server"` — verified locally (`npx expo export --platform web` correctly emits both API routes as server functions).
- [x] `app.json`: `ios.bundleIdentifier` set to `com.ahamedwebstudio.prayerstop`.
- [x] `eas.json` added (development/preview/production build profiles, `eas submit` production profile).
- [ ] **Needs the project owner's own Expo account session** (not something this tooling can perform on someone's behalf): `eas login`.
- [ ] Create `GOOGLE_PLACES_API_KEY`/`GOOGLE_ROUTES_API_KEY` as EAS environment variables with **Sensitive** visibility (not Secret — incompatible with EAS Hosting).
- [ ] `eas deploy --environment production`, set up a stable `production` alias.
- [ ] Add `["expo-router", { "origin": "<the deployed URL>" }]` to `app.json`'s `plugins`.
- [ ] **Needs an Apple Developer Program account**: `eas build:configure`, link Apple credentials, `eas build --platform ios`, submit to TestFlight.

## Phase 6 — Nearby/Map, Place Details & shared session data — complete

- [x] **Shared nearby-places session**: `hooks/nearby-places-session.tsx` (`NearbyPlacesSessionProvider` + `useNearbyPlacesSession()`), mounted once at the app root above the router `Stack` — Home, Nearby, and Place Details all read the same fetched session; none of them fetch independently. Replaces the Phase 3–5 per-screen `useNearbyPlaces` hook, which would have caused duplicate Places/Routes calls the moment a second screen existed. See "Shared nearby-places session" in [05-technical-architecture.md](./05-technical-architecture.md).
- [x] `lib/prayer-places/fetch-nearby-session.ts` — the orchestration (Places → local filter → Routes → merge) extracted to a pure, framework-free function so it's the one and only call site for `placeRepository`/`travelTimeRepository`, and directly unit-testable.
- [x] Refresh strategy implemented exactly as specified: reuse the session while fresh; refetch only on first load, a significant device move (>500m), or an explicit `refresh()` — never on a timer. A time-based staleness flag (10 min) drives a "may be a little out of date" prompt only, never an automatic refetch. See `lib/prayer-places/session-staleness.ts`.
- [x] `RankedPrayerPlaceCandidate` now also carries `routeCondition` (Google Routes' own condition string) — the full "preserve place ID, name, coordinates, address, distance, duration, route status" data set the session is required to retain.
- [x] **Bottom tab navigation**: Home | Nearby | Settings (`app/(tabs)/_layout.tsx`). Settings is intentionally minimal (app version only) — no accounts/preferences yet.
- [x] **Nearby screen** (`app/(tabs)/nearby.tsx`): current location, every candidate from the shared session (flattened, not hero+alternates — this is the browse view), existing travel ETAs, a List/Map toggle, and a "selected place" concept on the Map view. Explicit Refresh action; never triggers its own Places/Routes request.
- [x] **Map view**: real interactive map via **expo-maps** (`AppleMaps.View`), **iOS only** — Android's Google Maps path needs its own Maps SDK API key that isn't configured; rather than ship a broken map, the toggle simply isn't offered on Android/web. expo-maps requires a native/dev-client build (not Expo Go) — not a new constraint, since EAS Build was already adopted for TestFlight. Confirmed the `expo-maps` config plugin doesn't clobber the existing `NSLocationWhenInUseUsageDescription` text by reading its installed plugin source directly.
- [x] **Place Details screen** (`app/place/[id].tsx`, a stack screen, not a tab): name, address, distance, current travel ETA, feasibility/arrival info, Navigate — reusing `openExternalNavigation` unchanged. Deliberately excludes opening hours, Jama'ah times, facilities, and reviews — data this app does not reliably have (see CLAUDE.md / [06-data-and-api-plan.md](./06-data-and-api-plan.md)).
- [x] `RecommendationHero`/`AlternatePlaceRow` gained an optional `onPress` (visual design unchanged) so tapping a place on Home also opens Details — consistent with Nearby's list/map behavior.
- [x] Tests: `fetch-nearby-session.test.ts`, `session-staleness.test.ts`, `find-candidate.test.ts` (pure logic), and `hooks/__tests__/nearby-places-session.test.tsx` — this project's first component-level test, proving no duplicate Places/Routes calls across simulated Home → Nearby → Place Details navigation, explicit-refresh behavior, and significant-movement refetch behavior, using `react-test-renderer` (already a transitive dependency — no new test library added).
- [x] Verified via a live dev-server smoke test that Home, `/nearby`, `/settings`, and `/place/[id]` all render their expected initial states without error. **Not done**: an actual on-device/simulator check of the Map view itself (no iOS simulator/device available in this environment) — flagged honestly rather than assumed working.

## Post-Phase-6 refinements (2026-08-22) — complete

Not a numbered phase — small, targeted Home-screen UX refinements requested after Phase 6 shipped, tracked separately since they don't add new architecture.

- [x] **Google Places discovery**: `rankPreference: 'DISTANCE'` and up to 20 candidates requested before local filtering (`lib/prayer-places/build-nearby-places-request.ts`), keeping the rest of the Places → Routes pipeline (local pre-filter to 3, Route Matrix cap) unchanged. Verified live — distance-ranked results visibly changed which mosques surfaced first.
- [x] **Location freshness**: refresh device location on app foreground-resume (`AppState` listener in `hooks/use-device-location.ts`), a manual "Refresh location" control on Home, and nearby-session refetch only on significant movement (>500m) — the existing shared-session/no-duplicate-call rule from Phase 6 is unchanged. Stale location surfaces via `lib/location-freshness.ts#isLocationStale` (5 min threshold) as a tappable notice, never a silent/automatic refetch.
- [x] **Home prayer card simplified**: shows only the selected prayer's countdown + key time (e.g. "27 min remaining" / "Ends 5:43 PM"); ETA/arrival info removed from the prayer card (still shown on the recommendation card). Sunrise added to the schedule area as a small, visually distinct note — **not** interleaved into the per-prayer schedule strip's row (`components/home/prayer-schedule-strip.tsx`), after doing exactly that first caused a real UI crash; the strip was reverted to its original, unmodified implementation and Sunrise is shown separately in `PrayerPanel`'s header row instead. Prayer-engine logic untouched throughout.
- [x] **NOW/NEXT default context refined**: defaults to NEXT/Dhuhr during the Sunrise-to-Dhuhr gap and NEXT/Fajr during Isha (both have no NOW-mode deadline to plan against); NOW otherwise. A manual toggle choice is never fought on subsequent per-second ticks — only reset once the prayer context genuinely changes. See `lib/prayer-times/default-planning-context.ts` / `hooks/use-planning-context.ts` and "NOW/NEXT default context" in [05-technical-architecture.md](./05-technical-architecture.md).
- [x] **Recommendation card two-action redesign**: primary **Navigate** (unchanged directions behavior) alongside secondary **Google Maps** (opens the place's own listing via `openPlaceInGoogleMaps`, reusing the existing Place ID — no extra Places API call). Card padding/gaps trimmed for compactness; recommendation logic itself untouched. See "Navigation" in [05-technical-architecture.md](./05-technical-architecture.md).
- [x] Verified via `tsc --noEmit`, `expo lint`, and the full Jest suite (173 tests) after each change; component-level render checks (via temporary `react-test-renderer` files, deleted after confirming) used to catch the Sunrise-strip crash and confirm the two-action card renders correctly. No real device/simulator available in this environment for visual confirmation.

## Phase 7 — Polish & reliability

- Caching layer for timetable and place data (reduce redundant API calls, support flaky connectivity) — notably, Places/Routes calls are currently uncached (a fresh call on every new session).
- Offline/degraded-network handling for timetable data.
- Real design pass on visual tokens (palette, type scale) per [04-design-system.md](./04-design-system.md), replacing the current placeholder template theme.
- Android map support (needs its own Google Maps SDK API key).

## Phase 8 — Route-aware travel (post-MVP)

- Origin → destination input.
- Corridor-based candidate discovery (places near the route, not just near a point).
- Detour-cost-aware ranking extending the same recommendation engine.
- Not designed in detail yet; MVP architecture should avoid decisions that would preclude this (e.g. keep ranking logic origin-agnostic where reasonable).

## Explicitly deferred / not scheduled

Everything listed as out-of-scope in [02-product-requirements.md](./02-product-requirements.md) (Quran, Hadith, Zakat, social features, reviews, generic Islamic content, full prayer tracking, complex auth, unnecessary AI features) has no phase assignment and requires a new product decision before it enters any roadmap phase.
