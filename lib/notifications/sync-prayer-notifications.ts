import type { DesiredPrayerNotification } from './types';

/**
 * Abstracts the actual local-notification API (expo-notifications in
 * production) behind the same "interface, not concrete implementation"
 * pattern used for `PrayerTimeRepository`/`PrayerPlaceRepository` — so the
 * scheduling/diffing logic below is pure and testable with a fake.
 */
export interface PrayerNotificationScheduler {
  /** All identifiers currently scheduled with the OS, of any kind — not just this app's prayer reminders. */
  getScheduledIdentifiers(): Promise<string[]>;
  schedule(notification: DesiredPrayerNotification): Promise<void>;
  cancel(identifier: string): Promise<void>;
}

export interface SyncPrayerNotificationsResult {
  scheduled: string[];
  cancelled: string[];
}

/**
 * Reconciles what's actually scheduled with what *should* be scheduled,
 * scoped to identifiers under `prefix` (so this never touches a scheduled
 * notification belonging to some other feature). This is what makes
 * rescheduling, duplicate-prevention, and disabling all fall out of the same
 * logic rather than needing special cases:
 *
 * - **Duplicate prevention**: an identifier already scheduled is left alone —
 *   `schedule` is only called for identifiers missing from the current set.
 * - **Rescheduling on a schedule/date change**: `desired`'s identifiers
 *   encode the date, so a new day (or changed settings) naturally produces a
 *   different desired set — yesterday's now-stale identifiers fall out of
 *   `desired` and get cancelled, the new ones get scheduled.
 * - **Disabling**: an empty `desired` list (e.g. reminders turned off)
 *   cancels every one of this app's currently-scheduled identifiers and
 *   schedules nothing.
 */
export async function syncPrayerNotifications(
  scheduler: PrayerNotificationScheduler,
  desired: DesiredPrayerNotification[],
  prefix: string
): Promise<SyncPrayerNotificationsResult> {
  const allScheduled = await scheduler.getScheduledIdentifiers();
  const ourScheduled = allScheduled.filter((identifier) => identifier.startsWith(prefix));
  const ourScheduledSet = new Set(ourScheduled);
  const desiredSet = new Set(desired.map((notification) => notification.identifier));

  const toCancel = ourScheduled.filter((identifier) => !desiredSet.has(identifier));
  const toSchedule = desired.filter((notification) => !ourScheduledSet.has(notification.identifier));

  await Promise.all(toCancel.map((identifier) => scheduler.cancel(identifier)));
  await Promise.all(toSchedule.map((notification) => scheduler.schedule(notification)));

  return { scheduled: toSchedule.map((notification) => notification.identifier), cancelled: toCancel };
}
