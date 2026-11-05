// Server-side only (Expo Router API route). The ONE place that reads
// GOOGLE_PLACES_API_KEY and the Supabase server keys. The client never sees
// any of them; it calls this route instead (see
// lib/prayer-places/nearby-places-api-repository.ts).
//
// Database-first: verified local mosques come from Supabase; Google Places
// is called at most once, and only when local coverage is insufficient. See
// lib/prayer-places/find-nearby-places.ts for the full flow and
// lib/prayer-places/nearby-search-config.ts for every threshold.

import { findNearbyPlaces } from '@/lib/prayer-places/find-nearby-places';
import { createGooglePlacesSource } from '@/lib/prayer-places/google-places-search';
import { NEARBY_SEARCH_CONFIG } from '@/lib/prayer-places/nearby-search-config';
import {
  createSupabaseBlocklistSource,
  createSupabaseMosqueSource,
  createSupabasePlaceIdLinkWriter,
} from '@/lib/prayer-places/supabase-mosque-source';
import { validateNearbyRequest } from '@/lib/prayer-places/validate-nearby-request';
import { createRateLimiter, rateLimitResponse } from '@/lib/rate-limit';

// The app fetches once per session (first load, >500 m move, or manual
// refresh), so this is generous for real use and cheap insurance against abuse.
const checkRateLimit = createRateLimiter({ limit: 30, windowMs: 60_000 });

export async function GET(request: Request) {
  const limited = rateLimitResponse(checkRateLimit, request);
  if (limited) return limited;

  const validation = validateNearbyRequest(new URL(request.url).searchParams, NEARBY_SEARCH_CONFIG);
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
  const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;

  const result = await findNearbyPlaces(validation.request, {
    local:
      supabaseUrl && supabasePublishableKey
        ? createSupabaseMosqueSource(supabaseUrl, supabasePublishableKey, NEARBY_SEARCH_CONFIG.databaseTimeoutMs)
        : null,
    google: googleApiKey ? createGooglePlacesSource(googleApiKey, NEARBY_SEARCH_CONFIG.googleTimeoutMs) : null,
    blocklist:
      supabaseUrl && supabasePublishableKey
        ? createSupabaseBlocklistSource(supabaseUrl, supabasePublishableKey, NEARBY_SEARCH_CONFIG.databaseTimeoutMs)
        : null,
    linkWriter:
      supabaseUrl && supabaseSecretKey
        ? createSupabasePlaceIdLinkWriter(supabaseUrl, supabaseSecretKey, NEARBY_SEARCH_CONFIG.databaseTimeoutMs)
        : null,
    config: NEARBY_SEARCH_CONFIG,
  });

  if (result.status === 'error') {
    return Response.json({ error: result.message }, { status: result.httpStatus });
  }
  return Response.json({ places: result.places, meta: result.meta });
}
