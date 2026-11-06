import {
  collapseLocalDuplicates,
  hasSufficientLocalCoverage,
  mergeNearbyPlaces,
  sortByDistance,
  type PlaceIdLink,
} from './merge-nearby-places';
import { isExcludedByName } from './name-filter';
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

/** Which of these Google Place IDs are on PrayerStop's blocklist (non-mosques Google mislabels as mosques). */
export interface BlockedPlaceSource {
  findBlocked(googlePlaceIds: string[]): Promise<{ status: 'ok'; blocked: Set<string> } | { status: 'error'; message: string }>;
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
  /** Google results dropped because their Place ID is on the blocklist. */
  blockedRemoved: number;
  /** Google results dropped because their name says it's a home ("… House", "… Residence"; see `isExcludedByName`). */
  nameExcludedRemoved: number;
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
  /** null when Supabase isn't configured — Google results are then not checked against the blocklist. */
  blocklist: BlockedPlaceSource | null;
  /** null when no server-only Supabase key is configured — matches are still used in the response, just not saved. */
  linkWriter: PlaceIdLinkWriter | null;
  config: Pick<
    NearbySearchConfig,
    | 'minLocalResults'
    | 'localSufficiencyRadiusMeters'
    | 'matchDistanceMeters'
    | 'minNameSimilarity'
    | 'sameBuildingDistanceMeters'
    | 'strongNameMatchDistanceMeters'
    | 'strongNameSimilarity'
    | 'maxResults'
    | 'excludedNameWords'
    | 'mosqueNameWords'
  >;
}

/**
 * Database-first nearby search — the server side of `/api/nearby-places`.
 *
 * 1. Query verified local mosques within the radius (one Supabase call),
 *    collapsing any two records that are clearly the same mosque.
 * 2. If local coverage is sufficient (`hasSufficientLocalCoverage`), return
 *    them — Google is NOT called.
 * 3. Otherwise call Google Places once, drop homes by name ("… House",
 *    "… Residence"), blocklisted non-mosques and Google results that
 *    duplicate a local record, save confident Place ID
 *    matches, and return one nearest-first list.
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

  const baseMeta = {
    localStatus,
    localCount: local.length,
    localDuplicatesCollapsed,
    duplicatesRemoved: 0,
    linksProposed: 0,
    blockedRemoved: 0,
    nameExcludedRemoved: 0,
  };
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

  // Name filter first: it needs no lookup, and a dropped home never
  // reaches the blocklist query, de-duplication, Place ID linking or Routes.
  const namedPlaces = googleResult.places.filter((place) => !isExcludedByName(place.name, config));
  const nameExcludedRemoved = googleResult.places.length - namedPlaces.length;
  const { places: googlePlaces, blockedRemoved } = await removeBlocked(namedPlaces, deps.blocklist);
  const merged = mergeNearbyPlaces(origin, local, googlePlaces, config);
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
      blockedRemoved,
      nameExcludedRemoved,
    },
  };
}

/**
 * Drops Google results whose Place ID is on the blocklist, before
 * de-duplication and Place ID matching — so a blocked place can never be
 * shown, sent to Routes, or linked to a local record. Fails open: if the
 * blocklist can't be read, results are returned unfiltered rather than
 * failing the whole search.
 */
async function removeBlocked(
  places: PrayerPlaceCandidate[],
  blocklist: BlockedPlaceSource | null
): Promise<{ places: PrayerPlaceCandidate[]; blockedRemoved: number }> {
  const ids = places.map((place) => place.googlePlaceId).filter((id): id is string => !!id);
  if (!blocklist || ids.length === 0) return { places, blockedRemoved: 0 };

  const result = await blocklist.findBlocked(ids);
  if (result.status === 'error') {
    console.error('[nearby-places] blocklist lookup failed, returning Google results unfiltered:', result.message);
    return { places, blockedRemoved: 0 };
  }
  const kept = places.filter((place) => !place.googlePlaceId || !result.blocked.has(place.googlePlaceId));
  return { places: kept, blockedRemoved: places.length - kept.length };
}
