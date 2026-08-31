import { useEffect, useState } from 'react';

import { computeDefaultPlanningContext, type ActivePrayerIdentity } from '@/lib/prayer-times/default-planning-context';
import type { PlanningContext } from '@/types/home';

/**
 * NOW/NEXT context for Home, defaulting sensibly based on the active prayer
 * (see computeDefaultPlanningContext) but never overriding a manual
 * selection except when the underlying prayer context itself *changes*.
 *
 * The effect's dependency array is exactly `[active?.name, active?.hasStarted]`
 * — both primitives — so it only re-fires on a genuine transition (e.g.
 * Maghrib → Isha, or the Sunrise-to-Dhuhr gap ending), never on every
 * per-second tick (`usePrayerTimes` rebuilds a new window object every
 * tick, but its `name`/`hasStarted` values don't change most of those
 * ticks) and never merely because the user tapped the toggle (`setContext`
 * below isn't part of this effect's dependencies).
 */
export function usePlanningContext(active: ActivePrayerIdentity | null) {
  const [context, setContext] = useState<PlanningContext>(() =>
    active ? computeDefaultPlanningContext(active) : 'now'
  );

  useEffect(() => {
    if (!active) return;
    setContext(computeDefaultPlanningContext(active));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.name, active?.hasStarted]);

  return [context, setContext] as const;
}
