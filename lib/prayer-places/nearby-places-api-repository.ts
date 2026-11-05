import { NEARBY_SEARCH_CONFIG } from './nearby-search-config';
import type { GeoCoordinates, PrayerPlaceCandidate } from './types';
import type { NearbyPlacesOptions, NearbyPlacesResult, PrayerPlaceRepository } from './prayer-place-repository';

interface NearbyPlacesApiResponse {
  places?: PrayerPlaceCandidate[];
  error?: string;
}

/**
 * Calls PrayerStop's own server-side API route (app/api/nearby-places+api.ts)
 * — never Supabase or Google directly. That route does the database-first
 * lookup with Google Places as its fallback, and holds every key; this
 * client-side module never sees any of them, so none can end up in the
 * mobile bundle. Results arrive already merged, de-duplicated, and in the
 * unified place format (`PlaceIdentity`).
 */
export class NearbyPlacesApiRepository implements PrayerPlaceRepository {
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

export const nearbyPlacesApiRepository: PrayerPlaceRepository = new NearbyPlacesApiRepository();

export const DEFAULT_NEARBY_OPTIONS: NearbyPlacesOptions = {
  radiusMeters: NEARBY_SEARCH_CONFIG.defaultRadiusMeters,
  maxResults: NEARBY_SEARCH_CONFIG.maxResults,
};
