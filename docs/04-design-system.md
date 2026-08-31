# 04 — UI / Design System

## Design principles

- **Premium modern location utility, not a dashboard and not a religious app.** Think Apple Maps / Uber / Airbnb for clarity, hierarchy, and polish — not their branding, just the calm/spatial/effortless quality bar. Use the approved forest-green accent with neutral surfaces and route-oriented UI.
- **One hero, not a grid of cards.** The recommended place is the first and visual centerpiece of the screen; alternates are deliberately quieter (plain rows, not cards).
- **Spatial over textual.** The core calculation (arrival vs. prayer-window end) is shown as a visual relationship (a ring gauge / stat columns), not just lines of prose.
- **Status-driven color, not decorative color.** Color communicates feasibility state (comfortable / tight / too late), not brand flourish.
- **Depth via layering, not borders.** Prefer tonal surfaces and soft shadow to separate content; avoid heavy borders and dense dividers.

## Reference-driven redesign (2026-08-21)

A reference screenshot (a green-accented prayer-times app with a card-based layout) was adopted as the structural template for Home: compact planner/location header → prominent recommendation card (thumbnail + route stats + CTA) → combined supporting "prayer panel" (segmented NOW/NEXT control + live window countdown + circular remaining-time gauge + daily schedule strip) → a quiet list of alternates.

**Approved adaptation — adopted the reference's forest-green accent.** The green is constrained to selection, route, and call-to-action states, with neutral surfaces and no devotional ornamentation, so the screen remains a modern location utility.

**Dropped from the reference** (not fabricated/not in scope — see [02-product-requirements.md](./02-product-requirements.md) and [03-ux-and-user-flows.md](./03-ux-and-user-flows.md)):
- Amenity tags (Wudu/Parking/Women's area) — not part of our data model; inventing facility metadata for real, named mosques isn't something to fabricate.
- Favorite/heart icon, "View details," "View all" — imply screens/features that don't exist yet. Showing "View all" above exactly two alternates would also be misleading (there's nothing more to view).
- Search and notification icons — notifications are explicitly out of scope for Phase 1; search isn't a defined MVP feature.
- Personalized greeting with the user's name — no auth/user profile exists (out of scope). A generic greeting line is used instead.
- Bottom tab bar (Home/Map/Route/Settings) — reintroducing nav destinations we deliberately deferred when the Explore tab was removed (see [03-ux-and-user-flows.md](./03-ux-and-user-flows.md)). Still correct future IA, just not built yet.
- Real place photography — no Places imagery integration yet (Phase 2). An abstract gradient+icon tile stands in, so we're not presenting a stock photo as if it depicts a specific real building.

## Light mode only (for now)

**Decided (2026-08-21):** the app forces light mode regardless of the device's system appearance setting — consistent branding, and avoids a half-finished dark mode (the `dark` token values in `constants/theme.ts` were inherited proportionally from the light palette, not independently designed). Enforced centrally in `hooks/use-color-scheme.ts`/`.web.ts` (hardcoded to return `'light'`) plus `app.json`'s `userInterfaceStyle: "light"` and a fixed `StatusBar style="dark"` in `app/_layout.tsx` — not by touching every component. The `dark` palette values are kept in `theme.ts` for a possible future dark-mode pass; re-enabling it is a matter of restoring the real `useColorScheme` from `react-native` in those two hook files.

## Visual language

**Colors** (`constants/theme.ts`)
- Accent — a grounded forest green (`#126B46` light / `#6BC69A` dark), used for location, route, selection, and CTA states.
- Layered surfaces: `background` → `surface` → `surfaceElevated`, giving cards depth without visible borders. `accentSoft` is a pale green tint used for small badges/icon chips (e.g. the "Recommended" pill, the active-prayer icon badge).
- Text: `text` (primary), `textSecondary`, `textMuted` — three steps of hierarchy.
- Feasibility palette uses **forest / amber / rose** (`comfortable` `#126B46`, `tight` `#C2760A`, `tooLate` `#C93A32`). Conveyed mainly through colored numbers/text now, not standalone badge pills.
- `RouteGradient` — forest-green two-stop gradient used only for the abstract place-thumbnail tile (`PlaceThumbnail`); not a real map/photo.

**Time format** — 12-hour clock ("3:16 PM") at render time; underlying mock/timetable data stays 24-hour ("HH:MM"). See `lib/time.ts`.

## The core product moment — how it's visualized

1. **`RecommendationHero`** is shown first, so the best place and its route decision are visible without scrolling. Its elevated card combines an abstract place tile, a route-status pill, and the route decision.
2. **`RingGauge`** (SVG circular progress) surfaces the core planning value inside the dark-green supporting prayer panel. In NOW it shows minutes left after arrival; in NEXT it shows route duration while the live countdown runs to the calculated leave-by moment. The NEXT arrival target is the ACJU prayer start/Adhan time, never a mosque-specific Jama'ah time. Full rose ring + "Too late" label is reserved for an unreachable NOW result.
3. **Stat columns** in `RecommendationHero` (ETA/distance · Arrive by · You'll have) repeat the same numbers with full context, separated by hairline dividers rather than separate cards — the same value is shown twice (ring, then detail) at different scroll depths, intentionally, for glanceability.
4. The **"Too late to reach"** wording is preserved verbatim wherever a candidate is unreachable (hero note and alternate rows) — this is a recorded product decision, not just styling (see [03-ux-and-user-flows.md](./03-ux-and-user-flows.md)).

## Core component inventory (implemented)

| Component | Purpose |
|---|---|
| `PrayerPanel` | Dark-green supporting timing card: current-prayer label, inverted `NowNextToggle`, second-by-second countdown summary, `RingGauge`, `PrayerScheduleStrip` |
| `NowNextToggle` | Two-segment toggle (bold filled selected state, two-line labels) |
| `RingGauge` | SVG circular progress showing remaining-time-after-arrival at a glance |
| `PrayerScheduleStrip` | Day-at-a-glance row of all 5 prayers; the active one swaps its time-of-day icon for a location pin |
| `RecommendationHero` | Primary elevated card: recommendation label, `PlaceThumbnail` + name/area row, route-status pill, 3-column route stat row, single Navigate CTA |
| `PlaceThumbnail` | Abstract gradient+icon tile standing in for a real place photo |
| `AlternatePlaceRow` | Plain list row (not a card/chip) — thumbnail, name/area, colored ETA/remaining stats |

`MapPreview` (a real map) and `PermissionPrompt`/`EmptyState` remain future work — not needed until real location/Places data lands (Phase 2).

## Interaction guidelines

- Single primary action on screen: Navigate (still non-functional in Phase 1 — visual only).
- NOW/NEXT is a lightweight, instant toggle — no transition beyond re-rendering with the other mock scenario.
- Alternates are a plain vertical list with hairline dividers, visually quiet (no shadow, no card background) so they never compete with the hero recommendation.

## Explicit anti-patterns

- Avoid ornamental Islamic-pattern chrome. A small mosque silhouette is approved solely as a place-type marker in the abstract thumbnail tile.
- No dashboard-style grid of equally-weighted cards — one hero, de-emphasized alternates.
- No heavy borders for separation — use tonal surfaces (`surface`/`surfaceElevated`) and hairline dividers only where a reference explicitly calls for column separation (e.g. the stat row).
- No UI implying features that don't exist (view-all with nothing more to view, working search/notifications, nav destinations not yet built).
