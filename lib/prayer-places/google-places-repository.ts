import { NEARBY_PLACES_MAX_RESULT_COUNT } from './build-nearby-places-request';
import type { GeoCoordinates, PrayerPlaceCandidate } from './types';
import type { NearbyPlacesOptions, NearbyPlacesResult, PrayerPlaceRepository } from './prayer-place-repository';

interface NearbyPlacesApiResponse {
  places?: PrayerPlaceCandidate[];
  error?: string;
}

/**
 * Calls PrayerStop's own server-side API route (app/api/nearby-places+api.ts)
 * — never Google directly. The Google API key lives only on that server
 * route; this client-side module never sees it, so it can't end up in the
 * mobile bundle. See docs/06-data-and-api-plan.md for the verified Google
 * Places (New) details this route is built against.
 */
export class GooglePlacesRepository implements PrayerPlaceRepository {
  async findNearby(origin: GeoCoordinates, options: NearbyPlacesOptions): Promise<NearbyPlacesResult> {
    const params = new URLSearchParams({
      latitude: String(origin.latitude),
      longitude: String(origin.longitude),
      radius: String(options.radiusMeters),
      maxResults: String(options.maxResults),
    });

    let response: Response;
    try {
      response = await fetch(`/api/nearby-places?${params.toString()}`);
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Could not reach the places service.',
      };
    }

    let body: NearbyPlacesApiResponse;
    try {
      body = await response.json();
    } catch {
      return { status: 'error', message: 'The places service returned an unreadable response.' };
    }

    if (!response.ok) {
      return { status: 'error', message: body.error ?? `Request failed (${response.status}).` };
    }
    if (!Array.isArray(body.places)) {
      return { status: 'error', message: 'Unexpected response shape from the places service.' };
    }

    return { status: 'ok', places: body.places };
  }
}

export const googlePlacesRepository: PrayerPlaceRepository = new GooglePlacesRepository();

export const DEFAULT_NEARBY_OPTIONS: NearbyPlacesOptions = {
  radiusMeters: 5000,
  maxResults: NEARBY_PLACES_MAX_RESULT_COUNT,
};
