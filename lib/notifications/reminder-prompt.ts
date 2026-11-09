import AsyncStorage from '@react-native-async-storage/async-storage';

import type { NotificationPermissionStatus } from './notification-permissions';

const SEEN_KEY = 'prayerstop.reminderPromptSeen.v1';

/** Whether the one-time "turn on reminders" card has already been shown and answered. */
export async function loadReminderPromptSeen(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SEEN_KEY)) === '1';
  } catch {
    // Unreadable storage: treat as seen rather than risk nagging every launch.
    return true;
  }
}

export async function markReminderPromptSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Best-effort; worst case the card shows once more.
  }
}

/**
 * The one-time reminders card shows on Home only when all of these hold:
 * never answered before, reminders are off, the OS hasn't already denied
 * notifications (we couldn't ask again from here), prayer times are on
 * screen, and the location prompt is out of the way, so two system
 * dialogs never stack on a fresh install.
 */
export function shouldShowReminderPrompt(state: {
  seen: boolean | 'unknown';
  remindersLoaded: boolean;
  /** Reminders effectively on: the setting is on AND the OS permission is granted. */
  remindersEnabled: boolean;
  permissionStatus: NotificationPermissionStatus | 'unknown';
  prayerTimesShown: boolean;
  locationSettled: boolean;
}): boolean {
  return (
    state.seen === false &&
    state.remindersLoaded &&
    !state.remindersEnabled &&
    state.permissionStatus !== 'denied' &&
    state.permissionStatus !== 'unknown' &&
    state.prayerTimesShown &&
    state.locationSettled
  );
}
