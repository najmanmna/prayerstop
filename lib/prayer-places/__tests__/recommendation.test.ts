// End-to-end "final recommendation logic" tests — starting from raw,
// Google-API-shaped input (as if just fetched from Places/Routes) and
// running the real pipeline (normalize → local pre-filter → apply travel
// times → build scenario), exactly as fetchNearbySession does. This
// is Phase 5's actual deliverable: build the recommendation using real data,
// so these tests exercise the full chain rather than any single unit.
import type { PlanningContext, PrayerWindow } from '@/types/home';

import { applyTravelTimes } from '../apply-travel-times';
import { buildPlaceScenario } from '../build-place-scenario';
import { normalizeNearbyPlacesResponse, type RawNearbyPlace } from '../normalize-nearby-places';
import { selectNearestCandidates } from '../select-candidates';
import { MAX_ROUTE_MATRIX_DESTINATIONS, type TravelTimeResult } from '../travel-time-repository';

const origin = { latitude: 6.9271, longitude: 79.8612 };
const NOW = new Date('2026-08-15T06:30:00.000Z'); // 12:00 Sri Lanka time

function rawPlace(id: string, offsetDegrees: number, businessStatus?: string): RawNearbyPlace {
  return {
    id,
    displayName: { text: `Place ${id}` },
    shortFormattedAddress: 'Colombo',
    location: { latitude: origin.latitude + offsetDegrees, longitude: origin.longitude + offsetDegrees },
    businessStatus,
  };
}

function okTravelTime(placeId: string, durationSeconds: number, distanceMeters: number): TravelTimeResult {
  return { placeId, outcome: { status: 'ok', durationSeconds, distanceMeters, condition: 'ROUTE_EXISTS' } };
}

function unreachable(placeId: string): TravelTimeResult {
  return { placeId, outcome: { status: 'unreachable', condition: 'ROUTE_NOT_FOUND' } };
}

/** Runs the real pipeline from raw Places-shaped input to the final PlaceScenario. */
function recommend(
  rawPlaces: RawNearbyPlace[],
  travelTimesById: Record<string, TravelTimeResult>,
  window: PrayerWindow,
  context: PlanningContext = 'now',
  countdownSeconds: number | null = null,
  now: Date = NOW
) {
  const normalized = normalizeNearbyPlacesResponse(rawPlaces);
  const nearest = selectNearestCandidates(normalized, origin, MAX_ROUTE_MATRIX_DESTINATIONS);
  const travelTimes = nearest.map((c) => travelTimesById[c.id]).filter(Boolean);
  const ranked = applyTravelTimes(nearest, travelTimes);
  return buildPlaceScenario(ranked, context, window, countdownSeconds, now);
}

describe('NOW: recommend a mosque realistically reachable before the current prayer deadline', () => {
  const window: PrayerWindow = { name: 'Dhuhr', startTime: '11:45', endTime: '12:30', hasStarted: true };

  it('recommends the mosque that arrives comfortably before the known deadline', () => {
    const scenario = recommend(
      [rawPlace('a', 0.01, 'OPERATIONAL')],
      { a: okTravelTime('a', 300, 2000) }, // 5 min -> arrives 12:05, 25 min left
      window
    );

    expect(scenario?.recommendation.id).toBe('a');
    expect(scenario?.recommendation.feasibility).toBe('comfortable');
  });

  it('never recommends a place with an honestly comfortable rating when it would actually arrive too late', () => {
    const scenario = recommend(
      [rawPlace('a', 0.01, 'OPERATIONAL')],
      { a: okTravelTime('a', 40 * 60, 20000) }, // 40 min -> arrives 12:40, past 12:30
      window
    );

    expect(scenario?.recommendation.feasibility).toBe('tooLate');
  });
});

describe('NEXT: leave-by is derived from the real traffic-aware ETA', () => {
  const nextWindow: PrayerWindow = { name: 'Asr', startTime: '15:45', endTime: '17:50', hasStarted: false };

  it('produces an etaMinutes that a caller can subtract from the next prayer start for an accurate leave-by time', () => {
    const scenario = recommend(
      [rawPlace('a', 0.01, 'OPERATIONAL')],
      { a: okTravelTime('a', 18 * 60, 6000) },
      nextWindow,
      'next',
      40 * 60 // 40 min until Asr starts
    );

    expect(scenario?.recommendation.etaMinutes).toBe(18);
    expect(scenario?.recommendation.feasibility).toBe('comfortable');
  });

  it('is too late to leave in time when real traffic ETA exceeds the time left before the next prayer starts', () => {
    const scenario = recommend(
      [rawPlace('a', 0.01, 'OPERATIONAL')],
      { a: okTravelTime('a', 20 * 60, 6000) }, // 20 min drive
      nextWindow,
      'next',
      10 * 60 // only 10 min until Asr starts
    );

    expect(scenario?.recommendation.feasibility).toBe('tooLate');
  });

  it('regression: a next prayer that is tomorrow morning is not misjudged as too late, end to end from raw Places/Routes data', () => {
    // Evaluated late at night; the next prayer is tomorrow's Fajr. The
    // window's own HH:MM strings ('04:46'..'06:04') must not be compared
    // against tonight's clock time directly — only the real, engine-computed
    // countdown (secondsUntilNextStart) should drive this.
    const tomorrowFajrWindow: PrayerWindow = { name: 'Fajr', startTime: '04:46', endTime: '06:04', hasStarted: false };
    const lateNight = new Date('2026-08-15T16:57:00.000Z'); // 22:27 Sri Lanka time
    const secondsUntilNextStart = 6 * 3600 + 19 * 60; // real ~6h19m away

    const scenario = recommend(
      [rawPlace('a', 0.01, 'OPERATIONAL')],
      { a: okTravelTime('a', 5 * 60, 2000) },
      tomorrowFajrWindow,
      'next',
      secondsUntilNextStart,
      lateNight
    );

    expect(scenario?.recommendation.feasibility).toBe('comfortable');
  });
});

describe('Fajr ends at ACJU Sunrise, never a fabricated later deadline', () => {
  const fajrWindow: PrayerWindow = { name: 'Fajr', startTime: '04:45', endTime: '06:02', hasStarted: true };
  // 2026-08-15T23:20:00Z == 2026-08-16 04:50 Sri Lanka time — 5 min after
  // Fajr starts, a realistic "NOW" for this scenario (unlike the file's
  // default noon NOW, used for every other describe block here).
  const FAJR_MORNING = new Date('2026-08-15T23:20:00.000Z');

  it('recommends a mosque reachable before Sunrise', () => {
    const scenario = recommend(
      [rawPlace('a', 0.01, 'OPERATIONAL')],
      { a: okTravelTime('a', 5 * 60, 2000) }, // 5 min -> arrives 04:55, well before 06:02
      fajrWindow,
      'now',
      null,
      FAJR_MORNING
    );

    expect(scenario?.recommendation.feasibility).toBe('comfortable');
  });

  it('classifies arrival past Sunrise as too late — using the real Sunrise time, not a fabricated later deadline', () => {
    const scenario = recommend(
      [rawPlace('a', 0.01, 'OPERATIONAL')],
      { a: okTravelTime('a', 90 * 60, 30000) }, // 90 min -> arrives 06:20, past Sunrise (06:02)
      fajrWindow,
      'now',
      null,
      FAJR_MORNING
    );

    expect(scenario?.recommendation.feasibility).toBe('tooLate');
  });
});

describe('Isha: no invented deadline, ever', () => {
  const ishaWindow: PrayerWindow = { name: 'Isha', startTime: '19:35', endTime: null, hasStarted: true };

  it('recommends the nearest/fastest candidate as comfortable without inventing a remaining-time claim', () => {
    const scenario = recommend(
      [rawPlace('a', 0.01, 'OPERATIONAL')],
      { a: okTravelTime('a', 3 * 60 * 60, 90000) }, // absurdly long — would overflow any invented deadline
      ishaWindow
    );

    expect(scenario?.recommendation.feasibility).toBe('comfortable');
  });
});

describe('between-prayers state stays accurate (e.g. Sunrise-to-Dhuhr gap)', () => {
  it('computes feasibility correctly for a window that has not started yet but has a real, known end', () => {
    const gapWindow: PrayerWindow = { name: 'Dhuhr', startTime: '12:00', endTime: '15:00', hasStarted: false };
    const scenario = recommend([rawPlace('a', 0.01, 'OPERATIONAL')], { a: okTravelTime('a', 300, 2000) }, gapWindow);

    expect(scenario?.recommendation.feasibility).toBe('comfortable');
  });
});

describe('unreachable places are never recommended', () => {
  const window: PrayerWindow = { name: 'Dhuhr', startTime: '11:45', endTime: '13:00', hasStarted: true };

  it('excludes a ROUTE_NOT_FOUND candidate from both the recommendation and the alternates', () => {
    const scenario = recommend(
      [rawPlace('unreachable', 0.001, 'OPERATIONAL'), rawPlace('reachable', 0.01, 'OPERATIONAL')],
      { unreachable: unreachable('unreachable'), reachable: okTravelTime('reachable', 300, 2000) },
      window
    );

    expect(scenario?.recommendation.id).toBe('reachable');
    expect(scenario?.alternates.find((p) => p.id === 'unreachable')).toBeUndefined();
  });

  it('surfaces no scenario at all when every nearby candidate is unreachable', () => {
    const scenario = recommend(
      [rawPlace('a', 0.01, 'OPERATIONAL')],
      { a: unreachable('a') },
      window
    );

    expect(scenario).toBeNull();
  });
});

describe('temporarily closed places are never recommended', () => {
  const window: PrayerWindow = { name: 'Dhuhr', startTime: '11:45', endTime: '13:00', hasStarted: true };

  it('excludes a CLOSED_TEMPORARILY place even when it is the nearest and fastest candidate', () => {
    const scenario = recommend(
      [
        rawPlace('closed-best', 0.001, 'CLOSED_TEMPORARILY'), // nearest, would be fastest
        rawPlace('open', 0.02, 'OPERATIONAL'),
      ],
      { 'closed-best': okTravelTime('closed-best', 60, 500), open: okTravelTime('open', 400, 3000) },
      window
    );

    expect(scenario?.recommendation.id).toBe('open');
  });
});

describe('multiple reachable candidates: practicality, not just distance', () => {
  const window: PrayerWindow = { name: 'Dhuhr', startTime: '11:00', endTime: '13:00', hasStarted: true };

  it('recommends the closer mosque when multiple candidates have similar real ETAs', () => {
    const scenario = recommend(
      [rawPlace('near', 0.005, 'OPERATIONAL'), rawPlace('far', 0.03, 'OPERATIONAL')],
      { near: okTravelTime('near', 10 * 60, 1000), far: okTravelTime('far', 12 * 60, 4000) },
      window
    );

    expect(scenario?.recommendation.id).toBe('near');
  });

  it('recommends the significantly faster mosque over a closer one that traffic has made materially slower', () => {
    const scenario = recommend(
      [rawPlace('near', 0.005, 'OPERATIONAL'), rawPlace('farButFaster', 0.04, 'OPERATIONAL')],
      { near: okTravelTime('near', 30 * 60, 1000), farButFaster: okTravelTime('farButFaster', 12 * 60, 5000) },
      window
    );

    expect(scenario?.recommendation.id).toBe('farButFaster');
  });
});
