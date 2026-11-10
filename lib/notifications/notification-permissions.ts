import * as Notifications from 'expo-notifications';

export type NotificationPermissionStatus = 'granted' | 'denied' | 'undetermined';

/**
 * Turns the OS answer into the status the app acts on.
 *
 * Android 13+ reports a never-asked notification permission as `denied`
 * (notifications are off until the app asks), not `undetermined`. Only
 * `canAskAgain` tells "not asked yet" from "refused for good", so a denial
 * we can still ask about counts as `undetermined`. Treating it as `denied`
 * hid the reminders card on every fresh install on modern Android.
 */
export function toNotificationPermissionStatus(result: {
  status: string;
  canAskAgain?: boolean;
}): NotificationPermissionStatus {
  if (result.status === 'granted') return 'granted';
  if (result.status === 'denied') return result.canAskAgain === true ? 'undetermined' : 'denied';
  return 'undetermined';
}

/** Reads the current permission status without prompting the user. */
export async function getNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  return toNotificationPermissionStatus(await Notifications.getPermissionsAsync());
}

/** Prompts the user if not already determined; returns the resulting status either way. */
export async function requestNotificationPermission(): Promise<NotificationPermissionStatus> {
  const result = await Notifications.requestPermissionsAsync();
  // Right after a request, a refusal is a refusal, even if Android would
  // still let us ask once more later.
  return result.status === 'granted' ? 'granted' : 'denied';
}
