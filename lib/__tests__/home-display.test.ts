import { hasPrayerTimePassed, reachabilityDetail, summarizeReachability, windowRemainingFraction } from '../home-display';
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
  it('NOW and reachable', () => {
    expect(summarizeReachability('now', DHUHR, place())).toEqual({ tone: 'comfortable', title: 'You can make it in time' });
  });

  it('NOW and tight', () => {
    expect(summarizeReachability('now', DHUHR, place({ feasibility: 'tight' }))).toEqual({
      tone: 'tight',
      title: 'It’s tight, but you can make it',
    });
  });

  it('NOW and too late keeps the factual wording', () => {
    expect(summarizeReachability('now', DHUHR, place({ feasibility: 'tooLate' }))).toEqual({
      tone: 'tooLate',
      title: 'Too late to reach',
    });
  });

  it('Isha makes no in-time or too-late claim', () => {
    expect(summarizeReachability('now', ISHA, place())).toEqual({ tone: 'neutral', title: 'Isha end time not listed' });
  });

  it('NOW before the window starts is neutral', () => {
    expect(summarizeReachability('now', { ...DHUHR, hasStarted: false }, place())).toEqual({
      tone: 'neutral',
      title: 'Dhuhr hasn’t started yet',
    });
  });

  it('NEXT gives a leave-by time', () => {
    const asr: PrayerWindow = { name: 'Asr', startTime: '15:20', endTime: null, hasStarted: false };
    expect(summarizeReachability('next', asr, place({ etaMinutes: 12 }))).toEqual({ tone: 'comfortable', title: 'Leave by 3:08 PM' });
  });

  it('NEXT too late', () => {
    const asr: PrayerWindow = { name: 'Asr', startTime: '15:20', endTime: null, hasStarted: false };
    expect(summarizeReachability('next', asr, place({ etaMinutes: 12, feasibility: 'tooLate' }))).toEqual({
      tone: 'tooLate',
      title: 'Can’t arrive before Asr starts',
    });
  });
});

describe('reachabilityDetail', () => {
  it('NOW: how long the prayer has left and how far the mosque is', () => {
    expect(reachabilityDetail('now', DHUHR, 105 * 60, place({ etaMinutes: 3 }))).toBe('Dhuhr ends in 1h 45m · mosque 3 min away');
  });

  it('NEXT: time until it starts', () => {
    const asr: PrayerWindow = { name: 'Asr', startTime: '15:20', endTime: null, hasStarted: false };
    expect(reachabilityDetail('next', asr, 90 * 60, place({ etaMinutes: 12 }))).toBe('Asr starts in 1h 30m · mosque 12 min away');
  });

  it('Isha: never claims an end', () => {
    expect(reachabilityDetail('now', ISHA, null, place())).toBe('Mosque is 4 min away');
  });

  it('NOW before the window starts', () => {
    expect(reachabilityDetail('now', { ...DHUHR, hasStarted: false }, null, place())).toBe('Starts at 12:00 PM · mosque 4 min away');
  });
});
