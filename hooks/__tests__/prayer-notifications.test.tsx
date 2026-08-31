// Component-level test (same justified exception as the other hook tests in
// this project) — permission-denied handling and settings persistence are
// Provider lifecycle properties that need the hook actually running.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Notifications from 'expo-notifications';
import { AppState, Platform, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

import { PRAYER_NOTIFICATION_PREFIX } from '@/lib/notifications/compute-desired-notifications';
import { TEST_NOTIFICATION_PREFIX } from '@/lib/notifications/expo-notification-scheduler';
import ExactAlarmModule from '@/modules/exact-alarm/src/ExactAlarmModule';

import { PrayerNotificationsProvider, usePrayerNotifications, type PrayerNotificationsValue } from '../prayer-notifications';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidImportance: { HIGH: 4 },
}));

jest.mock('@/modules/exact-alarm/src/ExactAlarmModule', () => ({
  canScheduleExactAlarms: jest.fn(),
}));

jest.mock('expo-intent-launcher', () => ({
  startActivityAsync: jest.fn(),
  ActivityAction: { REQUEST_SCHEDULE_EXACT_ALARM: 'android.settings.REQUEST_SCHEDULE_EXACT_ALARM' },
}));

const mockedNotifications = Notifications as jest.Mocked<typeof Notifications>;
const mockedExactAlarmModule = ExactAlarmModule as jest.Mocked<typeof ExactAlarmModule>;
const mockedIntentLauncher = IntentLauncher as jest.Mocked<typeof IntentLauncher>;

function Probe({ onValue }: { onValue: (value: PrayerNotificationsValue) => void }) {
  const value = usePrayerNotifications();
  onValue(value);
  return <Text>{String(value.settings.enabled)}</Text>;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

let addEventListenerSpy: jest.SpyInstance;
// The Provider holds a real setInterval (its long-lookahead safety-net
// resync) — unmounting after every test runs that effect's cleanup, or the
// timer handle keeps the process alive and Jest hangs on exit.
let renderer: TestRenderer.ReactTestRenderer | undefined;
const originalPlatformOS = Platform.OS;

describe('PrayerNotificationsProvider', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockedNotifications.getPermissionsAsync.mockResolvedValue({ status: 'undetermined' } as never);
    mockedNotifications.requestPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
    mockedNotifications.getAllScheduledNotificationsAsync.mockResolvedValue([]);
    mockedNotifications.scheduleNotificationAsync.mockResolvedValue('id' as never);
    // Defaults to "available" so existing tests (written before the exact-alarm
    // check existed) keep exercising the same scheduling behavior unchanged.
    mockedExactAlarmModule.canScheduleExactAlarms.mockReturnValue(true);
    addEventListenerSpy = jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
  });

  afterEach(() => {
    act(() => {
      renderer?.unmount();
    });
    renderer = undefined;
    addEventListenerSpy.mockRestore();
    Platform.OS = originalPlatformOS;
  });

  it('loads with reminders off by default and no permission prompt on mount', async () => {
    let latest: PrayerNotificationsValue | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <PrayerNotificationsProvider>
          <Probe onValue={(v) => (latest = v)} />
        </PrayerNotificationsProvider>
      );
    });
    await flush();

    expect(latest?.isLoaded).toBe(true);
    expect(latest?.settings.enabled).toBe(false);
    expect(latest?.settings.tenMinutesBefore).toBe(true);
    expect(latest?.settings.atPrayerTime).toBe(true);
    expect(mockedNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('turning reminders on requests permission, and enables + persists on grant', async () => {
    let latest: PrayerNotificationsValue | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <PrayerNotificationsProvider>
          <Probe onValue={(v) => (latest = v)} />
        </PrayerNotificationsProvider>
      );
    });
    await flush();

    await act(async () => {
      await latest?.setEnabled(true);
    });
    await flush();

    expect(mockedNotifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(latest?.settings.enabled).toBe(true);

    const stored = await AsyncStorage.getItem('prayerstop.prayerReminderSettings.v1');
    expect(JSON.parse(stored!).enabled).toBe(true);
  });

  it('handles permission denial gracefully: reminders stay off, no crash, no notifications scheduled', async () => {
    mockedNotifications.requestPermissionsAsync.mockResolvedValue({ status: 'denied' } as never);
    let latest: PrayerNotificationsValue | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <PrayerNotificationsProvider>
          <Probe onValue={(v) => (latest = v)} />
        </PrayerNotificationsProvider>
      );
    });
    await flush();

    await act(async () => {
      await latest?.setEnabled(true);
    });
    await flush();

    expect(latest?.settings.enabled).toBe(false);
    expect(latest?.permissionStatus).toBe('denied');
    expect(mockedNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();

    // The denied preference is never written as "on" — nothing to silently
    // resurrect on the next app launch.
    const stored = await AsyncStorage.getItem('prayerstop.prayerReminderSettings.v1');
    expect(stored).toBeNull();
  });

  it('disabled notifications: sub-toggle changes while the master switch is off do not schedule anything', async () => {
    let latest: PrayerNotificationsValue | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <PrayerNotificationsProvider>
          <Probe onValue={(v) => (latest = v)} />
        </PrayerNotificationsProvider>
      );
    });
    await flush();

    await act(async () => {
      latest?.setTenMinutesBefore(false);
    });
    await flush();

    expect(latest?.settings.tenMinutesBefore).toBe(false);
    expect(mockedNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('once enabled and granted, syncs real prayer-reminder notifications with the OS', async () => {
    mockedNotifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
    let latest: PrayerNotificationsValue | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <PrayerNotificationsProvider>
          <Probe onValue={(v) => (latest = v)} />
        </PrayerNotificationsProvider>
      );
    });
    await flush();

    await act(async () => {
      await latest?.setEnabled(true);
    });
    await flush();

    expect(mockedNotifications.scheduleNotificationAsync).toHaveBeenCalled();
    const [firstCall] = mockedNotifications.scheduleNotificationAsync.mock.calls;
    expect((firstCall[0] as { identifier: string }).identifier.startsWith(PRAYER_NOTIFICATION_PREFIX)).toBe(true);
  });

  it('resyncs (re-checking permission) when the app returns to the foreground', async () => {
    mockedNotifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);

    await act(async () => {
      renderer = TestRenderer.create(
        <PrayerNotificationsProvider>
          <Probe onValue={() => {}} />
        </PrayerNotificationsProvider>
      );
    });
    await flush();

    expect(addEventListenerSpy).toHaveBeenCalledWith('change', expect.any(Function));
    const onAppStateChange = addEventListenerSpy.mock.calls[0][1];
    const callsBefore = mockedNotifications.getPermissionsAsync.mock.calls.length;

    await act(async () => {
      onAppStateChange('background');
      onAppStateChange('active');
      await Promise.resolve();
    });
    await flush();

    expect(mockedNotifications.getPermissionsAsync.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('sendTestNotification: schedules a one-off notification under a distinct prefix when permission is already granted', async () => {
    mockedNotifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
    let latest: PrayerNotificationsValue | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <PrayerNotificationsProvider>
          <Probe onValue={(v) => (latest = v)} />
        </PrayerNotificationsProvider>
      );
    });
    await flush();
    mockedNotifications.scheduleNotificationAsync.mockClear();

    let outcome: 'sent' | 'permission-denied' | undefined;
    await act(async () => {
      outcome = await latest?.sendTestNotification();
    });

    expect(outcome).toBe('sent');
    expect(mockedNotifications.requestPermissionsAsync).not.toHaveBeenCalled(); // already granted
    expect(mockedNotifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const [call] = mockedNotifications.scheduleNotificationAsync.mock.calls;
    const identifier = (call[0] as { identifier: string }).identifier;
    expect(identifier.startsWith(TEST_NOTIFICATION_PREFIX)).toBe(true);
    expect(identifier.startsWith(PRAYER_NOTIFICATION_PREFIX)).toBe(false);
  });

  it('sendTestNotification: requests permission if not yet granted, and schedules nothing when denied', async () => {
    mockedNotifications.requestPermissionsAsync.mockResolvedValue({ status: 'denied' } as never);
    let latest: PrayerNotificationsValue | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <PrayerNotificationsProvider>
          <Probe onValue={(v) => (latest = v)} />
        </PrayerNotificationsProvider>
      );
    });
    await flush();
    mockedNotifications.scheduleNotificationAsync.mockClear();

    let outcome: 'sent' | 'permission-denied' | undefined;
    await act(async () => {
      outcome = await latest?.sendTestNotification();
    });

    expect(outcome).toBe('permission-denied');
    expect(mockedNotifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockedNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('exact-alarm availability: reflects the native Android check once loaded', async () => {
    Platform.OS = 'android';
    mockedExactAlarmModule.canScheduleExactAlarms.mockReturnValue(false);
    let latest: PrayerNotificationsValue | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <PrayerNotificationsProvider>
          <Probe onValue={(v) => (latest = v)} />
        </PrayerNotificationsProvider>
      );
    });
    await flush();

    expect(latest?.exactAlarmAvailable).toBe(false);
  });

  it('permission unavailable state: exact-alarm access being unavailable does not block scheduling — POST_NOTIFICATIONS is the only gate, matching existing (unchanged) scheduling behavior', async () => {
    Platform.OS = 'android';
    mockedNotifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
    mockedExactAlarmModule.canScheduleExactAlarms.mockReturnValue(false);
    let latest: PrayerNotificationsValue | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <PrayerNotificationsProvider>
          <Probe onValue={(v) => (latest = v)} />
        </PrayerNotificationsProvider>
      );
    });
    await flush();

    await act(async () => {
      await latest?.setEnabled(true);
    });
    await flush();

    expect(latest?.exactAlarmAvailable).toBe(false);
    expect(latest?.settings.enabled).toBe(true);
    // Scheduling still happens exactly as before — expo-notifications itself
    // decides exact vs. inexact delivery based on the OS permission; this
    // app's own scheduling/identifier/duplicate-prevention logic is
    // unchanged either way (see compute-desired-notifications.ts,
    // sync-prayer-notifications.ts).
    expect(mockedNotifications.scheduleNotificationAsync).toHaveBeenCalled();
    const [firstCall] = mockedNotifications.scheduleNotificationAsync.mock.calls;
    expect((firstCall[0] as { identifier: string }).identifier.startsWith(PRAYER_NOTIFICATION_PREFIX)).toBe(true);
  });

  it('does not conflate POST_NOTIFICATIONS permission with exact-alarm access: denying notifications leaves exact-alarm state untouched, and vice versa', async () => {
    Platform.OS = 'android';
    mockedNotifications.requestPermissionsAsync.mockResolvedValue({ status: 'denied' } as never);
    mockedExactAlarmModule.canScheduleExactAlarms.mockReturnValue(true);
    let latest: PrayerNotificationsValue | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <PrayerNotificationsProvider>
          <Probe onValue={(v) => (latest = v)} />
        </PrayerNotificationsProvider>
      );
    });
    await flush();

    await act(async () => {
      await latest?.setEnabled(true);
    });
    await flush();

    // POST_NOTIFICATIONS was denied (reminders stay off)...
    expect(latest?.permissionStatus).toBe('denied');
    expect(latest?.settings.enabled).toBe(false);
    // ...but the unrelated exact-alarm check is untouched by that denial.
    expect(latest?.exactAlarmAvailable).toBe(true);
  });

  it('settings action/deep link: openExactAlarmSettings opens the Android "Alarms & reminders" screen scoped to this app', async () => {
    Platform.OS = 'android';
    if (Constants.expoConfig) {
      Constants.expoConfig.android = { ...Constants.expoConfig.android, package: 'com.ahamedwebstudio.prayerstop' };
    }
    let latest: PrayerNotificationsValue | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <PrayerNotificationsProvider>
          <Probe onValue={(v) => (latest = v)} />
        </PrayerNotificationsProvider>
      );
    });
    await flush();

    await act(async () => {
      await latest?.openExactAlarmSettings();
    });

    expect(mockedIntentLauncher.startActivityAsync).toHaveBeenCalledTimes(1);
    const [action, options] = mockedIntentLauncher.startActivityAsync.mock.calls[0];
    expect(action).toBe('android.settings.REQUEST_SCHEDULE_EXACT_ALARM');
    expect((options as { data: string }).data).toMatch(/^package:/);
  });

  it('re-checks exact-alarm availability (in addition to POST_NOTIFICATIONS) when the app returns to the foreground', async () => {
    Platform.OS = 'android';
    mockedExactAlarmModule.canScheduleExactAlarms.mockReturnValue(false);
    let latest: PrayerNotificationsValue | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <PrayerNotificationsProvider>
          <Probe onValue={(v) => (latest = v)} />
        </PrayerNotificationsProvider>
      );
    });
    await flush();
    expect(latest?.exactAlarmAvailable).toBe(false);

    // The user granted it via the OS settings screen while the app was backgrounded.
    mockedExactAlarmModule.canScheduleExactAlarms.mockReturnValue(true);
    const onAppStateChange = addEventListenerSpy.mock.calls[0][1];
    await act(async () => {
      onAppStateChange('background');
      onAppStateChange('active');
      await Promise.resolve();
    });
    await flush();

    expect(latest?.exactAlarmAvailable).toBe(true);
  });
});
