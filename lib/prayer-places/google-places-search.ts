// Server-side only — imported solely by app/api/nearby-places+api.ts. Talks
// to Google Places directly with the server's API key; never import this
// from client code.
//
// Verified against Google's current Places API (New) docs (2026) — see
// docs/06-data-and-api-plan.md for endpoint/pricing/field details.

import { buildNearbyPlacesRequestBody } from './build-nearby-places-request';
import type { GooglePlacesSource, PlaceSourceResult } from './find-nearby-places';
import { normalizeNearbyPlacesResponse, type RawNearbyPlace } from './normalize-nearby-places';
import type { GeoCoordinates } from './types';

const GOOGLE_PLACES_ENDPOINT = 'https://places.googleapis.com/v1/places:searchNearby';
// Only the fields the app actually uses. Unchanged from Phase 3–5: no
// photos, ratings, opening hours, or other higher-tier fields.
export const GOOGLE_PLACES_FIELD_MASK =
  'places.id,places.displayName,places.location,places.formattedAddress,places.shortFormattedAddress,places.businessStatus';

interface GoogleSearchNearbyResponse {
  places?: RawNearbyPlace[];
}

export function createGooglePlacesSource(
  apiKey: string,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch
): GooglePlacesSource {
  return {
    async searchNearby(origin: GeoCoordinates, radiusMeters: number, maxResults: number): Promise<PlaceSourceResult> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await fetchImpl(GOOGLE_PLACES_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': GOOGLE_PLACES_FIELD_MASK,
          },
          body: JSON.stringify(buildNearbyPlacesRequestBody(origin, radiusMeters, maxResults)),
          signal: controller.signal,
        });
      } catch (error) {
        console.error('[nearby-places] could not reach Google Places:', error);
        return { status: 'error', message: 'Could not reach the places service.' };
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        console.error('[nearby-places] Google Places request failed:', response.status, await response.text());
        return { status: 'error', message: 'The places service is temporarily unavailable.' };
      }

      let data: GoogleSearchNearbyResponse;
      try {
        data = await response.json();
      } catch (error) {
        console.error('[nearby-places] could not parse Google Places response:', error);
        return { status: 'error', message: 'The places service returned an unreadable response.' };
      }

      return { status: 'ok', places: normalizeNearbyPlacesResponse(data.places ?? []) };
    },
  };
}
