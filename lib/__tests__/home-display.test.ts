import { hasPrayerTimePassed, summarizeReachability, windowRemainingFraction } from '../home-display';
import type { PrayerPlace, PrayerWindow } from '@/types/home';

const DHUHR: PrayerWindow = { name: 'Dhuhr', startTime: '12:00', endTime: '15:20', hasStarted: true };
const ISHA: PrayerWindow = { name: 'Isha', startTime: '19:05', endTime: null, hasStarted: true };

function place(overrides: Partial<PrayerPlace> = {}): PrayerPlace {
  return {
    id: 'db:1',
    source: 'database',
    localRecordId: '1',
    googlePlaceId: null,
    name: 'Masjid',
    area: 'Colombo',
    coordinates: { latitude: 6.9, longitude: 79.8 },
    distanceKm: 0.8,
    etaMinutes: 4,
    arrivalTime: '15:10',
    feasibility: 'comfortable',
    ...overrides,
  };
}

describe('windowRemainingFraction', () => {
  it('is the share of the NOW window left', () => {
    expect(windowRemainingFraction('now', DHUHR, 100 * 60)).toBeCloseTo(0.5);
  });

  it('is null when it cannot be stated honestly', () => {
    expect(windowRemainingFraction('next', DHUHR, 600)).toBeNull();
    expect(windowRemainingFraction('now', ISHA, null)).toBeNull();
    expect(windowRemainingFraction('now', { ...DHUHR, hasStarted: false }, 600)).toBeNull();
  });

  it('clamps to 0–1', () => {
    expect(windowRemainingFraction('now', DHUHR, 999_999)).toBe(1);
    expect(windowRemainingFraction('now', DHUHR, -5)).toBe(0);
  });
});

describe('hasPrayerTimePassed', () => {
  it('compares against the local clock', () => {
    const now = new Date(2026, 10, 6, 13, 30);
    expect(hasPrayerTimePassed('04:40', now)).toBe(true);
    expect(hasPrayerTimePassed('13:30', now)).toBe(true);
    expect(hasPrayerTimePassed('15:17', now)).toBe(false);
  });

  it('marks nothing as passed just after midnight', () => {
    expect(hasPrayerTimePassed('04:40', new Date(2026, 10, 6, 0, 30))).toBe(false);
  });
});

describe('summarizeReachability', () => {
  it('NOW and reachable: says so, with the real countdown and ETA', () => {
    expect(summarizeReachability('now', DHUHR, 10 * 60, place())).toEqual({
      tone: 'comfortable',
      title: 'You can make it in time.',
      body: 'Dhuhr ends in 10 min · mosque 4 min away',
    });
  });

  it('NOW and tight', () => {
    expect(summarizeReachability('now', DHUHR, 6 * 60, place({ feasibility: 'tight' })).title).toBe(
      'It’s tight, but you can make it.'
    );
  });

  it('NOW and too late keeps the factual wording', () => {
    const summary = summarizeReachability('now', DHUHR, 2 * 60, place({ feasibility: 'tooLate' }));
    expect(summary.tone).toBe('tooLate');
    expect(summary.title).toBe('Too late to reach');
  });

  it('Isha makes no in-time or too-late claim', () => {
    const summary = summarizeReachability('now', ISHA, null, place());
    expect(summary).toEqual({ tone: 'neutral', title: 'Isha end time not listed', body: 'Recommended mosque is 4 min away' });
  });

  it('NOW before the window starts is neutral', () => {
    const summary = summarizeReachability('now', { ...DHUHR, hasStarted: false }, null, place());
    expect(summary.tone).toBe('neutral');
    expect(summary.title).toBe('Dhuhr hasn’t started yet');
  });

  it('NEXT gives a leave-by time', () => {
    const asr: PrayerWindow = { name: 'Asr', startTime: '15:20', endTime: null, hasStarted: false };
    expect(summarizeReachability('next', asr, 90 * 60, place({ etaMinutes: 12 }))).toEqual({
      tone: 'comfortable',
      title: 'Leave by 3:08 PM',
      body: 'Asr starts in 1h 30m · mosque 12 min away',
    });
  });

  it('NEXT too late', () => {
    const asr: PrayerWindow = { name: 'Asr', startTime: '15:20', endTime: null, hasStarted: false };
    expect(summarizeReachability('next', asr, 5 * 60, place({ etaMinutes: 12, feasibility: 'tooLate' })).title).toBe(
      'Can’t arrive before Asr starts'
    );
  });
});
