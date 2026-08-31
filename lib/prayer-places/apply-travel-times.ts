import type { DistanceRankedCandidate } from './select-candidates';
import type { TravelTimeResult } from './travel-time-repository';
import type { RankedPrayerPlaceCandidate } from './types';

/**
 * Merges real Route Matrix travel-time results onto the candidates that
 * were actually sent to Routes, producing the `RankedPrayerPlaceCandidate[]`
 * the rest of the app ranks/displays. A candidate Google couldn't find a
 * route for (ROUTE_NOT_FOUND) or that failed individually is dropped
 * entirely rather than given a fabricated ETA — see the "never invent a
 * feasibility claim from data that doesn't support it" rule in CLAUDE.md.
 * Real road distance from Routes replaces the straight-line distance used
 * only for the earlier local pre-filter step.
 */
export function applyTravelTimes(
  candidates: DistanceRankedCandidate[],
  travelTimes: TravelTimeResult[]
): RankedPrayerPlaceCandidate[] {
  const byId = new Map(travelTimes.map((result) => [result.placeId, result]));

  const ranked: RankedPrayerPlaceCandidate[] = [];
  for (const candidate of candidates) {
    const travelTime = byId.get(candidate.id);
    if (!travelTime || travelTime.outcome.status !== 'ok') continue;

    ranked.push({
      id: candidate.id,
      name: candidate.name,
      area: candidate.area,
      coordinates: candidate.coordinates,
      distanceKm: travelTime.outcome.distanceMeters / 1000,
      etaMinutes: Math.max(1, Math.round(travelTime.outcome.durationSeconds / 60)),
      routeCondition: travelTime.outcome.condition,
    });
  }
  return ranked;
}
