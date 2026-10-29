import {
  collapseLocalDuplicates,
  hasSufficientLocalCoverage,
  mergeNearbyPlaces,
  sortByDistance,
  type PlaceIdLink,
} from './merge-nearby-places';
import type { NearbySearchConfig } from './nearby-search-config';
import type { NearbySearchRequest } from './validate-nearby-request';
import type { GeoCoordinates, PrayerPlaceCandidate } from './types';

export type PlaceSourceResult =
  | { status: 'ok'; places: PrayerPlaceCandidate[] }
  | { status: 'error'; message: string };

/** Verified mosques from PrayerStop's own database (Supabase `nearby_verified_mosques()`). */
export interface LocalMosqueSource {
  findVerifiedNearby(origin: GeoCoordinates, radiusMeters: number, limit: number): Promise<PlaceSourceResult>;
}

/** Google Places Nearby Search — the metered fallback. */
export interface GooglePlacesSource {
  searchNearby(origin: GeoCoordinates, radiusMeters: number, maxResults: number): Promise<PlaceSourceResult>;
}

/** Persists confident Google Place ID matches. Must never throw — a failed save must not fail the search. */
export interface PlaceIdLinkWriter {
  saveLinks(links: PlaceIdLink[]): Promise<void>;
}

export interface NearbySearchMeta {
  localStatus: 'ok' | 'error' | 'not_configured';
  localCount: number;
  /** Local records hidden because another verified record is the same mosque (see `collapseLocalDuplicates`). */
  localDuplicatesCollapsed: number;
  googleStatus: 'not_needed' | 'ok' | 'error' | 'not_configured';
  duplicatesRemoved: number;
  linksProposed: number;
}

export type FindNearbyPlacesResult =
  | { status: 'ok'; places: PrayerPlaceCandidate[]; meta: NearbySearchMeta }
  | { status: 'error'; httpStatus: number; message: string };

export interface FindNearbyPlacesDeps {
  /** null when Supabase isn't configured on this server — the search runs Google-only. */
  local: LocalMosqueSource | null;
  /** null when GOOGLE_PLACES_API_KEY isn't configured. */
  google: GooglePlacesSource | null;
  /** null when no server-only Supabase key is configured — matches are still used in the response, just not saved. */
  linkWriter: PlaceIdLinkWriter | null;
  config: Pick<
    NearbySearchConfig,
    | 'minLocalResults'
    | 'localSufficiencyRadiusMeters'
    | 'matchDistanceMeters'
    | 'minNameSimilarity'
    | 'sameBuildingDistanceMeters'
    | 'maxResults'
  >;
}

/**
 * Database-first nearby search — the server side of `/api/nearby-places`.
 *
 * 1. Query verified local mosques within the radius (one Supabase call),
 *    collapsing any two records that are clearly the same mosque.
 * 2. If local coverage is sufficient (`hasSufficientLocalCoverage`), return
 *    them — Google is NOT called.
 * 3. Otherwise call Google Places once, drop Google results that duplicate a
 *    local record, save confident Place ID matches, and return one
 *    nearest-first list.
 *
 * So a search makes at most ONE Google Places request, and zero when local
 * coverage is good. Degrades rather than fails: if the database is down, it
 * behaves like the old Google-only search; if Google is down or
 * unconfigured, it returns whatever local results exist.
 */
export async function findNearbyPlaces(
  request: NearbySearchRequest,
  deps: FindNearbyPlacesDeps
): Promise<FindNearbyPlacesResult> {
  const { origin, radiusMeters, maxResults } = request;
  const config = { ...deps.config, maxResults: Math.min(maxResults, deps.config.maxResults) };

  let local: PrayerPlaceCandidate[] = [];
  let localStatus: NearbySearchMeta['localStatus'] = 'not_configured';
  let localDuplicatesCollapsed = 0;
  if (deps.local) {
    const localResult = await deps.local.findVerifiedNearby(origin, radiusMeters, config.maxResults);
    if (localResult.status === 'ok') {
      // Collapse before the sufficiency check, so two records of the same
      // mosque can't count twice toward "enough local coverage".
      const collapsedResult = collapseLocalDuplicates(localResult.places, config);
      local = collapsedResult.places;
      localDuplicatesCollapsed = collapsedResult.collapsed;
      localStatus = 'ok';
    } else {
      console.error('[nearby-places] local mosque lookup failed, falling back to Google only:', localResult.message);
      localStatus = 'error';
    }
  }

  const baseMeta = { localStatus, localCount: local.length, localDuplicatesCollapsed, duplicatesRemoved: 0, linksProposed: 0 };
  const localOnly = (googleStatus: NearbySearchMeta['googleStatus']): FindNearbyPlacesResult => ({
    status: 'ok',
    places: sortByDistance(local, origin).slice(0, config.maxResults),
    meta: { ...baseMeta, googleStatus },
  });

  if (localStatus === 'ok' && hasSufficientLocalCoverage(local, origin, config)) {
    return localOnly('not_needed');
  }

  if (!deps.google) {
    if (local.length > 0) return localOnly('not_configured');
    return {
      status: 'error',
      httpStatus: 503,
      message: 'Nearby place search is not configured on the server (missing GOOGLE_PLACES_API_KEY).',
    };
  }

  const googleResult = await deps.google.searchNearby(origin, radiusMeters, config.maxResults);
  if (googleResult.status === 'error') {
    if (local.length > 0) return localOnly('error');
    return { status: 'error', httpStatus: 502, message: googleResult.message };
  }

  const merged = mergeNearbyPlaces(origin, local, googleResult.places, config);
  if (merged.links.length > 0 && deps.linkWriter) {
    await deps.linkWriter.saveLinks(merged.links);
  }

  return {
    status: 'ok',
    places: merged.places,
    meta: {
      ...baseMeta,
      googleStatus: 'ok',
      duplicatesRemoved: merged.duplicatesRemoved,
      linksProposed: merged.links.length,
    },
  };
}
