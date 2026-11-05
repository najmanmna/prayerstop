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

/** One day of a permanent (year-independent) timetable, keyed by calendar day. */
export interface PermanentPrayerDay extends Omit<DailyPrayerTimes, 'date'> {
  /** "MM-DD" — "02-29" exists and is only ever looked up in leap years. */
  monthDay: string;
}

export interface PermanentZonePrayerDataset {
  zone: string;
  regions: string[];
  country: string;
  days: PermanentPrayerDay[];
}

/**
 * Repository for ACJU's permanent timetable — the same times every year,
 * keyed by calendar day (see scripts/acju/build-zone-dataset.js for how
 * this was verified). Any date in any year resolves to that calendar day's
 * times; the returned object carries the actual requested date, so the
 * engine sees exactly what it would from a dated dataset.
 */
export class PermanentPrayerTimeRepository implements PrayerTimeRepository {
  private readonly daysByZone = new Map<string, Map<string, PermanentPrayerDay>>();

  constructor(datasets: PermanentZonePrayerDataset[]) {
    for (const dataset of datasets) {
      const byMonthDay = new Map<string, PermanentPrayerDay>();
      for (const day of dataset.days) {
        byMonthDay.set(day.monthDay, day);
      }
      this.daysByZone.set(dataset.zone, byMonthDay);
    }
  }

  getDailyTimes(zoneId: string, isoDate: string): DailyPrayerTimes | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
    const day = this.daysByZone.get(zoneId)?.get(isoDate.slice(5));
    if (!day) return null;
    return {
      date: isoDate,
      fajr: day.fajr,
      sunrise: day.sunrise,
      dhuhr: day.dhuhr,
      asr: day.asr,
      maghrib: day.maghrib,
      isha: day.isha,
    };
  }
}
