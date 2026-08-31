# 01 — Project Overview

## What PrayerStop is

PrayerStop is a Sri Lankan Muslim mobile utility that answers one question:

> "I need to pray — where should I go, and can I realistically reach there in time?"

It is a **location + time utility**, not a devotional content app. It combines:

- ACJU (All Ceylon Jamiyyathul Ulama) prayer timetables
- the user's current location
- nearby prayer places (mosques / musallahs)
- traffic-aware travel ETA
- prayer-window timing
- recommendation logic

The output is a single practical recommendation: *go here, leave now, you'll make it* — rather than a plain list of nearby mosques sorted by distance.

## Core design philosophy

- **Recommend, don't just list.** The nearest mosque is not necessarily the right answer if it's unreachable before the prayer window closes, or if a slightly farther place is more certain to be reachable in traffic.
- **The app doesn't know if you've prayed.** It only knows the timetable and which prayer context the user has selected (current or upcoming). It must never assume personal prayer status.
- **Feel like a modern location utility**, closer to a maps/ETA app than a "generic Islamic app." Avoid stereotypical green/gold religious visual tropes (see [04-design-system.md](./04-design-system.md)).
- **Be cheap and fast.** Expensive traffic-aware routing calls are reserved for a short, pre-filtered candidate list — never run against every nearby place (see [05-technical-architecture.md](./05-technical-architecture.md)).

## The two primary intents (MVP)

1. **NOW** — the currently active prayer. The user wants somewhere to pray now and needs to know if they can reach a place before the prayer window ends.
2. **NEXT** — the upcoming prayer. The user may already have prayed the current prayer and wants to plan ahead for the one after it.

## Future scenario (post-MVP)

**Route-aware travel**: the user is travelling from A to B and wants the best prayer stop along the route, factoring in detour distance, traffic, and prayer timing. See [07-roadmap.md](./07-roadmap.md).

## Tech stack summary

| Layer | Choice |
|---|---|
| App framework | React Native + Expo (SDK 54) |
| Language | TypeScript |
| Navigation | Expo Router |
| Backend / persistence | Supabase (PostgreSQL) — used where persistence is actually needed |
| Place discovery | Google Places API |
| Traffic-aware routing | Google Routes API |
| Prayer times source | ACJU published timetables |

See [05-technical-architecture.md](./05-technical-architecture.md) and [06-data-and-api-plan.md](./06-data-and-api-plan.md) for detail and open verification items.

## Document map

| Doc | Purpose |
|---|---|
| [02-product-requirements.md](./02-product-requirements.md) | MVP scope, functional requirements, non-goals |
| [03-ux-and-user-flows.md](./03-ux-and-user-flows.md) | Screens, flows, edge cases |
| [04-design-system.md](./04-design-system.md) | Visual language, tokens, component inventory |
| [05-technical-architecture.md](./05-technical-architecture.md) | App architecture, recommendation pipeline |
| [06-data-and-api-plan.md](./06-data-and-api-plan.md) | Data model, external API integration plan |
| [07-roadmap.md](./07-roadmap.md) | Phased delivery plan |

## Current codebase state (as of this writing)

The repo is the **unmodified Expo Router default template** (`create-expo-app`, SDK 54, TypeScript, typed routes, React Compiler enabled). It has a two-tab layout (`Home`, `Explore`) with placeholder content and no location, backend, or API integration yet. No PrayerStop-specific application code has been written. This documentation set is the foundation that precedes that work.
