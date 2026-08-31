import type { RankedPrayerPlaceCandidate } from './types';

/** Looks up a candidate from the current shared session by its Google Place ID. */
export function findCandidateById(
  candidates: RankedPrayerPlaceCandidate[],
  id: string
): RankedPrayerPlaceCandidate | null {
  return candidates.find((candidate) => candidate.id === id) ?? null;
}

/**
 * The in-app route to a place's Details screen, in the object form Expo
 * Router's typed routes expect for a dynamic segment (`/place/[id]`). A
 * single, tested source of truth for this destination so every "tap a
 * place" call site (Home's recommendation/alternates, Nearby's list/map)
 * navigates the same way.
 */
export function buildPlaceDetailsPath(placeId: string): { pathname: '/place/[id]'; params: { id: string } } {
  return { pathname: '/place/[id]', params: { id: placeId } };
}
