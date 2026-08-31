import type { PrayerName } from '@/lib/prayer-times/types';

export interface PrayerReminderSettings {
  /** Master switch. When false, no prayer-reminder notifications are scheduled at all. */
  enabled: boolean;
  tenMinutesBefore: boolean;
  atPrayerTime: boolean;
}

/**
 * Reminders are opt-in: no notification-permission prompt happens, and no
 * reminder is scheduled, until the user explicitly turns this on in
 * Settings. The two reminder kinds default to on once the user does opt in.
 */
export const DEFAULT_PRAYER_REMINDER_SETTINGS: PrayerReminderSettings = {
  enabled: false,
  tenMinutesBefore: true,
  atPrayerTime: true,
};

export type ReminderKind = 'ten-minutes-before' | 'at-time';

export interface DesiredPrayerNotification {
  /** Deterministic — encodes date/prayer/kind, so re-computing the same day+settings always yields the same identifier (this is what makes duplicate-prevention possible). */
  identifier: string;
  isoDate: string;
  prayerName: PrayerName;
  kind: ReminderKind;
  fireDate: Date;
  title: string;
  body: string;
}
