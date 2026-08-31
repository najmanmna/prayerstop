import Constants from 'expo-constants';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';

import ExactAlarmModule from '@/modules/exact-alarm/src/ExactAlarmModule';

/**
 * Whether this app can currently schedule *exact* alarms on Android (the
 * API 31+ "Alarms & reminders" special permission). Always `true` on
 * iOS/web and on Android below API 31, where the restriction doesn't exist.
 *
 * This is deliberately a separate check from `POST_NOTIFICATIONS`
 * (`lib/notifications/notification-permissions.ts`) — they are two
 * unrelated OS permissions with different grant mechanisms (one is a
 * runtime prompt, this one is a special-access toggle in system Settings
 * with no in-app dialog). See the 2026-08-23 notification-timing
 * investigation: `expo-notifications` silently falls back to inexact
 * (OS-batched/delayed) delivery whenever this is false, which is what
 * caused prayer reminders to arrive late and out of order — not a bug in
 * this app's own time math.
 */
export async function canScheduleExactAlarms(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  return ExactAlarmModule.canScheduleExactAlarms();
}

/**
 * Opens Android's "Alarms & reminders" settings screen scoped to this app
 * specifically (not the generic system-wide list), via the documented
 * `ACTION_REQUEST_SCHEDULE_EXACT_ALARM` intent with a `package:` URI. No-op
 * on iOS/web, where there's no equivalent screen.
 */
export async function openExactAlarmSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const packageName = Constants.expoConfig?.android?.package;
  if (!packageName) return;
  await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.REQUEST_SCHEDULE_EXACT_ALARM, {
    data: `package:${packageName}`,
  });
}
