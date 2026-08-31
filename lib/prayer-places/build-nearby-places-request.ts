import type { GeoCoordinates } from './types';

/**
 * Max candidates requested from Google Places per session (Google's own
 * maximum for Nearby Search (New) — see docs/06-data-and-api-plan.md).
 * Requesting the full 20, ranked by distance, gives our own local
 * filter/rank step (`select-candidates.ts`) a real distance-prioritized
 * pool to choose the top 3 from, rather than whatever a smaller,
 * popularity-ranked default happened to return.
 */
export const NEARBY_PLACES_MAX_RESULT_COUNT = 20;

export interface NearbyPlacesRequestBody {
  includedTypes: string[];
  maxResultCount: number;
  rankPreference: 'DISTANCE' | 'POPULARITY';
  locationRestriction: { circle: { center: GeoCoordinates; radius: number } };
  regionCode: string;
}

/**
 * Builds the exact request body sent to Google's Nearby Search (New)
 * `searchNearby` endpoint. Pure and framework-free so the request shape —
 * in particular `rankPreference: 'DISTANCE'` and the requested candidate
 * count — is directly unit-testable without mocking `fetch` or hitting the
 * live server route. `radius`/`maxResultCount` are expected to already be
 * clamped to Google's limits by the caller (`app/api/nearby-places+api.ts`).
 */
export function buildNearbyPlacesRequestBody(
  origin: GeoCoordinates,
  radius: number,
  maxResultCount: number
): NearbyPlacesRequestBody {
  return {
    includedTypes: ['mosque'],
    maxResultCount,
    // DISTANCE (not the default POPULARITY) so the up-to-20 candidates we
    // get back are the geographically nearest ones, not the most popular —
    // popularity ranking could otherwise return a smaller/skewed pool for
    // our own local top-3 filter to work from.
    rankPreference: 'DISTANCE',
    locationRestriction: {
      circle: { center: origin, radius },
    },
    regionCode: 'LK',
  };
}
