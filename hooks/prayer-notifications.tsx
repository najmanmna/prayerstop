import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { canScheduleExactAlarms, openExactAlarmSettings } from '@/lib/notifications/android-exact-alarm';
import {
  computeDesiredPrayerNotifications,
  PRAYER_NOTIFICATION_PREFIX,
} from '@/lib/notifications/compute-desired-notifications';
import {
  ensureAndroidReminderChannel,
  expoPrayerNotificationScheduler,
  scheduleTestNotification,
} from '@/lib/notifications/expo-notification-scheduler';
import {
  getNotificationPermissionStatus,
  requestNotificationPermission,
  type NotificationPermissionStatus,
} from '@/lib/notifications/notification-permissions';
import { loadReminderSettings, saveReminderSettings } from '@/lib/notifications/reminder-settings-storage';
import { syncPrayerNotifications } from '@/lib/notifications/sync-prayer-notifications';
import { DEFAULT_PRAYER_REMINDER_SETTINGS, type PrayerReminderSettings } from '@/lib/notifications/types';
import { acjuPrayerTimeRepository, DEFAULT_ZONE_ID } from '@/lib/prayer-times/acju-repository';

// Safety-net resync for a session left open (foregrounded, never
// backgrounded) across a schedule/date change — foreground-resume and
// settings changes are the primary resync triggers, this just bounds the
// worst case for a long-lived open session.
const SAFETY_RESYNC_INTERVAL_MS = 30 * 60 * 1000;

export interface PrayerNotificationsValue {
  settings: PrayerReminderSettings;
  /** 'unknown' only briefly, before the initial permission check resolves. */
  permissionStatus: NotificationPermissionStatus | 'unknown';
  /**
   * Android's separate "Alarms & reminders" special permission (API 31+) —
   * deliberately NOT the same thing as `permissionStatus` above, which is
   * POST_NOTIFICATIONS. They're two unrelated OS permissions with different
   * grant flows (one a runtime prompt, this one only togglable in system
   * Settings). Always `true` on iOS/web. 'unknown' only briefly before the
   * initial check resolves. See `lib/notifications/android-exact-alarm.ts`.
   */
  exactAlarmAvailable: boolean | 'unknown';
  isLoaded: boolean;
  /** Requests OS permission when turning on; leaves `settings.enabled` false if permission is denied (see "Handle notification permission denied gracefully" in CLAUDE.md/docs). */
  setEnabled: (enabled: boolean) => Promise<void>;
  setTenMinutesBefore: (value: boolean) => void;
  setAtPrayerTime: (value: boolean) => void;
  /** Dev-only: fires a one-off local notification a few seconds out, bypassing real prayer times entirely — see the `__DEV__`-guarded button in Settings. Requests permission first if not already granted. */
  sendTestNotification: () => Promise<'sent' | 'permission-denied'>;
  /** Opens Android's "Alarms & reminders" settings screen for this app. No-op on iOS/web. */
  openExactAlarmSettings: () => Promise<void>;
}

const PrayerNotificationsContext = createContext<PrayerNotificationsValue | null>(null);

/**
 * Owns prayer-reminder settings (persisted locally) and keeps the device's
 * scheduled local notifications in sync with them — mounted once at the app
 * root (see app/_layout.tsx), the same pattern as
 * `NearbyPlacesSessionProvider`, so scheduling survives navigation and isn't
 * tied to the Settings screen being on screen.
 *
 * Resyncs on: initial load, any settings change, the app returning to the
 * foreground (which also re-checks permission, in case it was changed in OS
 * Settings), and a periodic safety-net interval. Never on a per-second tick —
 * `computeDesiredPrayerNotifications` schedules a couple of days ahead
 * specifically so an exact-instant resync isn't required for correctness.
 */
export function PrayerNotificationsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PrayerReminderSettings>(DEFAULT_PRAYER_REMINDER_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermissionStatus | 'unknown'>('unknown');
  const [exactAlarmAvailable, setExactAlarmAvailable] = useState<boolean | 'unknown'>('unknown');
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const permissionRef = useRef(permissionStatus);
  permissionRef.current = permissionStatus;

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadReminderSettings(), getNotificationPermissionStatus(), canScheduleExactAlarms()]).then(
      ([loadedSettings, status, exactAlarm]) => {
        if (cancelled) return;
        setSettings(loadedSettings);
        setPermissionStatus(status);
        setExactAlarmAvailable(exactAlarm);
        setIsLoaded(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const runSync = useCallback(async () => {
    // Permission not granted → treat reminders as off regardless of the
    // stored preference, so a revoked/denied permission never leaves a
    // dangling "on" toggle whose notifications silently can't appear.
    const effectiveSettings: PrayerReminderSettings =
      permissionRef.current === 'granted' ? settingsRef.current : { ...settingsRef.current, enabled: false };

    await ensureAndroidReminderChannel();
    const desired = computeDesiredPrayerNotifications(acjuPrayerTimeRepository, DEFAULT_ZONE_ID, new Date(), effectiveSettings);
    await syncPrayerNotifications(expoPrayerNotificationScheduler, desired, PRAYER_NOTIFICATION_PREFIX);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    runSync();
  }, [isLoaded, settings, permissionStatus, exactAlarmAvailable, runSync]);

  useEffect(() => {
    if (!isLoaded) return;
    let appState: AppStateStatus = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      const cameToForeground = (appState === 'inactive' || appState === 'background') && nextState === 'active';
      appState = nextState;
      if (!cameToForeground) return;
      // Re-check both permissions on foreground-resume — this is the path
      // that picks up a grant the user just made in OS Settings (e.g. after
      // tapping through from `openExactAlarmSettings`).
      Promise.all([getNotificationPermissionStatus(), canScheduleExactAlarms()]).then(([status, exactAlarm]) => {
        setPermissionStatus(status);
        setExactAlarmAvailable(exactAlarm);
        runSync();
      });
    });
    return () => subscription.remove();
  }, [isLoaded, runSync]);

  useEffect(() => {
    if (!isLoaded) return;
    const interval = setInterval(runSync, SAFETY_RESYNC_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isLoaded, runSync]);

  const setEnabled = useCallback(async (enabled: boolean) => {
    if (enabled) {
      const status = await requestNotificationPermission();
      setPermissionStatus(status);
      if (status !== 'granted') {
        // Denied (or otherwise not granted): leave the setting off rather
        // than storing an "on" preference that can't actually fire anything.
        // The Settings screen shows this state via `permissionStatus`.
        return;
      }
    }
    setSettings((prev) => {
      const next = { ...prev, enabled };
      saveReminderSettings(next);
      return next;
    });
  }, []);

  const setTenMinutesBefore = useCallback((value: boolean) => {
    setSettings((prev) => {
      const next = { ...prev, tenMinutesBefore: value };
      saveReminderSettings(next);
      return next;
    });
  }, []);

  const setAtPrayerTime = useCallback((value: boolean) => {
    setSettings((prev) => {
      const next = { ...prev, atPrayerTime: value };
      saveReminderSettings(next);
      return next;
    });
  }, []);

  const sendTestNotification = useCallback(async (): Promise<'sent' | 'permission-denied'> => {
    let status = permissionRef.current;
    if (status !== 'granted') {
      status = await requestNotificationPermission();
      setPermissionStatus(status);
    }
    if (status !== 'granted') return 'permission-denied';

    await scheduleTestNotification();
    return 'sent';
  }, []);

  return (
    <PrayerNotificationsContext.Provider
      value={{
        settings,
        permissionStatus,
        exactAlarmAvailable,
        isLoaded,
        setEnabled,
        setTenMinutesBefore,
        setAtPrayerTime,
        sendTestNotification,
        openExactAlarmSettings,
      }}>
      {children}
    </PrayerNotificationsContext.Provider>
  );
}

/** Reads/controls prayer-reminder settings. Must be used within `PrayerNotificationsProvider` (mounted once in `app/_layout.tsx`). */
export function usePrayerNotifications(): PrayerNotificationsValue {
  const value = useContext(PrayerNotificationsContext);
  if (!value) {
    throw new Error('usePrayerNotifications must be used within a PrayerNotificationsProvider');
  }
  return value;
}
