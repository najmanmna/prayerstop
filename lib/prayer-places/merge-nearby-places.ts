import { distanceKm } from './geo';
import { mosqueNameSimilarity } from './name-similarity';
import type { NearbySearchConfig } from './nearby-search-config';
import type { GeoCoordinates, PrayerPlaceCandidate } from './types';

type MatchConfig = Pick<
  NearbySearchConfig,
  | 'matchDistanceMeters'
  | 'minNameSimilarity'
  | 'sameBuildingDistanceMeters'
  | 'strongNameMatchDistanceMeters'
  | 'strongNameSimilarity'
  | 'maxResults'
>;

/** A confident, unambiguous Google ↔ local match, to be persisted as `mosque_records.google_place_id`. */
export interface PlaceIdLink {
  localRecordId: string;
  googlePlaceId: string;
}

export interface MergeNearbyPlacesResult {
  /** Local + non-duplicate Google places, nearest first, capped at `maxResults`. */
  places: PrayerPlaceCandidate[];
  /** Mappings safe to save. Never includes an ambiguous match or one that would change an existing mapping. */
  links: PlaceIdLink[];
  /** Google results dropped as duplicates of a local record. */
  duplicatesRemoved: number;
}

function metersBetween(a: GeoCoordinates, b: GeoCoordinates): number {
  return distanceKm(a, b) * 1000;
}

/**
 * The fallback decision: is local coverage around `origin` good enough to
 * skip Google Places entirely? See `NEARBY_SEARCH_CONFIG` for why the
 * sufficiency radius is smaller than the search radius.
 */
export function hasSufficientLocalCoverage(
  local: PrayerPlaceCandidate[],
  origin: GeoCoordinates,
  config: Pick<NearbySearchConfig, 'minLocalResults' | 'localSufficiencyRadiusMeters'>
): boolean {
  const nearby = local.filter(
    (place) => metersBetween(origin, place.coordinates) <= config.localSufficiencyRadiusMeters
  );
  return nearby.length >= config.minLocalResults;
}

/** Nearest first; ties broken by preferring verified local records, then by ID, so ordering is deterministic. */
export function sortByDistance(places: PrayerPlaceCandidate[], origin: GeoCoordinates): PrayerPlaceCandidate[] {
  return places
    .map((place) => ({ place, meters: metersBetween(origin, place.coordinates) }))
    .sort((a, b) => {
      if (a.meters !== b.meters) return a.meters - b.meters;
      if (a.place.source !== b.place.source) return a.place.source === 'database' ? -1 : 1;
      return a.place.id < b.place.id ? -1 : a.place.id > b.place.id ? 1 : 0;
    })
    .map(({ place }) => place);
}

const SOURCE_PRIORITY: Record<string, number> = { nsdi: 0, dmrca: 1, osm: 2 };

function localPreference(place: PrayerPlaceCandidate): [number, number, string] {
  const prefix = place.localRecordId?.split('-')[0] ?? '';
  return [place.googlePlaceId ? 0 : 1, SOURCE_PRIORITY[prefix] ?? 9, place.localRecordId ?? place.id];
}

function comparePreference(a: PrayerPlaceCandidate, b: PrayerPlaceCandidate): number {
  const [pa, pb] = [localPreference(a), localPreference(b)];
  if (pa[0] !== pb[0]) return pa[0] - pb[0];
  if (pa[1] !== pb[1]) return pa[1] - pb[1];
  return pa[2] < pb[2] ? -1 : pa[2] > pb[2] ? 1 : 0;
}

/**
 * Display-only safety net for duplicates INSIDE our own verified data (the
 * same mosque imported from two sources, e.g. NSDI + DMRCA, both verified).
 * Uses the same "same mosque" rule as Google de-duplication: within
 * `matchDistanceMeters` with a similar name, or within
 * `sameBuildingDistanceMeters` regardless of name. Keeps the record with a
 * Google Place ID, then by source (nsdi > dmrca > osm, matching the review
 * pipeline's survivor rule), then by ID.
 *
 * Never changes the database — the real fix is confirming the pair in the
 * review app's duplicate queue, after which the database stops returning it.
 */
export function collapseLocalDuplicates(
  places: PrayerPlaceCandidate[],
  config: Pick<NearbySearchConfig, 'matchDistanceMeters' | 'minNameSimilarity' | 'sameBuildingDistanceMeters'>
): { places: PrayerPlaceCandidate[]; collapsed: number } {
  const kept: PrayerPlaceCandidate[] = [];
  for (const place of [...places].sort(comparePreference)) {
    const isDuplicate = kept.some((existing) => {
      const meters = metersBetween(existing.coordinates, place.coordinates);
      if (meters <= config.sameBuildingDistanceMeters) return true;
      return meters <= config.matchDistanceMeters && mosqueNameSimilarity(existing.name, place.name) >= config.minNameSimilarity;
    });
    if (!isDuplicate) kept.push(place);
  }
  return { places: kept, collapsed: places.length - kept.length };
}

/**
 * Merges Google fallback results into verified local results:
 *
 * - **De-duplication.** A Google result is dropped (the local record is
 *   kept) when it's the same mosque as a local record: same Google Place
 *   ID as an existing mapping, OR within `matchDistanceMeters` with a
 *   similar name, OR within `strongNameMatchDistanceMeters` with a strongly
 *   matching name, OR within `sameBuildingDistanceMeters` regardless of
 *   name.
 * - **Place ID matching.** A mapping is proposed only when a Google result
 *   name-matches exactly ONE local record within `matchDistanceMeters`,
 *   that record has no Place ID yet, and no other Google result in this
 *   response also name-matches the same record. Anything else is
 *   ambiguous and is never saved automatically. (The database function
 *   applies its own independent checks on top — see migration 0009.)
 *
 * A newly matched local record carries its Google Place ID in this
 * response immediately (so "View on Google Maps" can use it), whether or
 * not the save later succeeds.
 */
export function mergeNearbyPlaces(
  origin: GeoCoordinates,
  local: PrayerPlaceCandidate[],
  google: PrayerPlaceCandidate[],
  config: MatchConfig
): MergeNearbyPlacesResult {
  const knownPlaceIds = new Set(local.map((place) => place.googlePlaceId).filter((id): id is string => !!id));

  const keptGoogle: PrayerPlaceCandidate[] = [];
  // local record ID → every distinct Google Place ID that name-matched it
  const proposals = new Map<string, Set<string>>();
  let duplicatesRemoved = 0;

  for (const candidate of google) {
    if (candidate.googlePlaceId && knownPlaceIds.has(candidate.googlePlaceId)) {
      duplicatesRemoved++;
      continue;
    }

    const searchRadius = Math.max(config.matchDistanceMeters, config.strongNameMatchDistanceMeters);
    const nearbyLocal = local
      .map((place) => ({
        place,
        meters: metersBetween(candidate.coordinates, place.coordinates),
        similarity: mosqueNameSimilarity(candidate.name, place.name),
      }))
      .filter(({ meters }) => meters <= searchRadius);
    const nameMatches = nearbyLocal.filter(
      ({ meters, similarity }) => meters <= config.matchDistanceMeters && similarity >= config.minNameSimilarity
    );
    const strongNameMatch = nearbyLocal.some(
      ({ meters, similarity }) => meters <= config.strongNameMatchDistanceMeters && similarity >= config.strongNameSimilarity
    );
    const sameBuilding = nearbyLocal.some(({ meters }) => meters <= config.sameBuildingDistanceMeters);

    if (nameMatches.length === 0 && !strongNameMatch && !sameBuilding) {
      keptGoogle.push(candidate);
      continue;
    }

    duplicatesRemoved++;
    if (nameMatches.length === 1 && candidate.googlePlaceId) {
      const recordId = nameMatches[0].place.localRecordId;
      if (recordId) {
        const ids = proposals.get(recordId) ?? new Set<string>();
        ids.add(candidate.googlePlaceId);
        proposals.set(recordId, ids);
      }
    }
  }

  const links: PlaceIdLink[] = [];
  for (const [localRecordId, ids] of proposals) {
    if (ids.size !== 1) continue; // two Google listings both claim this record — ambiguous
    const record = local.find((place) => place.localRecordId === localRecordId);
    if (!record || record.googlePlaceId) continue; // never overwrite an existing mapping
    links.push({ localRecordId, googlePlaceId: [...ids][0] });
  }

  const linkedPlaceIds = new Map(links.map((link) => [link.localRecordId, link.googlePlaceId]));
  const enrichedLocal = local.map((place) => {
    const linked = place.localRecordId ? linkedPlaceIds.get(place.localRecordId) : undefined;
    return linked ? { ...place, googlePlaceId: linked } : place;
  });

  return {
    places: sortByDistance([...enrichedLocal, ...keptGoogle], origin).slice(0, config.maxResults),
    links,
    duplicatesRemoved,
  };
}
