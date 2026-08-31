import {
  computeDesiredNotificationsForDay,
  computeDesiredPrayerNotifications,
  NOTIFICATION_SCHEDULE_DAYS_AHEAD,
  PRAYER_NOTIFICATION_PREFIX,
} from '../compute-desired-notifications';
import { DEFAULT_PRAYER_REMINDER_SETTINGS, type PrayerReminderSettings } from '../types';
import type { PrayerTimeRepository } from '@/lib/prayer-times/prayer-time-repository';
import type { DailyPrayerTimes } from '@/lib/prayer-times/types';

const day: DailyPrayerTimes = {
  date: '2026-08-20',
  fajr: '04:45',
  sunrise: '06:02',
  dhuhr: '12:10',
  asr: '15:30',
  maghrib: '18:12',
  isha: '19:30',
};

const enabledBoth: PrayerReminderSettings = { enabled: true, tenMinutesBefore: true, atPrayerTime: true };

describe('computeDesiredNotificationsForDay', () => {
  it('returns nothing when reminders are disabled', () => {
    const now = new Date('2026-08-20T00:00:00.000Z'); // well before Fajr
    expect(computeDesiredNotificationsForDay(day, { ...enabledBoth, enabled: false }, now)).toEqual([]);
  });

  it('produces both a 10-minutes-before and an at-time notification for each of the 5 prayers, never Sunrise', () => {
    const now = new Date('2026-08-19T00:00:00.000Z'); // well before this day starts
    const result = computeDesiredNotificationsForDay(day, enabledBoth, now);

    expect(result).toHaveLength(10);
    const prayerNames = new Set(result.map((n) => n.prayerName));
    expect(prayerNames).toEqual(new Set(['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']));
    expect(result.some((n) => (n.prayerName as string) === 'Sunrise')).toBe(false);
  });

  it('every identifier is unique and prefixed', () => {
    const now = new Date('2026-08-19T00:00:00.000Z');
    const result = computeDesiredNotificationsForDay(day, enabledBoth, now);
    const identifiers = result.map((n) => n.identifier);
    expect(new Set(identifiers).size).toBe(identifiers.length);
    for (const id of identifiers) {
      expect(id.startsWith(PRAYER_NOTIFICATION_PREFIX)).toBe(true);
    }
  });

  it('includes the actual 12-hour clock time in both notification kinds', () => {
    const now = new Date('2026-08-19T00:00:00.000Z');
    const result = computeDesiredNotificationsForDay(day, enabledBoth, now);

    const fajrAtTime = result.find((n) => n.prayerName === 'Fajr' && n.kind === 'at-time')!;
    expect(fajrAtTime.title).toBe('Fajr time — 4:45 AM');
    expect(fajrAtTime.body).toBe("It's time for Fajr.");

    const fajrBefore = result.find((n) => n.prayerName === 'Fajr' && n.kind === 'ten-minutes-before')!;
    expect(fajrBefore.title).toBe('Fajr in 10 minutes');
    expect(fajrBefore.body).toBe('Fajr starts at 4:45 AM.');
  });

  it('schedules the 10-minutes-before notification exactly 10 minutes ahead of the at-time one', () => {
    const now = new Date('2026-08-19T00:00:00.000Z');
    const result = computeDesiredNotificationsForDay(day, enabledBoth, now);
    const fajrAtTime = result.find((n) => n.prayerName === 'Fajr' && n.kind === 'at-time')!;
    const fajrBefore = result.find((n) => n.prayerName === 'Fajr' && n.kind === 'ten-minutes-before')!;
    expect(fajrAtTime.fireDate.getTime() - fajrBefore.fireDate.getTime()).toBe(10 * 60 * 1000);
  });

  it('respects each sub-toggle independently', () => {
    const now = new Date('2026-08-19T00:00:00.000Z');

    const onlyAtTime = computeDesiredNotificationsForDay(day, { enabled: true, tenMinutesBefore: false, atPrayerTime: true }, now);
    expect(onlyAtTime).toHaveLength(5);
    expect(onlyAtTime.every((n) => n.kind === 'at-time')).toBe(true);

    const onlyBefore = computeDesiredNotificationsForDay(day, { enabled: true, tenMinutesBefore: true, atPrayerTime: false }, now);
    expect(onlyBefore).toHaveLength(5);
    expect(onlyBefore.every((n) => n.kind === 'ten-minutes-before')).toBe(true);

    const neither = computeDesiredNotificationsForDay(day, { enabled: true, tenMinutesBefore: false, atPrayerTime: false }, now);
    expect(neither).toEqual([]);
  });

  it('never schedules a notification whose fire time has already passed', () => {
    // "Now" is 4pm on the same day: Fajr/Dhuhr/Asr have already passed
    // (both their at-time and 10-min-before moments), only Maghrib and Isha
    // remain in the future.
    const now = new Date('2026-08-20T10:30:00.000Z'); // 16:00 Sri Lanka time
    const result = computeDesiredNotificationsForDay(day, enabledBoth, now);

    expect(result).toHaveLength(4); // Maghrib + Isha, x2 kinds each
    const prayerNames = new Set(result.map((n) => n.prayerName));
    expect(prayerNames).toEqual(new Set(['Maghrib', 'Isha']));
  });
});

function fakeRepository(days: DailyPrayerTimes[]): PrayerTimeRepository {
  const byDate = new Map(days.map((d) => [d.date, d]));
  return { getDailyTimes: (_zoneId, isoDate) => byDate.get(isoDate) ?? null };
}

describe('computeDesiredPrayerNotifications', () => {
  const day1: DailyPrayerTimes = { ...day, date: '2026-08-20' };
  const day2: DailyPrayerTimes = { ...day, date: '2026-08-21' };
  const day3: DailyPrayerTimes = { ...day, date: '2026-08-22' };

  it('returns nothing when reminders are disabled, without even reading the repository', () => {
    const repository = fakeRepository([day1, day2]);
    const getDailyTimesSpy = jest.spyOn(repository, 'getDailyTimes');
    const now = new Date('2026-08-20T00:00:00.000Z');

    const result = computeDesiredPrayerNotifications(repository, 'zone', now, { ...enabledBoth, enabled: false });

    expect(result).toEqual([]);
    expect(getDailyTimesSpy).not.toHaveBeenCalled();
  });

  // 2026-08-19T19:00:00.000Z == 2026-08-20T00:30 Sri Lanka local — "today"
  // is already 2026-08-20, but well before that day's 04:45 Fajr.
  const startOfDay1 = new Date('2026-08-19T19:00:00.000Z');

  it('schedules across today and the lookahead window (default 2 days)', () => {
    const repository = fakeRepository([day1, day2]);

    const result = computeDesiredPrayerNotifications(repository, 'zone', startOfDay1, enabledBoth);

    expect(NOTIFICATION_SCHEDULE_DAYS_AHEAD).toBe(2);
    const dates = new Set(result.map((n) => n.isoDate));
    expect(dates).toEqual(new Set(['2026-08-20', '2026-08-21']));
    expect(result).toHaveLength(20); // 10 per day x 2 days
  });

  it('silently skips a day outside the bundled dataset instead of erroring', () => {
    const repository = fakeRepository([day1]); // day2 missing entirely

    const result = computeDesiredPrayerNotifications(repository, 'zone', startOfDay1, enabledBoth);

    expect(new Set(result.map((n) => n.isoDate))).toEqual(new Set(['2026-08-20']));
  });

  it('a later "now" naturally shifts which dates are desired (the basis for date-rollover rescheduling)', () => {
    const repository = fakeRepository([day1, day2, day3]);

    const onDay1 = computeDesiredPrayerNotifications(repository, 'zone', new Date('2026-08-20T00:00:00.000Z'), enabledBoth);
    const onDay2 = computeDesiredPrayerNotifications(repository, 'zone', new Date('2026-08-21T00:00:00.000Z'), enabledBoth);

    expect(new Set(onDay1.map((n) => n.isoDate))).toEqual(new Set(['2026-08-20', '2026-08-21']));
    expect(new Set(onDay2.map((n) => n.isoDate))).toEqual(new Set(['2026-08-21', '2026-08-22']));
    // day1's identifiers are gone once "now" rolls into day2 — nothing in
    // common between the two desired sets for day1-only identifiers.
    const day1OnlyIds = onDay1.filter((n) => n.isoDate === '2026-08-20').map((n) => n.identifier);
    const onDay2Ids = new Set(onDay2.map((n) => n.identifier));
    for (const id of day1OnlyIds) {
      expect(onDay2Ids.has(id)).toBe(false);
    }
  });

  it('uses sensible default settings when nothing has been configured yet (reminders off by default)', () => {
    expect(DEFAULT_PRAYER_REMINDER_SETTINGS.enabled).toBe(false);
    expect(DEFAULT_PRAYER_REMINDER_SETTINGS.tenMinutesBefore).toBe(true);
    expect(DEFAULT_PRAYER_REMINDER_SETTINGS.atPrayerTime).toBe(true);
  });
});
