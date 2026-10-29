import zone01 from '@/data/acju/zone-01.json';

import { acjuPrayerTimeRepository } from '../acju-repository';
import { getPrayerEngineState } from '../prayer-engine';
import type { DailyPrayerTimes } from '../types';

const ZONE_01 = '01';

/** Builds the UTC instant corresponding to a given Sri Lanka (UTC+5:30) wall-clock time. */
function slInstant(isoDate: string, hours: number, minutes: number, seconds = 0): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds) - (5 * 60 + 30) * 60_000);
}

function hhmmToSeconds(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours * 3600 + minutes * 60;
}

/** Reads the bundled JSON directly (not via the repository) so the tests check the repository against the raw data. */
function dayByDate(isoDate: string): DailyPrayerTimes {
  const day = zone01.days.find((entry) => entry.monthDay === isoDate.slice(5));
  if (!day) throw new Error(`Test fixture problem: ${isoDate.slice(5)} not found in the bundled zone-01 dataset.`);
  return { date: isoDate, fajr: day.fajr, sunrise: day.sunrise, dhuhr: day.dhuhr, asr: day.asr, maghrib: day.maghrib, isha: day.isha };
}

describe('getPrayerEngineState against the real Zone 01 dataset', () => {
  it('identifies a normal midday Dhuhr window on 2026-08-15', () => {
    const day = dayByDate('2026-08-15');
    const result = getPrayerEngineState(acjuPrayerTimeRepository, ZONE_01, slInstant('2026-08-15', 13, 0));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.state.active).toEqual({ name: 'Dhuhr', startTime: day.dhuhr, endTime: day.asr, hasStarted: true });
    expect(result.state.next.name).toBe('Asr');
  });

  it('uses the real ACJU Sunrise time as Fajr\'s known end on 2026-08-15', () => {
    const day = dayByDate('2026-08-15');
    const fajrSeconds = hhmmToSeconds(day.fajr);
    const sunriseSeconds = hhmmToSeconds(day.sunrise);
    const midpointSeconds = Math.floor((fajrSeconds + sunriseSeconds) / 2);
    const hours = Math.floor(midpointSeconds / 3600);
    const minutes = Math.floor((midpointSeconds % 3600) / 60);

    const result = getPrayerEngineState(acjuPrayerTimeRepository, ZONE_01, slInstant('2026-08-15', hours, minutes));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.state.active).toEqual({ name: 'Fajr', startTime: day.fajr, endTime: day.sunrise, hasStarted: true });
    expect(result.state.secondsUntilActiveEnds).toBe(sunriseSeconds - midpointSeconds);
  });

  it('transitions Fajr to a not-yet-started Dhuhr exactly at the real ACJU Sunrise time on 2026-08-15', () => {
    const day = dayByDate('2026-08-15');
    const [sunHours, sunMinutes] = day.sunrise.split(':').map(Number);

    const result = getPrayerEngineState(
      acjuPrayerTimeRepository,
      ZONE_01,
      slInstant('2026-08-15', sunHours, sunMinutes, 0)
    );
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.state.active.name).not.toBe('Fajr');
    expect(result.state.active).toEqual({ name: 'Dhuhr', startTime: day.dhuhr, endTime: day.asr, hasStarted: false });
    expect(result.state.secondsUntilActiveEnds).toBeNull();
    expect(result.state.secondsUntilNextStart).toBe(hhmmToSeconds(day.dhuhr) - hhmmToSeconds(day.sunrise));
  });

  const monthBoundaries: [string, string][] = [
    ['2026-08-31', '2026-09-01'],
    ['2026-09-30', '2026-10-01'],
    ['2026-10-31', '2026-11-01'],
    ['2026-11-30', '2026-12-01'],
  ];

  it.each(monthBoundaries)(
    'crosses the %s -> %s month boundary via Isha (no fabricated deadline) -> Fajr',
    (lastDayIso, firstDayIso) => {
      const lastDay = dayByDate(lastDayIso);
      const firstDay = dayByDate(firstDayIso);

      // Late in the evening of the last day of the month, after Isha.
      const result = getPrayerEngineState(acjuPrayerTimeRepository, ZONE_01, slInstant(lastDayIso, 23, 30));
      expect(result.status).toBe('ok');
      if (result.status !== 'ok') return;

      expect(result.state.today.date).toBe(lastDayIso);
      // Isha's endTime must be null — never the next month's Fajr time.
      expect(result.state.active).toEqual({ name: 'Isha', startTime: lastDay.isha, endTime: null, hasStarted: true });
      // next.endTime must be the next day's real Sunrise — never its Dhuhr.
      expect(result.state.next).toEqual({
        name: 'Fajr',
        startTime: firstDay.fajr,
        endTime: firstDay.sunrise,
        hasStarted: false,
      });

      const secondsToMidnight = 24 * 3600 - (23 * 3600 + 30 * 60);
      expect(result.state.secondsUntilNextStart).toBe(secondsToMidnight + hhmmToSeconds(firstDay.fajr));
      expect(result.state.secondsUntilActiveEnds).toBeNull();
    }
  );

  it.each(monthBoundaries)(
    'sees %s\'s Isha as still active (endTime null) just after midnight into %s',
    (lastDayIso, firstDayIso) => {
      const lastDay = dayByDate(lastDayIso);
      const firstDay = dayByDate(firstDayIso);

      const result = getPrayerEngineState(acjuPrayerTimeRepository, ZONE_01, slInstant(firstDayIso, 0, 30));
      expect(result.status).toBe('ok');
      if (result.status !== 'ok') return;

      expect(result.state.today.date).toBe(firstDayIso);
      expect(result.state.active).toEqual({ name: 'Isha', startTime: lastDay.isha, endTime: null, hasStarted: true });
      expect(result.state.secondsUntilActiveEnds).toBeNull();
      expect(result.state.secondsUntilNextStart).toBe(hhmmToSeconds(firstDay.fajr) - 30 * 60);
    }
  );

  it('crosses the 2026 -> 2027 year boundary (the timetable is permanent, so 2027 has times)', () => {
    const result = getPrayerEngineState(acjuPrayerTimeRepository, ZONE_01, slInstant('2026-12-31', 23, 0));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.state.active).toEqual({ name: 'Isha', startTime: dayByDate('2026-12-31').isha, endTime: null, hasStarted: true });
    expect(result.state.next.startTime).toBe(dayByDate('2027-01-01').fajr);
  });

  it('gives the same calendar day the same times in any year', () => {
    for (const isoDate of ['2027-06-15', '2030-06-15', '2045-06-15']) {
      expect(acjuPrayerTimeRepository.getDailyTimes(ZONE_01, isoDate)).toEqual(dayByDate(isoDate));
    }
  });

  it('uses the 29 February row in a leap year, and goes straight from 28 February to 1 March otherwise', () => {
    expect(acjuPrayerTimeRepository.getDailyTimes(ZONE_01, '2028-02-29')).toEqual(dayByDate('2028-02-29'));

    // 2027 isn't a leap year: late on 28 Feb, the next Fajr is 1 March's.
    const result = getPrayerEngineState(acjuPrayerTimeRepository, ZONE_01, slInstant('2027-02-28', 23, 0));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.state.next.startTime).toBe(dayByDate('2027-03-01').fajr);
  });
});
