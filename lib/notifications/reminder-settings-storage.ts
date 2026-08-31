import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_PRAYER_REMINDER_SETTINGS, type PrayerReminderSettings } from './types';

const STORAGE_KEY = 'prayerstop.prayerReminderSettings.v1';

/** Falls back to defaults on missing/corrupt storage rather than throwing — reminder preferences are not critical data worth failing app startup over. */
export async function loadReminderSettings(): Promise<PrayerReminderSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PRAYER_REMINDER_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_PRAYER_REMINDER_SETTINGS.enabled,
      tenMinutesBefore:
        typeof parsed.tenMinutesBefore === 'boolean'
          ? parsed.tenMinutesBefore
          : DEFAULT_PRAYER_REMINDER_SETTINGS.tenMinutesBefore,
      atPrayerTime:
        typeof parsed.atPrayerTime === 'boolean' ? parsed.atPrayerTime : DEFAULT_PRAYER_REMINDER_SETTINGS.atPrayerTime,
    };
  } catch {
    return DEFAULT_PRAYER_REMINDER_SETTINGS;
  }
}

export async function saveReminderSettings(settings: PrayerReminderSettings): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
