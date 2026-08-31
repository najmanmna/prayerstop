import type { GeoCoordinates } from '@/lib/prayer-places/types';
import type { PrayerName } from '@/lib/prayer-times/types';

export type { PrayerName };

export type PlanningContext = 'now' | 'next';

export type FeasibilityStatus = 'comfortable' | 'tight' | 'tooLate';

export interface PrayerWindow {
  name: PrayerName;
  startTime: string;
  /** Null when the prayer's real deadline isn't reliably known (currently: Isha). Never derive this from the next prayer's start time. */
  endTime: string | null;
  /** False when this window is a "plan ahead for" target that hasn't actually begun yet (e.g. Dhuhr shown during the Sunrise-to-Dhuhr gap). Never show a "remaining" countdown when this is false. */
  hasStarted: boolean;
}

export interface PrayerPlace {
  id: string;
  name: string;
  area: string;
  /** Needed to open external navigation (see lib/prayer-places/navigation.ts) — not shown directly in the UI. */
  coordinates: GeoCoordinates;
  distanceKm: number;
  etaMinutes: number;
  arrivalTime: string;
  feasibility: FeasibilityStatus;
}

/**
 * A recommended place and up to two alternates (per the "one recommendation
 * + two alternates" product rule — see CLAUDE.md). Real place discovery
 * (Phase 3) can genuinely return fewer than three total results in a
 * sparser area, so `alternates` is 0–2 items, not a fixed tuple — the UI
 * renders however many exist. Prayer timing (window/countdown/schedule)
 * comes from the real ACJU-backed prayer engine instead (see
 * hooks/use-prayer-times.ts) and is intentionally not part of this type.
 */
export interface PlaceScenario {
  recommendation: PrayerPlace;
  alternates: PrayerPlace[];
}

export interface ScheduleEntry {
  name: PrayerName;
  time: string;
}
