import type { DailyPrayerTimes } from './types';

/**
 * The data-access boundary between however ACJU data is actually stored
 * (bundled JSON today, possibly a remote/Supabase source later) and the
 * prayer engine, which only ever talks to this interface. Adding Zone 02,
 * Zone 03, etc. — or changing where the data comes from — never requires
 * touching the engine, only this layer.
 */
export interface PrayerTimeRepository {
  /** Returns the day's prayer times for a zone, or null if that date isn't covered. */
  getDailyTimes(zoneId: string, isoDate: string): DailyPrayerTimes | null;
}

export interface ZonePrayerDataset {
  zone: string;
  regions: string[];
  country: string;
  days: DailyPrayerTimes[];
}

/** In-memory repository backed by one or more locally bundled zone datasets. */
export class LocalPrayerTimeRepository implements PrayerTimeRepository {
  private readonly daysByZone = new Map<string, Map<string, DailyPrayerTimes>>();

  constructor(datasets: ZonePrayerDataset[]) {
    for (const dataset of datasets) {
      const byDate = new Map<string, DailyPrayerTimes>();
      for (const day of dataset.days) {
        byDate.set(day.date, day);
      }
      this.daysByZone.set(dataset.zone, byDate);
    }
  }

  getDailyTimes(zoneId: string, isoDate: string): DailyPrayerTimes | null {
    return this.daysByZone.get(zoneId)?.get(isoDate) ?? null;
  }
}
