/** Parses an "HH:MM" 24-hour string into minutes since midnight. */
export function parseClock(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

/** Formats an "HH:MM" 24-hour string as a 12-hour clock, e.g. "15:16" -> "3:16 PM". */
export function formatClock12(value: string): string {
  const [hoursRaw, minutesStr] = value.split(':');
  const hours24 = Number(hoursRaw);
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${minutesStr} ${period}`;
}

/** Returns an HH:MM time offset by a signed number of minutes. */
export function offsetClock(value: string, minutes: number): string {
  const minutesInDay = 24 * 60;
  const adjusted = (parseClock(value) + minutes + minutesInDay) % minutesInDay;
  const hours = Math.floor(adjusted / 60);
  const remainder = adjusted % 60;
  return `${hours.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
}

export type ArrivalOutcome =
  | { status: 'known'; remaining: number; overflow: boolean; arrivalFraction: number }
  | { status: 'unknown' };

/**
 * How much prayer time (if any) is left after arriving at a candidate
 * place. Returns `{ status: 'unknown' }` when `window.endTime` is null —
 * e.g. Isha, whose real deadline (mosque closing time, Jama'ah time) isn't
 * something we have reliable data for. Callers must not invent a number in
 * that case; showing nothing is the honest answer.
 *
 * Handles windows that cross midnight (e.g. a window ending after midnight)
 * by treating `endTime` as occurring after `startTime` even when its raw
 * HH:MM value is numerically smaller.
 */
export function getArrivalOutcome(
  window: { startTime: string; endTime: string | null },
  arrivalTime: string
): ArrivalOutcome {
  if (window.endTime === null) {
    return { status: 'unknown' };
  }
  const start = parseClock(window.startTime);
  const rawEnd = parseClock(window.endTime);
  const end = rawEnd <= start ? rawEnd + 24 * 60 : rawEnd;
  const arrival = parseClock(arrivalTime);
  const windowLength = end - start;

  return {
    status: 'known',
    remaining: end - arrival,
    overflow: arrival > end,
    arrivalFraction: windowLength > 0 ? (arrival - start) / windowLength : 0,
  };
}

export function formatDuration(minutes: number): string {
  const absMinutes = Math.abs(minutes);
  if (absMinutes < 60) {
    return `${absMinutes} min`;
  }
  const hours = Math.floor(absMinutes / 60);
  const remainder = absMinutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}
