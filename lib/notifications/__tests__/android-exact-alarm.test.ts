import Constants from 'expo-constants';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';

import ExactAlarmModule from '@/modules/exact-alarm/src/ExactAlarmModule';

import { canScheduleExactAlarms, openExactAlarmSettings } from '../android-exact-alarm';

jest.mock('@/modules/exact-alarm/src/ExactAlarmModule', () => ({
  canScheduleExactAlarms: jest.fn(),
}));

jest.mock('expo-intent-launcher', () => ({
  startActivityAsync: jest.fn(),
  ActivityAction: { REQUEST_SCHEDULE_EXACT_ALARM: 'android.settings.REQUEST_SCHEDULE_EXACT_ALARM' },
}));

const mockedExactAlarmModule = ExactAlarmModule as jest.Mocked<typeof ExactAlarmModule>;
const mockedIntentLauncher = IntentLauncher as jest.Mocked<typeof IntentLauncher>;

const originalPlatformOS = Platform.OS;

describe('canScheduleExactAlarms', () => {
  afterEach(() => {
    Platform.OS = originalPlatformOS;
    jest.clearAllMocks();
  });

  it('is always true on iOS, without touching the native module (no such restriction exists there)', async () => {
    Platform.OS = 'ios';

    const result = await canScheduleExactAlarms();

    expect(result).toBe(true);
    expect(mockedExactAlarmModule.canScheduleExactAlarms).not.toHaveBeenCalled();
  });

  it('is always true on web, without touching the native module', async () => {
    Platform.OS = 'web';

    const result = await canScheduleExactAlarms();

    expect(result).toBe(true);
    expect(mockedExactAlarmModule.canScheduleExactAlarms).not.toHaveBeenCalled();
  });

  it('on Android, delegates to the native ExactAlarm module and returns its answer verbatim', async () => {
    Platform.OS = 'android';
    mockedExactAlarmModule.canScheduleExactAlarms.mockReturnValue(false);

    const result = await canScheduleExactAlarms();

    expect(result).toBe(false);
    expect(mockedExactAlarmModule.canScheduleExactAlarms).toHaveBeenCalledTimes(1);
  });

  it('on Android, reflects a granted exact-alarm permission too (not a permanently-false stub)', async () => {
    Platform.OS = 'android';
    mockedExactAlarmModule.canScheduleExactAlarms.mockReturnValue(true);

    const result = await canScheduleExactAlarms();

    expect(result).toBe(true);
  });
});

describe('openExactAlarmSettings', () => {
  const originalAndroidPackage = Constants.expoConfig?.android?.package;

  afterEach(() => {
    Platform.OS = originalPlatformOS;
    jest.clearAllMocks();
    if (Constants.expoConfig?.android) {
      Constants.expoConfig.android.package = originalAndroidPackage;
    }
  });

  it('is a no-op on iOS — never launches an Android settings intent', async () => {
    Platform.OS = 'ios';

    await openExactAlarmSettings();

    expect(mockedIntentLauncher.startActivityAsync).not.toHaveBeenCalled();
  });

  it('is a no-op on web', async () => {
    Platform.OS = 'web';

    await openExactAlarmSettings();

    expect(mockedIntentLauncher.startActivityAsync).not.toHaveBeenCalled();
  });

  it('on Android, opens the app-scoped "Alarms & reminders" settings screen via the documented intent + package URI', async () => {
    Platform.OS = 'android';
    if (Constants.expoConfig) {
      Constants.expoConfig.android = { ...Constants.expoConfig.android, package: 'com.ahamedwebstudio.prayerstop' };
    }

    await openExactAlarmSettings();

    expect(mockedIntentLauncher.startActivityAsync).toHaveBeenCalledTimes(1);
    expect(mockedIntentLauncher.startActivityAsync).toHaveBeenCalledWith('android.settings.REQUEST_SCHEDULE_EXACT_ALARM', {
      data: 'package:com.ahamedwebstudio.prayerstop',
    });
  });

  it('on Android, does nothing if the package name is unexpectedly unavailable rather than launching a malformed intent', async () => {
    Platform.OS = 'android';
    if (Constants.expoConfig) {
      Constants.expoConfig.android = { ...Constants.expoConfig.android, package: undefined };
    }

    await openExactAlarmSettings();

    expect(mockedIntentLauncher.startActivityAsync).not.toHaveBeenCalled();
  });
});
