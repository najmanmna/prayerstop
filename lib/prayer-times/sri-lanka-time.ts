// ACJU publishes times in Sri Lanka local time (UTC+5:30, no DST observed).
// Everything here converts an absolute instant to Sri Lanka wall-clock time
// explicitly, rather than trusting the device's own local timezone getters
// (Date#getHours etc.) — a device running in a different timezone would
// otherwise silently compute the wrong "today" and the wrong time-of-day.
const SRI_LANKA_UTC_OFFSET_MINUTES = 5 * 60 + 30;

export interface SriLankaClock {
  /** Sri Lanka calendar date, ISO "YYYY-MM-DD". */
  isoDate: string;
  /** Seconds since Sri Lanka local midnight (0–86399). */
  secondsSinceMidnight: number;
}

/** Converts an absolute instant into Sri Lanka's wall-clock date and time-of-day. */
export function toSriLankaClock(instant: Date): SriLankaClock {
  const shifted = new Date(instant.getTime() + SRI_LANKA_UTC_OFFSET_MINUTES * 60_000);
  const isoDate = shifted.toISOString().slice(0, 10);
  const secondsSinceMidnight =
    shifted.getUTCHours() * 3600 + shifted.getUTCMinutes() * 60 + shifted.getUTCSeconds();
  return { isoDate, secondsSinceMidnight };
}

/** The Sri Lanka wall-clock time of an instant, as "HH:MM" (24-hour). */
export function toSriLankaClockString(instant: Date): string {
  const { secondsSinceMidnight } = toSriLankaClock(instant);
  const hours = Math.floor(secondsSinceMidnight / 3600);
  const minutes = Math.floor((secondsSinceMidnight % 3600) / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Adds (or subtracts) whole days to an ISO "YYYY-MM-DD" date, handling month/year rollover. */
export function addDaysToIsoDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * The exact inverse of `toSriLankaClock`: turns a Sri Lanka calendar date +
 * "HH:MM" wall-clock time (as ACJU publishes them) into the absolute instant
 * it represents, regardless of the device's own timezone. Used to compute
 * real fire times for scheduled local notifications.
 */
export function sriLankaWallClockToInstant(isoDate: string, hhmm: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  const [hours, minutes] = hhmm.split(':').map(Number);
  const utcMillis = Date.UTC(year, month - 1, day, hours, minutes) - SRI_LANKA_UTC_OFFSET_MINUTES * 60_000;
  return new Date(utcMillis);
}
