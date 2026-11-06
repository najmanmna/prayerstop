import { hasPrayerTimePassed, planFigures, summarizeReachability, windowRemainingFraction } from '../home-display';
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

describe('planFigures', () => {
  it('NOW in time: drive, arrival, time before the end', () => {
    expect(planFigures('now', DHUHR, place({ etaMinutes: 4, arrivalTime: '15:10' }))).toEqual([
      { value: '4 min', label: 'drive' },
      { value: '3:10 PM', label: 'arrive' },
      { value: '10 min', label: 'before it ends' },
    ]);
  });

  it('NOW too late: how long after the end', () => {
    expect(planFigures('now', DHUHR, place({ arrivalTime: '15:35', feasibility: 'tooLate' }))[2]).toEqual({
      value: '15 min',
      label: 'after it ends',
    });
  });

  it('Isha: the end stays not listed', () => {
    expect(planFigures('now', ISHA, place({ arrivalTime: '19:30' }))[2]).toEqual({ value: '—', label: 'end not listed' });
  });

  it('NEXT: leave-by and start, never an arrival-vs-end comparison', () => {
    const fajr: PrayerWindow = { name: 'Fajr', startTime: '04:40', endTime: '05:59', hasStarted: false };
    expect(planFigures('next', fajr, place({ etaMinutes: 10, arrivalTime: '23:59' }))).toEqual([
      { value: '10 min', label: 'drive' },
      { value: '4:30 AM', label: 'leave by' },
      { value: '4:40 AM', label: 'Fajr starts' },
    ]);
  });
});
