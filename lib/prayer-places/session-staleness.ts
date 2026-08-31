import { distanceKm } from './geo';
import type { GeoCoordinates } from './types';

// How old a fetched nearby-places session can be before it's flagged as
// stale. Route ETA is genuinely time-sensitive (traffic changes), so this is
// a display/refresh-prompt signal, not a trigger for automatic background
// refetching — see the "no aggressive background refreshing" rule in
// CLAUDE.md and docs/05's "Shared nearby-places session" section.
export const SESSION_STALE_THRESHOLD_MS = 10 * 60 * 1000;

// How far the device can move from the coordinates a session was fetched
// for before that session is considered "for the wrong place" and worth
// refreshing, rather than merely old.
export const SIGNIFICANT_MOVEMENT_METERS = 500;

/** Whether `elapsedMs` since a session was fetched exceeds the staleness threshold. */
export function isSessionTimeStale(fetchedAt: number, now: number): boolean {
  return now - fetchedAt > SESSION_STALE_THRESHOLD_MS;
}

/** Whether `current` is far enough from `origin` that a session fetched for `origin` should be treated as outdated. */
export function hasMovedSignificantly(origin: GeoCoordinates, current: GeoCoordinates): boolean {
  return distanceKm(origin, current) * 1000 > SIGNIFICANT_MOVEMENT_METERS;
}
