// Server-side only (Expo Router API route) — this is the ONE place in the
// codebase that talks to Google Places directly and the ONE place that
// reads GOOGLE_PLACES_API_KEY. The client never sees this key; it calls
// this route instead (see lib/prayer-places/google-places-repository.ts).
//
// Verified against Google's current Places API (New) docs (2026) — see
// docs/06-data-and-api-plan.md for endpoint/pricing/field details.

import { buildNearbyPlacesRequestBody, NEARBY_PLACES_MAX_RESULT_COUNT } from '@/lib/prayer-places/build-nearby-places-request';
import { normalizeNearbyPlacesResponse, type RawNearbyPlace } from '@/lib/prayer-places/normalize-nearby-places';

const GOOGLE_PLACES_ENDPOINT = 'https://places.googleapis.com/v1/places:searchNearby';
const FIELD_MASK =
  'places.id,places.displayName,places.location,places.formattedAddress,places.shortFormattedAddress,places.businessStatus';

const MIN_RADIUS_METERS = 100;
const MAX_RADIUS_METERS = 50_000; // Google's own maximum for searchNearby
const MAX_RESULT_COUNT = NEARBY_PLACES_MAX_RESULT_COUNT; // Google's own maximum

interface GoogleSearchNearbyResponse {
  places?: RawNearbyPlace[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const latitude = Number(url.searchParams.get('latitude'));
  const longitude = Number(url.searchParams.get('longitude'));
  const radiusParam = Number(url.searchParams.get('radius') ?? '5000');
  const maxResultsParam = Number(url.searchParams.get('maxResults') ?? String(NEARBY_PLACES_MAX_RESULT_COUNT));

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return Response.json({ error: 'latitude and longitude query parameters are required.' }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'Nearby place search is not configured on the server (missing GOOGLE_PLACES_API_KEY).' },
      { status: 503 }
    );
  }

  const radius = clamp(Number.isFinite(radiusParam) ? radiusParam : 5000, MIN_RADIUS_METERS, MAX_RADIUS_METERS);
  const maxResultCount = clamp(
    Number.isFinite(maxResultsParam) ? Math.trunc(maxResultsParam) : NEARBY_PLACES_MAX_RESULT_COUNT,
    1,
    MAX_RESULT_COUNT
  );

  let googleResponse: Response;
  try {
    googleResponse = await fetch(GOOGLE_PLACES_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(buildNearbyPlacesRequestBody({ latitude, longitude }, radius, maxResultCount)),
    });
  } catch (error) {
    console.error('[nearby-places] could not reach Google Places:', error);
    return Response.json({ error: 'Could not reach the places service.' }, { status: 502 });
  }

  if (!googleResponse.ok) {
    const errorBody = await googleResponse.text();
    console.error('[nearby-places] Google Places request failed:', googleResponse.status, errorBody);
    return Response.json({ error: 'The places service is temporarily unavailable.' }, { status: 502 });
  }

  let data: GoogleSearchNearbyResponse;
  try {
    data = await googleResponse.json();
  } catch (error) {
    console.error('[nearby-places] could not parse Google Places response:', error);
    return Response.json({ error: 'The places service returned an unreadable response.' }, { status: 502 });
  }

  const places = normalizeNearbyPlacesResponse(data.places ?? []);

  return Response.json({ places });
}
