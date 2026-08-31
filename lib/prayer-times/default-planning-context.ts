import type { PrayerName } from './types';
import type { PlanningContext } from '@/types/home';

export interface ActivePrayerIdentity {
  name: PrayerName;
  hasStarted: boolean;
}

/**
 * The sensible default NOW/NEXT context for a given active prayer window —
 * a starting point, not a hard rule; the user can freely override it (see
 * hooks/use-planning-context.ts for how the override is preserved rather
 * than repeatedly reset). Pure and framework-free; does not touch or
 * duplicate any prayer-engine logic (lib/prayer-times/prayer-engine.ts) —
 * it only interprets the `active` identity the engine already produces.
 *
 * - **Isha**: NOW has no known deadline (ACJU gives no cutoff — see the
 *   non-negotiable rule in CLAUDE.md). NEXT/Fajr gives the user something
 *   actionable (a real leave-by time) instead of a dead-end "no fixed
 *   deadline" NOW view.
 * - **The Sunrise-to-Dhuhr gap** (Dhuhr surfaced as the upcoming target but
 *   `hasStarted: false` — see prayer-engine.ts): no prayer window is
 *   actually open yet, so NEXT/Dhuhr (a real, known start time) is the
 *   meaningful view, not a NOW window that hasn't begun.
 * - **Everything else**: NOW, the ordinary "what's happening right now" default.
 */
export function computeDefaultPlanningContext(active: ActivePrayerIdentity): PlanningContext {
  if (active.name === 'Isha') return 'next';
  if (active.name === 'Dhuhr' && !active.hasStarted) return 'next';
  return 'now';
}
