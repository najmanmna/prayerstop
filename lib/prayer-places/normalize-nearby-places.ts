import type { PrayerPlaceCandidate } from './types';

/** The shape of one place in Google's raw Nearby Search (New) response. */
export interface RawNearbyPlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  shortFormattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  businessStatus?: string;
}

/**
 * Normalizes Google's raw Nearby Search (New) results into our own
 * `PrayerPlaceCandidate[]`, run before any local distance ranking or
 * candidate-limit selection.
 *
 * Drops any place explicitly marked `CLOSED_TEMPORARILY` — PrayerStop must
 * never recommend or send a temporarily closed place to the Routes stage
 * (a wasted, metered Routes call to a place nobody can currently visit). A
 * place with no `businessStatus` at all (Google simply didn't return one)
 * is kept: missing data is not evidence of closure — see the "distinguish
 * known from unknown" rule in CLAUDE.md.
 *
 * Deliberately does NOT look at opening hours / `currentOpeningHours` at
 * all. Ordinary open/closed-now status is not the same as guaranteed
 * prayer accessibility (mosque closing time, Jama'ah timing) — that
 * remains an unresolved data limitation, not something to infer here. See
 * the standing constraint in docs/06-data-and-api-plan.md.
 */
export function normalizeNearbyPlacesResponse(places: RawNearbyPlace[]): PrayerPlaceCandidate[] {
  return places
    .filter((place) => place.businessStatus !== 'CLOSED_TEMPORARILY')
    .filter(
      (place): place is RawNearbyPlace & { location: { latitude: number; longitude: number } } =>
        typeof place.location?.latitude === 'number' && typeof place.location?.longitude === 'number'
    )
    .map((place) => ({
      id: place.id ?? `${place.location.latitude},${place.location.longitude}`,
      name: place.displayName?.text ?? 'Unnamed place',
      area: place.shortFormattedAddress ?? place.formattedAddress ?? '',
      coordinates: { latitude: place.location.latitude, longitude: place.location.longitude },
    }));
}
