export type PrayerName = 'Fajr' | 'Dhuhr' | 'Asr' | 'Maghrib' | 'Isha';

/** One day's published prayer times, Sri Lanka local time, 24-hour "HH:MM". */
export interface DailyPrayerTimes {
  date: string; // ISO "YYYY-MM-DD"
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}
