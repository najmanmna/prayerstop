import * as Notifications from 'expo-notifications';

export type NotificationPermissionStatus = 'granted' | 'denied' | 'undetermined';

/** Reads the current permission status without prompting the user. */
export async function getNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  const result = await Notifications.getPermissionsAsync();
  return result.status as NotificationPermissionStatus;
}

/** Prompts the user if not already determined; returns the resulting status either way. */
export async function requestNotificationPermission(): Promise<NotificationPermissionStatus> {
  const result = await Notifications.requestPermissionsAsync();
  return result.status as NotificationPermissionStatus;
}
