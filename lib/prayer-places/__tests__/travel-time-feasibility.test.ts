// Integration-style tests: real Route Matrix output → applyTravelTimes →
// buildPlaceScenario / getArrivalOutcome / offsetClock — the exact same
// functions the Home UI consumes (see components/home/*). This confirms
// Phase 4's real traffic-aware duration flows correctly into the NOW
// arrival/feasibility check, the NEXT leave-by calculation, and that Isha's
// unknown deadline is still never fabricated once the ETA source changes
// from a straight-line estimate to a real Google Routes duration.
import { getArrivalOutcome, offsetClock } from '@/lib/time';
import type { PrayerWindow } from '@/types/home';

import { applyTravelTimes } from '../apply-travel-times';
import { buildPlaceScenario } from '../build-place-scenario';
import type { DistanceRankedCandidate } from '../select-candidates';
import type { TravelTimeResult } from '../travel-time-repository';

const NOW = new Date('2026-08-15T06:30:00.000Z'); // 12:00 Sri Lanka time

function candidate(id: string): DistanceRankedCandidate {
  return { id, name: `Place ${id}`, area: 'Colombo', coordinates: { latitude: 6.9, longitude: 79.8 }, distanceKm: 1 };
}

function okTravelTime(placeId: string, durationSeconds: number, distanceMeters: number): TravelTimeResult {
  return { placeId, outcome: { status: 'ok', durationSeconds, distanceMeters, condition: 'ROUTE_EXISTS' } };
}

describe('NOW: real-duration arrival vs. a known prayer deadline', () => {
  const window: PrayerWindow = { name: 'Dhuhr', startTime: '12:00', endTime: '12:30', hasStarted: true };

  it('classifies comfortable when the real travel duration leaves ample time', () => {
    // 5 min real drive time -> arrives 12:05, 25 min left in the window.
    const ranked = applyTravelTimes([candidate('a')], [okTravelTime('a', 300, 2000)]);
    const scenario = buildPlaceScenario(ranked, 'now', window, null, NOW);

    expect(scenario?.recommendation.feasibility).toBe('comfortable');
    const outcome = getArrivalOutcome(window, scenario!.recommendation.arrivalTime);
    expect(outcome).toEqual({ status: 'known', remaining: 25, overflow: false, arrivalFraction: expect.any(Number) });
  });

  it('classifies too late when the real travel duration puts arrival past the known deadline', () => {
    // 40 min real drive time -> arrives 12:40, past the 12:30 deadline.
    const ranked = applyTravelTimes([candidate('a')], [okTravelTime('a', 2400, 20000)]);
    const scenario = buildPlaceScenario(ranked, 'now', window, null, NOW);

    expect(scenario?.recommendation.feasibility).toBe('tooLate');
    const outcome = getArrivalOutcome(window, scenario!.recommendation.arrivalTime);
    expect(outcome.status).toBe('known');
    if (outcome.status !== 'known') return;
    expect(outcome.overflow).toBe(true);
  });
});

describe('NEXT: leave-by = prayer start - real travel duration', () => {
  it('computes the correct leave-by clock time from a real Route Matrix duration', () => {
    // 18 min real drive time to a place, next prayer (Asr) starts at 15:45.
    const ranked = applyTravelTimes([candidate('a')], [okTravelTime('a', 18 * 60, 6000)]);
    expect(ranked[0].etaMinutes).toBe(18);

    const nextWindow: PrayerWindow = { name: 'Asr', startTime: '15:45', endTime: '17:50', hasStarted: false };
    const leaveByTime = offsetClock(nextWindow.startTime, -ranked[0].etaMinutes);

    expect(leaveByTime).toBe('15:27');
  });

  it('rounds the real duration to whole minutes before computing leave-by', () => {
    // 17 min 40s real drive time rounds to 18 minutes.
    const ranked = applyTravelTimes([candidate('a')], [okTravelTime('a', 17 * 60 + 40, 6000)]);
    expect(ranked[0].etaMinutes).toBe(18);
  });
});

describe('Isha: no known deadline, even with a real travel duration', () => {
  const ishaWindow: PrayerWindow = { name: 'Isha', startTime: '19:35', endTime: null, hasStarted: true };

  it('never fabricates a deadline or "too late" claim for Isha, regardless of real ETA', () => {
    // A very long real drive time — if a deadline were fabricated, this
    // would surely overflow it. It must not, because there is no deadline.
    const ranked = applyTravelTimes([candidate('a')], [okTravelTime('a', 3 * 60 * 60, 90000)]);
    const scenario = buildPlaceScenario(ranked, 'now', ishaWindow, null, NOW);

    expect(scenario?.recommendation.feasibility).toBe('comfortable');
    const outcome = getArrivalOutcome(ishaWindow, scenario!.recommendation.arrivalTime);
    expect(outcome).toEqual({ status: 'unknown' });
  });
});
