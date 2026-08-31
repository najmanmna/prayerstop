import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { PrayerNotificationScheduler } from './sync-prayer-notifications';

export const ANDROID_REMINDER_CHANNEL_ID = 'prayer-reminders';

// Local (not push) notifications still need a foreground presentation
// handler on both platforms, or a scheduled notification that fires while
// the app is open won't show anything. Set once, at module load — this
// module is only ever imported by the one Provider that owns notification
// scheduling (see hooks/prayer-notifications.tsx).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Android 8+ requires a channel before any notification can be shown; harmless/no-op on iOS. */
export async function ensureAndroidReminderChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_REMINDER_CHANNEL_ID, {
    name: 'Prayer reminders',
    importance: Notifications.AndroidImportance.HIGH,
  });
}

// Deliberately a different prefix from PRAYER_NOTIFICATION_PREFIX so
// syncPrayerNotifications' cancel/schedule diff (which only ever touches
// identifiers under the real prefix) can never see or cancel a test
// notification, and vice versa.
export const TEST_NOTIFICATION_PREFIX = 'prayerstop-test';

/**
 * Dev-only: fires a one-off local notification a few seconds out, completely
 * bypassing real ACJU prayer times — for verifying that permission
 * requests, Android channel setup, and on-device display actually work,
 * without waiting for a real prayer boundary. Never called from production
 * UI (see the `__DEV__` guard around the Settings button that calls this).
 */
export async function scheduleTestNotification(secondsFromNow: number = 5): Promise<void> {
  await ensureAndroidReminderChannel();
  await Notifications.scheduleNotificationAsync({
    identifier: `${TEST_NOTIFICATION_PREFIX}:${Date.now()}`,
    content: {
      title: 'Test notification',
      body: 'If you can see this, local notifications are working.',
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(Date.now() + secondsFromNow * 1000),
      channelId: ANDROID_REMINDER_CHANNEL_ID,
    },
  });
}

export const expoPrayerNotificationScheduler: PrayerNotificationScheduler = {
  async getScheduledIdentifiers() {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    return scheduled.map((notification) => notification.identifier);
  },

  async schedule(notification) {
    await Notifications.scheduleNotificationAsync({
      identifier: notification.identifier,
      content: {
        title: notification.title,
        body: notification.body,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: notification.fireDate,
        channelId: ANDROID_REMINDER_CHANNEL_ID,
      },
    });
  },

  async cancel(identifier) {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  },
};
