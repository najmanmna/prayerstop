// Server-side only — imported solely by app/api/nearby-places+api.ts.
// Calls the Supabase functions added in migrations 0009/0010 over PostgREST
// with plain fetch (no supabase-js dependency needed for a few RPC calls).

import type { BlockedPlaceSource, LocalMosqueSource, PlaceIdLinkWriter, PlaceSourceResult } from './find-nearby-places';
import type { PlaceIdLink } from './merge-nearby-places';
import { normalizeDatabaseMosques, type RawDatabaseMosque } from './normalize-database-mosques';
import type { GeoCoordinates } from './types';

async function callRpc(
  baseUrl: string,
  apiKey: string,
  fn: string,
  args: Record<string, unknown>,
  timeoutMs: number,
  fetchImpl: typeof fetch
): Promise<{ ok: true; body: unknown } | { ok: false; message: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      // `apikey` alone selects the role: the publishable key → anon, the
      // secret key → service_role. Both are new-style (sb_publishable_/
      // sb_secret_) keys, which are not JWTs and don't go in Authorization.
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify(args),
      signal: controller.signal,
    });
    if (!response.ok) {
      return { ok: false, message: `${fn} failed (${response.status}): ${await response.text()}` };
    }
    return { ok: true, body: await response.json() };
  } catch (error) {
    return { ok: false, message: `${fn} unreachable: ${error instanceof Error ? error.message : String(error)}` };
  } finally {
    clearTimeout(timeout);
  }
}

/** Reads verified mosques via `nearby_verified_mosques()` using the publishable (anon) key. */
export function createSupabaseMosqueSource(
  baseUrl: string,
  publishableKey: string,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch
): LocalMosqueSource {
  return {
    async findVerifiedNearby(origin: GeoCoordinates, radiusMeters: number, limit: number): Promise<PlaceSourceResult> {
      const result = await callRpc(
        baseUrl,
        publishableKey,
        'nearby_verified_mosques',
        { p_latitude: origin.latitude, p_longitude: origin.longitude, p_radius_m: radiusMeters, p_limit: limit },
        timeoutMs,
        fetchImpl
      );
      if (!result.ok) return { status: 'error', message: result.message };
      if (!Array.isArray(result.body)) return { status: 'error', message: 'nearby_verified_mosques returned a non-array' };
      return { status: 'ok', places: normalizeDatabaseMosques(result.body as RawDatabaseMosque[]) };
    },
  };
}

/** Checks Google Place IDs against the blocklist via `blocked_google_place_ids()` (migration 0010), publishable key. */
export function createSupabaseBlocklistSource(
  baseUrl: string,
  publishableKey: string,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch
): BlockedPlaceSource {
  return {
    async findBlocked(googlePlaceIds: string[]) {
      const result = await callRpc(
        baseUrl,
        publishableKey,
        'blocked_google_place_ids',
        { p_ids: googlePlaceIds },
        timeoutMs,
        fetchImpl
      );
      if (!result.ok) return { status: 'error' as const, message: result.message };
      if (!Array.isArray(result.body)) return { status: 'error' as const, message: 'blocked_google_place_ids returned a non-array' };
      // A `returns setof text` function comes back from PostgREST as a plain JSON array of strings.
      return { status: 'ok' as const, blocked: new Set(result.body.filter((id): id is string => typeof id === 'string')) };
    },
  };
}

/**
 * Saves Place ID matches via `link_google_place_ids()`, which only the
 * server-only secret key may call. The function itself refuses to
 * overwrite or duplicate a mapping. Never throws: a failed save is logged
 * and the search response is unaffected.
 */
export function createSupabasePlaceIdLinkWriter(
  baseUrl: string,
  secretKey: string,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch
): PlaceIdLinkWriter {
  return {
    async saveLinks(links: PlaceIdLink[]): Promise<void> {
      const result = await callRpc(
        baseUrl,
        secretKey,
        'link_google_place_ids',
        { p_links: links.map((link) => ({ mosque_id: link.localRecordId, google_place_id: link.googlePlaceId })) },
        timeoutMs,
        fetchImpl
      );
      if (!result.ok) {
        console.error('[nearby-places] could not save Google Place ID links:', result.message);
        return;
      }
      if (!Array.isArray(result.body)) {
        console.error('[nearby-places] link_google_place_ids returned a non-array');
        return;
      }
      const notLinked = (result.body as { outcome?: string }[]).filter(
        (row) => row.outcome !== 'linked' && row.outcome !== 'already_linked'
      );
      if (notLinked.length > 0) {
        console.warn('[nearby-places] some Place ID links were refused by the database:', notLinked);
      }
    },
  };
}
