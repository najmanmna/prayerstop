// How old a device location fix can be before it's flagged as stale to the
// user. Distinct from `SESSION_STALE_THRESHOLD_MS` in
// lib/prayer-places/session-staleness.ts, which is about how old the
// *fetched Places/Routes data* is, not the GPS fix itself. In practice this
// rarely triggers now that location refreshes automatically on foreground
// resume (see hooks/use-device-location.ts) — it mainly covers the app
// being left continuously open for a long stretch.
export const LOCATION_STALE_THRESHOLD_MS = 5 * 60 * 1000;

/** Whether a device location fix taken at `timestamp` is old enough to be worth refreshing. */
export function isLocationStale(timestamp: number, now: number): boolean {
  return now - timestamp > LOCATION_STALE_THRESHOLD_MS;
}

export type LocationNoticeKind = 'refresh-error' | 'location-stale' | 'session-stale';

export interface LocationNotice {
  kind: LocationNoticeKind;
  message: string;
}

/**
 * Resolves the *one* compact, tappable notice line Home's location row
 * shows (if any) from three otherwise-independent freshness signals — a
 * failed GPS refresh, an old GPS fix, and an old nearby-places session.
 * Deliberately a single slot with a priority order rather than stacking
 * multiple banners: a failed refresh is the most actionable/urgent (it's
 * the reason nothing has updated), followed by the GPS fix being old
 * (worth refreshing before anything else can improve), and finally the
 * fetched session being old (harmless to leave, but worth a nudge).
 */
export function resolveLocationNotice(input: {
  refreshError: string | null;
  locationStale: boolean;
  sessionStale: boolean;
}): LocationNotice | null {
  if (input.refreshError) {
    return { kind: 'refresh-error', message: "Couldn't refresh location · tap to retry" };
  }
  if (input.locationStale) {
    return { kind: 'location-stale', message: 'Location may be a few minutes old · tap to refresh' };
  }
  if (input.sessionStale) {
    return { kind: 'session-stale', message: 'Results may be a little out of date · tap to refresh' };
  }
  return null;
}
