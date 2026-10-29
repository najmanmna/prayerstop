export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

/**
 * Where a place came from: PrayerStop's own verified mosque database
 * (Supabase `mosque_records`), or Google Places (the fallback when local
 * coverage is thin — see `nearby-search-config.ts`).
 */
export type PlaceSource = 'database' | 'google';

/**
 * Fields every place carries regardless of source. `id` is the app's own
 * stable, source-aware ID (`db:<record id>` / `google:<place id>`, see
 * `place-ids.ts`) — used for list keys, travel-time matching, and the
 * `/place/[id]` route. It is NOT a Google Place ID and must never be sent
 * to Google as one: use `googlePlaceId`, which is null for local records
 * that haven't been confidently matched to a Google listing yet.
 */
export interface PlaceIdentity {
  id: string;
  source: PlaceSource;
  /** The original database record ID (e.g. `nsdi-18469`, `dmrca-R-259-C-30`) for `database` places; null for `google` places. */
  localRecordId: string | null;
  googlePlaceId: string | null;
}

/** A candidate prayer place as returned by the discovery layer, before any local ranking/enrichment. */
export interface PrayerPlaceCandidate extends PlaceIdentity {
  name: string;
  area: string;
  coordinates: GeoCoordinates;
}

/** A candidate after local distance/ETA enrichment, before feasibility is computed against a specific prayer window. */
export interface RankedPrayerPlaceCandidate extends PlaceIdentity {
  name: string;
  area: string;
  coordinates: GeoCoordinates;
  distanceKm: number;
  etaMinutes: number;
  /** Google Routes' own condition for this route (always `'ROUTE_EXISTS'` today, since only 'ok' outcomes reach this type) — preserved as session data per docs/05, not currently surfaced in any UI. */
  routeCondition: string;
}
