import type { PrayerWindow } from '@/types/home';

import { buildPlaceScenario } from '../build-place-scenario';
import type { RankedPrayerPlaceCandidate } from '../types';

// 2026-08-15 06:30:00 UTC == 2026-08-15 12:00:00 in Sri Lanka (UTC+5:30).
const NOW = new Date('2026-08-15T06:30:00.000Z');

function candidate(overrides: Partial<RankedPrayerPlaceCandidate>): RankedPrayerPlaceCandidate {
  return {
    id: 'p',
    name: 'Place',
    area: 'Area',
    coordinates: { latitude: 6.9, longitude: 79.8 },
    distanceKm: 1,
    etaMinutes: 5,
    routeCondition: 'ROUTE_EXISTS',
    ...overrides,
  };
}

describe('buildPlaceScenario — NOW context', () => {
  it('returns null when there are no candidates', () => {
    const window: PrayerWindow = { name: 'Dhuhr', startTime: '12:00', endTime: '12:30', hasStarted: true };
    expect(buildPlaceScenario([], 'now', window, null, NOW)).toBeNull();
  });

  it('recommends the single candidate when only one exists', () => {
    const window: PrayerWindow = { name: 'Dhuhr', startTime: '12:00', endTime: '12:30', hasStarted: true };
    const only = candidate({ id: 'only', etaMinutes: 5 });
    const scenario = buildPlaceScenario([only], 'now', window, null, NOW);
    expect(scenario?.recommendation.id).toBe('only');
    expect(scenario?.alternates).toEqual([]);
  });

  it('ranks a comfortable arrival ahead of a tight or too-late one, even if farther away', () => {
    const window: PrayerWindow = { name: 'Dhuhr', startTime: '12:00', endTime: '12:30', hasStarted: true };
    // Arrives 12:05 — 25 min left, comfortable — but the farthest candidate.
    const comfortable = candidate({ id: 'comfortable', distanceKm: 5, etaMinutes: 5 });
    // Arrives 12:25 — 5 min left (<= 10 min threshold), tight.
    const tight = candidate({ id: 'tight', distanceKm: 2, etaMinutes: 25 });
    // Arrives 12:40 — past the 12:30 deadline, too late — but the nearest candidate.
    const tooLate = candidate({ id: 'tooLate', distanceKm: 0.5, etaMinutes: 40 });

    const scenario = buildPlaceScenario([tooLate, tight, comfortable], 'now', window, null, NOW);

    expect(scenario?.recommendation.id).toBe('comfortable');
    expect(scenario?.recommendation.feasibility).toBe('comfortable');
    expect(scenario?.alternates.map((place) => place.id)).toEqual(['tight', 'tooLate']);
    expect(scenario?.alternates[0].feasibility).toBe('tight');
    expect(scenario?.alternates[1].feasibility).toBe('tooLate');
  });

  it('breaks ties within the same feasibility band by distance when ETAs are equal', () => {
    const window: PrayerWindow = { name: 'Dhuhr', startTime: '12:00', endTime: '12:30', hasStarted: true };
    const near = candidate({ id: 'near', distanceKm: 1, etaMinutes: 5 });
    const far = candidate({ id: 'far', distanceKm: 3, etaMinutes: 5 });

    const scenario = buildPlaceScenario([far, near], 'now', window, null, NOW);

    expect(scenario?.recommendation.id).toBe('near');
    expect(scenario?.alternates[0].id).toBe('far');
  });

  describe('practicality tiebreak (multiple reachable candidates)', () => {
    // Generous window so every candidate below stays comfortably reachable —
    // these tests isolate the tiebreak rule, not feasibility banding.
    const window: PrayerWindow = { name: 'Dhuhr', startTime: '12:00', endTime: '13:00', hasStarted: true };

    it('prefers the closer mosque when real ETAs are only slightly different (within the similar-ETA threshold)', () => {
      const near = candidate({ id: 'near', distanceKm: 1, etaMinutes: 10 });
      const far = candidate({ id: 'far', distanceKm: 3, etaMinutes: 12 }); // 2 min slower — "similar"

      const scenario = buildPlaceScenario([far, near], 'now', window, null, NOW);

      expect(scenario?.recommendation.id).toBe('near');
    });

    it('prefers a significantly faster but farther mosque when traffic makes the closer one materially slower', () => {
      const near = candidate({ id: 'near', distanceKm: 1, etaMinutes: 30 }); // closer, but heavy traffic
      const farButFaster = candidate({ id: 'far-but-faster', distanceKm: 4, etaMinutes: 12 }); // 18 min faster

      const scenario = buildPlaceScenario([near, farButFaster], 'now', window, null, NOW);

      expect(scenario?.recommendation.id).toBe('far-but-faster');
    });
  });

  it('treats every candidate as comfortable when the window has no known deadline (e.g. Isha)', () => {
    const window: PrayerWindow = { name: 'Isha', startTime: '19:35', endTime: null, hasStarted: true };
    const near = candidate({ id: 'near', distanceKm: 1, etaMinutes: 60 });
    const far = candidate({ id: 'far', distanceKm: 5, etaMinutes: 120 });

    const scenario = buildPlaceScenario([far, near], 'now', window, null, NOW);

    expect(scenario?.recommendation.feasibility).toBe('comfortable');
    expect(scenario?.alternates[0].feasibility).toBe('comfortable');
    // No known deadline to rank by, so distance/ETA practicality decides order.
    expect(scenario?.recommendation.id).toBe('near');
  });

  it('caps alternates at two even with more candidates', () => {
    const window: PrayerWindow = { name: 'Dhuhr', startTime: '12:00', endTime: '12:30', hasStarted: true };
    const candidates = ['a', 'b', 'c', 'd'].map((id, index) =>
      candidate({ id, distanceKm: index + 1, etaMinutes: 5 })
    );

    const scenario = buildPlaceScenario(candidates, 'now', window, null, NOW);

    expect(scenario?.alternates).toHaveLength(2);
  });

  it('computes arrivalTime as now plus the candidate ETA, in Sri Lanka wall-clock time', () => {
    const window: PrayerWindow = { name: 'Dhuhr', startTime: '12:00', endTime: '12:30', hasStarted: true };
    const only = candidate({ id: 'only', etaMinutes: 12 });
    const scenario = buildPlaceScenario([only], 'now', window, null, NOW);
    expect(scenario?.recommendation.arrivalTime).toBe('12:12');
  });
});

describe('buildPlaceScenario — NEXT context (leave-by, via secondsUntilNextStart)', () => {
  // The NEXT window's own startTime/endTime are irrelevant to feasibility
  // here — only countdownSeconds (secondsUntilNextStart) drives it. Using a
  // deliberately nonsensical window below proves that.
  const window: PrayerWindow = { name: 'Asr', startTime: '15:45', endTime: '17:50', hasStarted: false };

  it('is comfortable when there is plenty of lead time before the next prayer starts', () => {
    const only = candidate({ id: 'only', etaMinutes: 10 });
    // 40 min until start, 10 min drive -> 30 min lead time, comfortable.
    const scenario = buildPlaceScenario([only], 'next', window, 40 * 60, NOW);
    expect(scenario?.recommendation.feasibility).toBe('comfortable');
  });

  it('is tight when lead time before the next prayer starts is small', () => {
    const only = candidate({ id: 'only', etaMinutes: 10 });
    // 15 min until start, 10 min drive -> 5 min lead time (<= 10), tight.
    const scenario = buildPlaceScenario([only], 'next', window, 15 * 60, NOW);
    expect(scenario?.recommendation.feasibility).toBe('tight');
  });

  it('is too late when travel time exceeds the time remaining before the next prayer starts', () => {
    const only = candidate({ id: 'only', etaMinutes: 20 });
    // Only 10 min until start, but a 20 min drive -> can't leave in time.
    const scenario = buildPlaceScenario([only], 'next', window, 10 * 60, NOW);
    expect(scenario?.recommendation.feasibility).toBe('tooLate');
  });

  it('never invents a problem when countdownSeconds is unexpectedly unknown', () => {
    const only = candidate({ id: 'only', etaMinutes: 999 });
    const scenario = buildPlaceScenario([only], 'next', window, null, NOW);
    expect(scenario?.recommendation.feasibility).toBe('comfortable');
  });

  it('regression: does not misclassify as too-late using bare HH:MM window comparison when the next prayer is tomorrow', () => {
    // This exact shape (evaluating late at night, next = tomorrow's Fajr,
    // an early-morning window) previously produced a false "too late"
    // because arrival time (computed from "now") was compared directly
    // against the window's HH:MM strings, silently treating "tonight" and
    // "tomorrow morning" as the same calendar day. Real countdownSeconds
    // must be used instead, sidestepping the bug entirely.
    const tomorrowFajrWindow: PrayerWindow = { name: 'Fajr', startTime: '04:46', endTime: '06:04', hasStarted: false };
    const only = candidate({ id: 'only', etaMinutes: 5 });
    // Evaluated at 22:27 tonight; real seconds until tomorrow's Fajr.
    const lateNight = new Date('2026-08-15T16:57:00.000Z'); // 22:27 Sri Lanka time
    const secondsUntilNextStart = 6 * 3600 + 19 * 60; // a real ~6h19m away, as the engine would compute

    const scenario = buildPlaceScenario([only], 'next', tomorrowFajrWindow, secondsUntilNextStart, lateNight);

    expect(scenario?.recommendation.feasibility).toBe('comfortable');
  });
});
