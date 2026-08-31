# 03 — UX & Key User Flows

## Screen inventory (as of Phase 6)

The MVP started as close to a single-screen app; Phase 6 expanded it into a small, still-deliberately-narrow app:

- **Home** (tab) — NOW/NEXT context, one recommendation + two alternates, navigate action. Visual design unchanged from the MVP — Phase 6 only added tap-to-open-Details on the recommendation/alternates.
- **Nearby** (tab) — a dedicated browse view of the *same* nearby-places session Home uses (never a separate fetch): a flat list of every fetched candidate, plus a Map toggle (iOS only — see [05-technical-architecture.md](./05-technical-architecture.md)). Always shows the "now" view; it does not have Home's NOW/NEXT toggle.
- **Settings** (tab) — intentionally minimal: app version only. No accounts, no preferences yet.
- **Place Details** — a stack screen (pushed from Home or Nearby, not a tab), showing name, address, distance, current travel ETA, feasibility/arrival info, and the Navigate action for one specific place, read from the same shared session by place ID.
- **Permission / onboarding states** — lightweight, not separate flows: location permission prompt, location-denied fallback.

**Decided (2026-08-21, superseding the earlier single-screen decision):** the tab bar now holds **Home, Nearby, Settings**. **Route/Travel and Saved are still reserved, not built** — Route-aware travel remains a distinct future phase (see "Future flow" below); Saved has no design yet. Place Details is deliberately a stack screen, not a tab — it's a detail view of something already visible on Home/Nearby, not a fourth top-level destination.

## Primary flow — cold open

1. App opens → request location permission if not already granted.
2. Once location is available, compute today's ACJU timetable → determine currently active prayer and next prayer.
3. Home renders with the **NOW/NEXT selector** defaulting to whichever context actually makes sense for the current prayer state (**updated 2026-08-22** — see "Flow — switching NOW ↔ NEXT" below): **NOW** for a prayer that's genuinely in progress, but **NEXT** during the Sunrise-to-Dhuhr gap (defaults to Dhuhr) and during Isha (defaults to Fajr, since Isha has no known deadline to plan against).
4. For the selected context (NOW or NEXT), the app:
   - Fetches nearby candidate places (Google Places).
   - Locally ranks candidates by straight-line distance + feasibility against the remaining prayer window.
   - Sends only the top few candidates to Google Routes for traffic-aware ETA.
   - Selects and displays the single best recommendation, plus **exactly two** alternates (decided — full discovery/browsing is deferred to a later phase).
5. The recommendation card offers two actions side by side (**updated 2026-08-22**): primary **Navigate** (turn-by-turn directions open in Google Maps, destination pre-filled) and secondary **Google Maps** (opens the place's own Google Maps listing, using the same Place ID already fetched — no extra API call).

## Flow — switching NOW ↔ NEXT

- Switching context re-runs the ranking against the relevant target — NOW uses the current prayer's end time, while NEXT uses the next prayer's ACJU start/Adhan time. NEXT surfaces a leave-by time calculated from ETA and an arrival-by time equal to that start time; it does not use mosque-specific Jama'ah times.
- No confirmation step needed; this is a lightweight toggle, not a navigation.
- **Default context is smart, not always NOW (updated 2026-08-22)**: the toggle still defaults to NOW whenever a prayer is genuinely in progress, but defaults to **NEXT** during the two situations where planning ahead is the only thing that makes sense — the Sunrise-to-Dhuhr gap (no window is open yet; defaults to Dhuhr) and Isha (no known deadline exists to plan a NOW arrival against; defaults to Fajr). See `lib/prayer-times/default-planning-context.ts`.
- **Manual selection is respected until the prayer context itself changes.** If the user manually switches the toggle, that choice is not fought or reverted on the next per-second tick — it only resets to the fresh default once the active/next prayer genuinely transitions (e.g. Isha ends and Fajr begins, or Dhuhr's window actually opens). See `hooks/use-planning-context.ts`.

## Flow — Nearby and Place Details (Phase 6)

- Opening **Nearby** or tapping into **Place Details** never triggers a new Google Places or Routes request — both read the one nearby-places session Home already established (see "Shared nearby-places session" in [05-technical-architecture.md](./05-technical-architecture.md)). If the user opens Nearby before Home has ever fetched anything (e.g. it's the very first screen they land on), the same loading/permission states Home shows apply there too.
- **Refresh is user-driven, not automatic.** The session is reused while it's still fresh; a small "may be a little out of date" note appears once it's old enough to be worth refreshing (currently 10 minutes), and Nearby has an explicit **Refresh** action. The app does not poll or refresh in the background.
- Tapping a place (Home's recommendation/alternates, or a Nearby list row) opens **Place Details** for that place. On the **Map** view specifically, tapping a marker first *selects* it (shown in a summary card), and a second tap opens Details — this mirrors how map apps generally work and gives a lighter-weight way to compare candidates on the map before committing to Details.
- Place Details shows only what's already fetched and already verified reliable: name, address, distance, current travel ETA, feasibility/arrival info. **It does not show opening hours, Jama'ah times, facilities, or reviews** — this data either isn't available or isn't reliable for the "can I actually pray here" question (see the standing data-limitation rule in CLAUDE.md / [06-data-and-api-plan.md](./06-data-and-api-plan.md)); showing it would imply a certainty the app doesn't have.

## Edge cases & fallback states

| Case | Expected behavior |
|---|---|
| Location permission denied | Show a clear inline state explaining location is required, with a re-prompt/settings-deeplink action. No silent failure. |
| No reachable candidate before window closes (NOW) | **Decided:** use factual, non-judgmental language — e.g. "Too late to reach", paired with the estimated arrival time vs. the prayer end time (numbers, not tone, carry the message). Never phrase this as a religious judgment (no "you will miss your prayer" framing) — the app reports arithmetic, not spiritual consequence. |
| No nearby places found | Show an explicit empty state; do not silently show nothing. |
| Prayer window ending very soon (NOW) | Consider a heightened-urgency treatment (e.g. visually distinct countdown) — *decision needed on exact threshold and treatment.* |
| Timetable unavailable (offline / fetch failure) | Must degrade gracefully — exact offline strategy depends on how timetables are sourced/cached (see [06-data-and-api-plan.md](./06-data-and-api-plan.md)); flagged as open. |
| Mid-transition between prayers (e.g. exactly at prayer start) | Timetable logic must have unambiguous boundary rules for "active" vs "next" — implementation detail for [05-technical-architecture.md](./05-technical-architecture.md). |
| Place Details opened for an id no longer in the current session (e.g. app cold-started with a stale deep link before any session exists) | Show an explicit "this place is no longer available" state directing the user back to Nearby to refresh — never a blank screen or a crash. |
| Map view requested on a platform without a working map (Android, web) | Don't show a broken/non-functional map toggle — Nearby simply doesn't offer the Map option there yet; List remains fully functional everywhere. |

## Explicit non-assumption rule

The UI must never imply the app knows whether the user has personally prayed. Copy such as "Time to pray Dhuhr" is fine; copy implying tracking ("You haven't prayed Dhuhr yet") is not, since the app has no such knowledge. This constrains microcopy across all states.

## Future flow (post-MVP) — Route-aware travel

The user provides an origin and destination (a road trip / commute). The app should surface the best prayer stop along the route, factoring in detour cost, traffic, and timing — an extension of the same recommendation engine but with a route corridor instead of a point origin. Not designed in detail yet; noted so MVP architecture doesn't foreclose it (see [07-roadmap.md](./07-roadmap.md)).

## Decisions recorded (2026-08-21)

1. Default cold-open context is **NOW** for an in-progress prayer (**refined 2026-08-22** — see item 6 below for the two exceptions).
2. Generic Expo tab bar removed; only **Home** is implemented for MVP. Future nav (not built yet): Map, Route, Saved, Settings.
3. Unreachable-in-time state uses factual language ("Too late to reach" + arrival-vs-window-end times), never religious framing.
4. Home shows **one recommendation + two alternates**, not open-ended browsing.
5. **(2026-08-22, Phase 6)** Tab bar expanded to **Home, Nearby, Settings**; Place Details added as a stack screen. Nearby/Details never trigger their own Places/Routes requests — they read the one shared session Home establishes. Map view is iOS-only for now (no Android Google Maps API key configured yet). Refresh is explicit/movement/staleness-driven only, never a background poll.
6. **(2026-08-22)** NOW/NEXT default context is now prayer-state-aware: NEXT/Dhuhr during the Sunrise-to-Dhuhr gap, NEXT/Fajr during Isha, NOW otherwise — and a manual toggle choice persists until the prayer context genuinely changes, never fought on the next tick. The recommendation card gained a second action: primary **Navigate** (directions) alongside secondary **Google Maps** (view the place's listing), both from the existing Place ID.

## Still open

- Urgency threshold/treatment as a prayer window nears its end (e.g. a visually distinct countdown state) — not yet decided, revisit once real timetable data and timing edge cases are in front of us.
