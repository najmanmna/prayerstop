import type { GeoCoordinates, PrayerPlaceCandidate } from './types';

export interface NearbyPlacesOptions {
  radiusMeters: number;
  maxResults: number;
}

export type NearbyPlacesResult =
  | { status: 'ok'; places: PrayerPlaceCandidate[] }
  | { status: 'error'; message: string };

/**
 * The data-access boundary between however prayer places are actually
 * discovered (Google Places today, possibly another provider later) and the
 * rest of the app. Ranking logic and the UI depend only on this interface —
 * never on Google Places, or any other provider, directly. Mirrors
 * `PrayerTimeRepository`'s role for ACJU data.
 */
export interface PrayerPlaceRepository {
  findNearby(origin: GeoCoordinates, options: NearbyPlacesOptions): Promise<NearbyPlacesResult>;
}
