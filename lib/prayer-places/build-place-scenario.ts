import { toSriLankaClockString } from '@/lib/prayer-times/sri-lanka-time';
import { getArrivalOutcome, offsetClock } from '@/lib/time';
import type { FeasibilityStatus, PlaceScenario, PlanningContext, PrayerPlace, PrayerWindow } from '@/types/home';

import type { RankedPrayerPlaceCandidate } from './types';

// A candidate is "tight" once arriving would leave this little of the
// window remaining (NOW) or this little lead time before the next prayer
// starts (NEXT). This is a local, pre-Routes heuristic (see docs/06).
const TIGHT_THRESHOLD_MINUTES = 10;

// Two candidates within this many minutes of each other are considered to
// have a "similar" ETA — in that case the closer one wins. Beyond this
// margin, traffic has made the closer option materially slower, so the
// faster candidate wins instead, even if farther away. A single, fixed
// threshold keeps the rule simple and deterministic, rather than a
// percentage-of-ETA or other data-dependent comparison.
const SIMILAR_ETA_THRESHOLD_MINUTES = 5;

/**
 * NOW's feasibility: if I leave right now, will I still be within the
 * active prayer's window? Compares an arrival time (computed from `now`)
 * against the window's own start/end — safe because `now` and the active
 * window's boundaries are always on the same effective calendar day (the
 * engine only ever surfaces an `active` window that `now` currently falls
 * within, or hasn't started yet later the same day).
 */
function classifyNowFeasibility(window: PrayerWindow, arrivalTime: string): FeasibilityStatus {
  const outcome = getArrivalOutcome(window, arrivalTime);
  if (outcome.status === 'unknown') {
    // No reliable deadline (Isha) — we have no evidence of a problem, so we
    // don't invent one. See the "known vs unknown" rule in CLAUDE.md.
    return 'comfortable';
  }
  if (outcome.overflow) return 'tooLate';
  if (outcome.remaining <= TIGHT_THRESHOLD_MINUTES) return 'tight';
  return 'comfortable';
}

/**
 * NEXT's feasibility is a different question from NOW's: not "will I still
 * be inside the window if I leave right now" (comparing against the
 * window's END — only meaningful for an already-active prayer), but "can I
 * still leave in time to arrive when the NEXT prayer STARTS."
 *
 * This deliberately does NOT compute an arrival time from `now` and compare
 * it against the next window's bare "HH:MM" start/end strings. When the
 * next prayer is tomorrow morning (e.g. planning for Fajr from late
 * tonight), that comparison silently conflates two different calendar
 * days — "23:50 tonight" is not later than "04:45 tomorrow" in real time,
 * but a same-day string comparison would say it is, producing a false
 * "too late" result. `secondsUntilNextStart` is already computed correctly
 * across midnight by the prayer engine (see prayer-engine.ts), so this
 * compares real travel time against that instead — no calendar-day
 * assumptions involved.
 */
function classifyNextFeasibility(etaMinutes: number, secondsUntilNextStart: number | null): FeasibilityStatus {
  if (secondsUntilNextStart === null) {
    // Not expected in practice (the engine documents this as always known
    // for `next`), but if it were ever unknown, don't invent a problem.
    return 'comfortable';
  }
  const leadTimeMinutes = secondsUntilNextStart / 60 - etaMinutes;
  if (leadTimeMinutes < 0) return 'tooLate';
  if (leadTimeMinutes <= TIGHT_THRESHOLD_MINUTES) return 'tight';
  return 'comfortable';
}

const FEASIBILITY_RANK: Record<FeasibilityStatus, number> = { comfortable: 0, tight: 1, tooLate: 2 };

/**
 * Orders two candidates within the same feasibility band by practicality,
 * not raw distance: prefer the closer mosque when their real ETAs are
 * similar, but prefer the significantly faster one when traffic makes the
 * closer option materially slower. See the "recommend the most reachable
 * option" rule in CLAUDE.md — this is that rule's tiebreak, made concrete.
 */
function comparePracticality(a: PrayerPlace, b: PrayerPlace): number {
  const etaDiff = a.etaMinutes - b.etaMinutes;
  if (Math.abs(etaDiff) <= SIMILAR_ETA_THRESHOLD_MINUTES) {
    return a.distanceKm - b.distanceKm;
  }
  return etaDiff;
}

/**
 * Builds the recommendation + alternates for a specific planning context
 * (NOW or NEXT), from a list of already distance/ETA-ranked candidates and
 * the real prayer timing to evaluate them against. Pure and framework-free —
 * the network fetch (expensive, context-independent) happens once in
 * `NearbyPlacesSessionProvider`; this recomputes cheaply whenever the user toggles
 * NOW/NEXT.
 *
 * `countdownSeconds` must be the same value the prayer engine computed for
 * this context (`secondsUntilActiveEnds` for NOW, `secondsUntilNextStart`
 * for NEXT — see `hooks/use-prayer-times.ts`) — it is NOT derived from
 * `window` here, specifically so NEXT's day-rollover-safe countdown is used
 * instead of a bare HH:MM comparison. Unused for NOW's classification
 * (which uses `window` directly), but the same parameter shape is kept for
 * both contexts for a single, symmetric call site (see `app/index.tsx`).
 *
 * Returns `null` when there are no candidates at all — callers should treat
 * that as the explicit "no nearby places found" empty state, not silently
 * show nothing (see docs/03-ux-and-user-flows.md).
 */
export function buildPlaceScenario(
  candidates: RankedPrayerPlaceCandidate[],
  context: PlanningContext,
  window: PrayerWindow,
  countdownSeconds: number | null,
  now: Date = new Date()
): PlaceScenario | null {
  if (candidates.length === 0) return null;

  const nowClock = toSriLankaClockString(now);
  const enriched: PrayerPlace[] = candidates.map((candidate) => {
    const arrivalTime = offsetClock(nowClock, candidate.etaMinutes);
    const feasibility =
      context === 'now'
        ? classifyNowFeasibility(window, arrivalTime)
        : classifyNextFeasibility(candidate.etaMinutes, countdownSeconds);
    return {
      id: candidate.id,
      name: candidate.name,
      area: candidate.area,
      coordinates: candidate.coordinates,
      distanceKm: candidate.distanceKm,
      etaMinutes: candidate.etaMinutes,
      arrivalTime,
      feasibility,
    };
  });

  // Recommend the most reachable option, not just the nearest one (a
  // non-negotiable product rule — see CLAUDE.md) — rank by feasibility
  // first, practicality (see comparePracticality) as the tiebreaker within
  // the same feasibility band.
  const sorted = [...enriched].sort((a, b) => {
    const feasibilityDiff = FEASIBILITY_RANK[a.feasibility] - FEASIBILITY_RANK[b.feasibility];
    return feasibilityDiff !== 0 ? feasibilityDiff : comparePracticality(a, b);
  });

  const [recommendation, ...rest] = sorted;
  return { recommendation, alternates: rest.slice(0, 2) };
}
