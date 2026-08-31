// Server-side only (Expo Router API route) — this is the ONE place in the
// codebase that talks to Google Routes directly and the ONE place that
// reads GOOGLE_ROUTES_API_KEY. The client never sees this key; it calls
// this route instead (see lib/prayer-places/google-route-matrix-repository.ts).
//
// Verified against Google's current Routes API (New) docs (2026) — see
// docs/06-data-and-api-plan.md for endpoint/pricing/field details.

import { normalizeRouteMatrixResponse, type RawRouteMatrixElement } from '@/lib/prayer-places/normalize-route-matrix';
import { MAX_ROUTE_MATRIX_DESTINATIONS, type TravelTimeDestination } from '@/lib/prayer-places/travel-time-repository';

const GOOGLE_ROUTE_MATRIX_ENDPOINT = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';
const FIELD_MASK = 'originIndex,destinationIndex,duration,distanceMeters,condition,status';
const REQUEST_TIMEOUT_MS = 8000;

interface RequestBody {
  origin?: { latitude?: number; longitude?: number };
  destinations?: { placeId?: string; coordinates?: { latitude?: number; longitude?: number } }[];
}

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const origin = body.origin;
  if (!origin || typeof origin.latitude !== 'number' || typeof origin.longitude !== 'number') {
    return Response.json({ error: 'origin.latitude and origin.longitude are required.' }, { status: 400 });
  }

  const rawDestinations = Array.isArray(body.destinations) ? body.destinations : [];
  const destinations: TravelTimeDestination[] = rawDestinations
    // Server-side safety cap mirroring the client's own limit — never trust
    // the caller alone to respect the "top few candidates only" rule.
    .slice(0, MAX_ROUTE_MATRIX_DESTINATIONS)
    .filter(
      (d): d is { placeId: string; coordinates: { latitude: number; longitude: number } } =>
        typeof d.placeId === 'string' &&
        typeof d.coordinates?.latitude === 'number' &&
        typeof d.coordinates?.longitude === 'number'
    )
    .map((d) => ({ placeId: d.placeId, coordinates: d.coordinates }));

  if (destinations.length === 0) {
    return Response.json({ error: 'At least one valid destination is required.' }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_ROUTES_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'Travel-time lookup is not configured on the server (missing GOOGLE_ROUTES_API_KEY).' },
      { status: 503 }
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let googleResponse: Response;
  try {
    googleResponse = await fetch(GOOGLE_ROUTE_MATRIX_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify({
        origins: [{ waypoint: { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } } }],
        destinations: destinations.map((d) => ({
          waypoint: { location: { latLng: { latitude: d.coordinates.latitude, longitude: d.coordinates.longitude } } },
        })),
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return Response.json({ error: 'The travel-time service took too long to respond.' }, { status: 504 });
    }
    console.error('[route-matrix] could not reach Google Routes:', error);
    return Response.json({ error: 'Could not reach the travel-time service.' }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }

  if (!googleResponse.ok) {
    const errorBody = await googleResponse.text();
    console.error('[route-matrix] Google Routes request failed:', googleResponse.status, errorBody);
    return Response.json({ error: 'The travel-time service is temporarily unavailable.' }, { status: 502 });
  }

  let elements: unknown;
  try {
    elements = await googleResponse.json();
  } catch (error) {
    console.error('[route-matrix] could not parse Google Routes response:', error);
    return Response.json({ error: 'The travel-time service returned an unreadable response.' }, { status: 502 });
  }

  if (!Array.isArray(elements)) {
    console.error('[route-matrix] unexpected Google Routes response shape:', elements);
    return Response.json({ error: 'The travel-time service returned an unexpected response shape.' }, { status: 502 });
  }

  const results = normalizeRouteMatrixResponse(elements as RawRouteMatrixElement[], destinations);
  return Response.json({ results });
}
