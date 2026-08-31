import { parseClock } from '@/lib/time';

import type { PrayerTimeRepository } from './prayer-time-repository';
import { addDaysToIsoDate, toSriLankaClock } from './sri-lanka-time';
import type { DailyPrayerTimes, PrayerName } from './types';

function toSeconds(hhmm: string): number {
  return parseClock(hhmm) * 60;
}

/**
 * A prayer's window as understood by this engine. `endTime` is only ever a
 * real, known ACJU-derived boundary:
 *   - Fajr → Sunrise (ACJU publishes Sunrise explicitly; this is Fajr's
 *     real, known deadline, not a guess).
 *   - Dhuhr → Asr, Asr → Maghrib, Maghrib → Isha (the next same-day
 *     prayer's start).
 *   - Isha → `null`. The next day's Fajr is a *different prayer's start
 *     time*, not a stated Isha deadline — we have no reliable data on
 *     Isha's actual cutoff, mosque closing time, or Jama'ah time. Treating
 *     "Fajr starts" as "Isha ends" was a real bug; do not reintroduce it
 *     (see the engine tests for regression coverage).
 *
 * `hasStarted` is false when this window is being surfaced as a *target to
 * plan for* before it has actually begun (Dhuhr during the Sunrise-to-Dhuhr
 * gap — see below) — never claim a "remaining" countdown for a window that
 * hasn't started.
 */
export interface PrayerEngineWindow {
  name: PrayerName;
  startTime: string; // HH:MM, Sri Lanka local time
  endTime: string | null; // HH:MM, or null when no reliable deadline is known (Isha)
  hasStarted: boolean;
}

export interface PrayerEngineState {
  zoneId: string;
  evaluatedAt: Date;
  today: DailyPrayerTimes;
  /** The prayer relevant to "what should I do right now" — see `hasStarted` above for the Sunrise-gap case. */
  active: PrayerEngineWindow;
  /** The prayer to plan ahead for. */
  next: PrayerEngineWindow;
  /** Seconds from `evaluatedAt` until `next.startTime` — always known, since every prayer's start time is real ACJU data. Safe for "leave by" / "starts in" claims regardless of whether `active` has a known deadline. */
  secondsUntilNextStart: number;
  /** Seconds from `evaluatedAt` until `active` ends — null when `active.endTime` is null (Isha) or `active.hasStarted` is false (the Sunrise-to-Dhuhr gap). Never backfilled from `secondsUntilNextStart`. */
  secondsUntilActiveEnds: number | null;
}

export type PrayerEngineResult =
  | { status: 'ok'; state: PrayerEngineState }
  | { status: 'unavailable'; reason: string };

function ok(state: PrayerEngineState): PrayerEngineResult {
  return { status: 'ok', state };
}

function unavailable(reason: string): PrayerEngineResult {
  return { status: 'unavailable', reason };
}

/**
 * Determines the active/next prayer and the timing known about each, for a
 * given instant. Knows nothing about how or where prayer time data is
 * stored — only the `PrayerTimeRepository` interface and plain HH:MM
 * strings. Never fabricates a deadline it doesn't actually have.
 */
export function getPrayerEngineState(
  repository: PrayerTimeRepository,
  zoneId: string,
  now: Date
): PrayerEngineResult {
  const { isoDate: todayIso, secondsSinceMidnight: nowSeconds } = toSriLankaClock(now);
  const today = repository.getDailyTimes(zoneId, todayIso);
  if (!today) {
    return unavailable(`No prayer times for zone ${zoneId} on ${todayIso}.`);
  }

  const fajrSeconds = toSeconds(today.fajr);
  const sunriseSeconds = toSeconds(today.sunrise);
  const dhuhrSeconds = toSeconds(today.dhuhr);
  const asrSeconds = toSeconds(today.asr);
  const maghribSeconds = toSeconds(today.maghrib);
  const ishaSeconds = toSeconds(today.isha);

  // Before today's Fajr: still within (yesterday's) Isha — deadline unknown.
  if (nowSeconds < fajrSeconds) {
    const yesterdayIso = addDaysToIsoDate(todayIso, -1);
    const yesterday = repository.getDailyTimes(zoneId, yesterdayIso);
    // Falls back to today's Isha time if yesterday isn't in the dataset
    // (only possible at the very start of the dataset's coverage) — Isha
    // shifts by roughly a minute a day, so this is a close approximation of
    // when it started, not a guess pulled from nowhere. Its *end* is not
    // approximated at all — it's simply unknown.
    const priorIshaTime = yesterday ? yesterday.isha : today.isha;
    return ok({
      zoneId,
      evaluatedAt: now,
      today,
      active: { name: 'Isha', startTime: priorIshaTime, endTime: null, hasStarted: true },
      next: { name: 'Fajr', startTime: today.fajr, endTime: today.sunrise, hasStarted: false },
      secondsUntilNextStart: fajrSeconds - nowSeconds,
      secondsUntilActiveEnds: null,
    });
  }

  // Fajr's own window: real and known — it ends at Sunrise.
  if (nowSeconds < sunriseSeconds) {
    return ok({
      zoneId,
      evaluatedAt: now,
      today,
      active: { name: 'Fajr', startTime: today.fajr, endTime: today.sunrise, hasStarted: true },
      next: { name: 'Dhuhr', startTime: today.dhuhr, endTime: today.asr, hasStarted: false },
      secondsUntilNextStart: dhuhrSeconds - nowSeconds,
      secondsUntilActiveEnds: sunriseSeconds - nowSeconds,
    });
  }

  // Sunrise has passed but Dhuhr hasn't started — no prayer window is
  // actually open. Dhuhr is surfaced as the thing to plan for (matching
  // "the next prayer"), but explicitly not-yet-started: its own window is
  // real/known once it begins, so we still describe it, we just never claim
  // a "remaining" countdown for something that hasn't started.
  if (nowSeconds < dhuhrSeconds) {
    const pendingDhuhr: PrayerEngineWindow = {
      name: 'Dhuhr',
      startTime: today.dhuhr,
      endTime: today.asr,
      hasStarted: false,
    };
    return ok({
      zoneId,
      evaluatedAt: now,
      today,
      active: pendingDhuhr,
      next: pendingDhuhr,
      secondsUntilNextStart: dhuhrSeconds - nowSeconds,
      secondsUntilActiveEnds: null,
    });
  }

  // Dhuhr, Asr, and Maghrib each have a real, known end — the next prayer's start.
  const sameDayWindows: { name: PrayerName; startTime: string; start: number; end: number; endTime: string }[] = [
    { name: 'Dhuhr', startTime: today.dhuhr, start: dhuhrSeconds, end: asrSeconds, endTime: today.asr },
    { name: 'Asr', startTime: today.asr, start: asrSeconds, end: maghribSeconds, endTime: today.maghrib },
    { name: 'Maghrib', startTime: today.maghrib, start: maghribSeconds, end: ishaSeconds, endTime: today.isha },
  ];
  for (let i = 0; i < sameDayWindows.length; i++) {
    const current = sameDayWindows[i];
    if (nowSeconds >= current.start && nowSeconds < current.end) {
      const upcoming = sameDayWindows[i + 1]; // undefined when current is Maghrib (next is Isha)
      const next: PrayerEngineWindow = upcoming
        ? { name: upcoming.name, startTime: upcoming.startTime, endTime: upcoming.endTime, hasStarted: false }
        : { name: 'Isha', startTime: today.isha, endTime: null, hasStarted: false };
      return ok({
        zoneId,
        evaluatedAt: now,
        today,
        active: { name: current.name, startTime: current.startTime, endTime: current.endTime, hasStarted: true },
        next,
        secondsUntilNextStart: current.end - nowSeconds,
        secondsUntilActiveEnds: current.end - nowSeconds,
      });
    }
  }

  // At or after today's Isha: deadline unknown. `next` is tomorrow's Fajr —
  // its *start* (and its own end, tomorrow's Sunrise) is real, known data;
  // that is not the same thing as claiming it's when tonight's Isha ends.
  const tomorrowIso = addDaysToIsoDate(todayIso, 1);
  const tomorrow = repository.getDailyTimes(zoneId, tomorrowIso);
  if (!tomorrow) {
    return unavailable(`No prayer times for zone ${zoneId} on ${tomorrowIso} (needed for tomorrow's Fajr start time).`);
  }
  const secondsUntilMidnight = 24 * 3600 - nowSeconds;
  const tomorrowFajrSeconds = toSeconds(tomorrow.fajr);
  return ok({
    zoneId,
    evaluatedAt: now,
    today,
    active: { name: 'Isha', startTime: today.isha, endTime: null, hasStarted: true },
    next: { name: 'Fajr', startTime: tomorrow.fajr, endTime: tomorrow.sunrise, hasStarted: false },
    secondsUntilNextStart: secondsUntilMidnight + tomorrowFajrSeconds,
    secondsUntilActiveEnds: null,
  });
}
