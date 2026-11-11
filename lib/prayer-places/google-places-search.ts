// Server-side only — imported solely by app/api/nearby-places+api.ts. Talks
// to Google Places directly with the server's API key; never import this
// from client code.
//
// Verified against Google's current Places API (New) docs (2026) — see
// docs/06-data-and-api-plan.md for endpoint/pricing/field details.

import { buildNearbyPlacesRequestBody } from './build-nearby-places-request';
import type { GooglePlacesSource, PlaceSourceResult } from './find-nearby-places';
import { normalizeNearbyPlacesResponse, type RawNearbyPlace } from './normalize-nearby-places';
import { createQuotaBreaker, GOOGLE_QUOTA_COOLDOWN_MS, isQuotaExceededResponse } from '../quota-breaker';
import type { GeoCoordinates } from './types';

// One breaker for the whole process, shared by every request this server
// handles — see lib/quota-breaker.ts for why a module-level instance (not
// one per searchNearby call) is what makes the cooldown actually work.
const placesQuotaBreaker = createQuotaBreaker({ cooldownMs: GOOGLE_QUOTA_COOLDOWN_MS });

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
  fetchImpl: typeof fetch = fetch,
  breaker: ReturnType<typeof createQuotaBreaker> = placesQuotaBreaker
): GooglePlacesSource {
  return {
    async searchNearby(origin: GeoCoordinates, radiusMeters: number, maxResults: number): Promise<PlaceSourceResult> {
      // A previous call already learned the daily quota is exhausted —
      // don't pay the latency of another doomed request, go straight to
      // the caller's local/degraded fallback (see find-nearby-places.ts).
      if (breaker.isInCooldown()) {
        return {
          status: 'error',
          message: `Google Places is cooling down after a quota error (retry in ~${Math.ceil(breaker.remainingMs() / 60_000)} min).`,
        };
      }

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
        const body = await response.text();
        if (isQuotaExceededResponse(response.status, body)) {
          breaker.recordExceeded();
          console.error(
            '[nearby-places] Google Places quota exceeded — cooling down for',
            GOOGLE_QUOTA_COOLDOWN_MS / 60_000,
            'min:',
            response.status,
            body
          );
          return { status: 'error', message: 'The places service has reached its quota for now.' };
        }
        console.error('[nearby-places] Google Places request failed:', response.status, body);
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
