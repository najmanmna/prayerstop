import { distanceKm } from './geo';
import type { GeoCoordinates, PrayerPlaceCandidate } from './types';

export interface DistanceRankedCandidate extends PrayerPlaceCandidate {
  distanceKm: number;
}

/**
 * Ranks all discovered candidates by cheap straight-line distance and keeps
 * only the nearest `limit`. This is the local filter/rank step that must
 * happen before any candidate is sent to the metered, traffic-aware Google
 * Routes call — see the recommendation pipeline in docs/05-technical-architecture.md
 * and the "never call Routes for every nearby place" rule in CLAUDE.md.
 */
export function selectNearestCandidates(
  candidates: PrayerPlaceCandidate[],
  origin: GeoCoordinates,
  limit: number
): DistanceRankedCandidate[] {
  return candidates
    .map((candidate) => ({ ...candidate, distanceKm: distanceKm(origin, candidate.coordinates) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}
