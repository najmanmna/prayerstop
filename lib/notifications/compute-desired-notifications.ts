import { formatClock12 } from '@/lib/time';
import type { PrayerTimeRepository } from '@/lib/prayer-times/prayer-time-repository';
import { addDaysToIsoDate, sriLankaWallClockToInstant, toSriLankaClock } from '@/lib/prayer-times/sri-lanka-time';
import type { DailyPrayerTimes, PrayerName } from '@/lib/prayer-times/types';

import type { DesiredPrayerNotification, PrayerReminderSettings } from './types';

export const PRAYER_NOTIFICATION_PREFIX = 'prayerstop-reminder';

const TEN_MINUTES_MS = 10 * 60 * 1000;

/** How many days of notifications to keep scheduled ahead of "today" — see `computeDesiredPrayerNotifications` for why this needs to be >1. */
export const NOTIFICATION_SCHEDULE_DAYS_AHEAD = 2;

const PRAYERS: PrayerName[] = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

function buildIdentifier(isoDate: string, prayerName: PrayerName, kind: 'at-time' | 'ten-minutes-before'): string {
  return `${PRAYER_NOTIFICATION_PREFIX}:${isoDate}:${prayerName}:${kind}`;
}

/**
 * The desired notifications for one already-known day of ACJU times, given
 * the user's reminder settings. Pure — no dependency on `now` beyond
 * filtering out anything that's already in the past, so a stale/elapsed
 * reminder for a prayer earlier today is never (re)scheduled. Never reads
 * Sunrise — it isn't a prayer.
 */
export function computeDesiredNotificationsForDay(
  daily: DailyPrayerTimes,
  settings: PrayerReminderSettings,
  now: Date
): DesiredPrayerNotification[] {
  if (!settings.enabled) return [];

  const notifications: DesiredPrayerNotification[] = [];
  const timesByPrayer: Record<PrayerName, string> = {
    Fajr: daily.fajr,
    Dhuhr: daily.dhuhr,
    Asr: daily.asr,
    Maghrib: daily.maghrib,
    Isha: daily.isha,
  };

  for (const prayerName of PRAYERS) {
    const clockTime = timesByPrayer[prayerName];
    const prayerInstant = sriLankaWallClockToInstant(daily.date, clockTime);
    const displayTime = formatClock12(clockTime);

    if (settings.atPrayerTime) {
      notifications.push({
        identifier: buildIdentifier(daily.date, prayerName, 'at-time'),
        isoDate: daily.date,
        prayerName,
        kind: 'at-time',
        fireDate: prayerInstant,
        title: `${prayerName} time — ${displayTime}`,
        body: `It's time for ${prayerName}.`,
      });
    }

    if (settings.tenMinutesBefore) {
      notifications.push({
        identifier: buildIdentifier(daily.date, prayerName, 'ten-minutes-before'),
        isoDate: daily.date,
        prayerName,
        kind: 'ten-minutes-before',
        fireDate: new Date(prayerInstant.getTime() - TEN_MINUTES_MS),
        title: `${prayerName} in 10 minutes`,
        body: `${prayerName} starts at ${displayTime}.`,
      });
    }
  }

  // Never schedule (or re-schedule) something whose fire time has already
  // passed — a DATE trigger in the past is not something to rely on
  // firing sanely, and a prayer already elapsed today needs no reminder.
  return notifications.filter((notification) => notification.fireDate.getTime() > now.getTime());
}

/**
 * The full desired notification set across today plus a short lookahead
 * window. Scheduling more than just "today" matters because this app has no
 * background task — if the user never reopens it before midnight, only
 * whatever was already scheduled during the last sync will actually fire.
 * Keeping tomorrow (and the day after) queued up front means an overnight
 * gap in app usage doesn't silently skip a day of reminders. Pure aside from
 * reading through the repository interface — never touches the concrete
 * ACJU dataset or any storage/notification API directly.
 */
export function computeDesiredPrayerNotifications(
  repository: PrayerTimeRepository,
  zoneId: string,
  now: Date,
  settings: PrayerReminderSettings,
  daysAhead: number = NOTIFICATION_SCHEDULE_DAYS_AHEAD
): DesiredPrayerNotification[] {
  if (!settings.enabled) return [];

  const { isoDate: todayIso } = toSriLankaClock(now);
  const notifications: DesiredPrayerNotification[] = [];

  for (let offset = 0; offset < daysAhead; offset++) {
    const isoDate = addDaysToIsoDate(todayIso, offset);
    const daily = repository.getDailyTimes(zoneId, isoDate);
    // A day outside the bundled dataset's coverage is skipped silently
    // rather than treated as an error — the same "don't fabricate" stance
    // the prayer engine takes when an adjacent day isn't available.
    if (!daily) continue;
    notifications.push(...computeDesiredNotificationsForDay(daily, settings, now));
  }

  return notifications;
}
