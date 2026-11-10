import { applyTravelTimes } from './apply-travel-times';
import { DEFAULT_NEARBY_OPTIONS } from './nearby-places-api-repository';
import type { PrayerPlaceRepository } from './prayer-place-repository';
import { selectNearestCandidates, type DistanceRankedCandidate } from './select-candidates';
import { MAX_ROUTE_MATRIX_DESTINATIONS, type TravelTimeRepository } from './travel-time-repository';
import type { GeoCoordinates, RankedPrayerPlaceCandidate } from './types';

export type FetchNearbySessionResult =
  | {
      status: 'ready';
      /** The few places sent to Google Routes, with real traffic-aware ETAs — what Home recommends from. */
      candidates: RankedPrayerPlaceCandidate[];
      /**
       * Every other place discovery found, nearest first by straight-line
       * distance only — never sent to Routes (cost rule), so they have NO
       * ETA or feasibility and must never be shown with one. For the Nearby
       * browse list.
       */
      morePlaces: DistanceRankedCandidate[];
      /**
       * True when the Routes call itself failed (outage, or the daily quota
       * cap was reached): `candidates` is then empty and EVERY place is in
       * `morePlaces`, distance only. The places are still real, so they're
       * shown by distance rather than hidden behind an error — but with no
       * ETA, no feasibility and no recommendation, since nothing supports one.
       */
      travelTimesUnavailable: boolean;
    }
  | { status: 'empty' }
  // Places were found nearby, but Google Routes couldn't compute a route to
  // any of them (e.g. all ROUTE_NOT_FOUND) — a distinct, honest state from
  // 'empty', which means no places exist at all.
  | { status: 'unreachable' }
  | { status: 'error'; message: string };

/**
 * The one place in the app that actually calls the Places and Routes
 * repositories for a nearby-search session: Places → local distance
 * pre-filter (top 3) → Routes → merge. Pure/framework-free (no React) so it
 * can be unit-tested directly and so there is exactly one code path that
 * makes these metered calls — `hooks/nearby-places-session.tsx` calls this
 * once per session and shares the result across Home/Nearby/Place Details;
 * nothing else may call `placeRepository`/`travelTimeRepository` directly
 * (see the "single session, no duplicate calls" rule in docs/05).
 */
export async function fetchNearbySession(
  coords: GeoCoordinates,
  placeRepository: PrayerPlaceRepository,
  travelTimeRepository: TravelTimeRepository
): Promise<FetchNearbySessionResult> {
  const placesResult = await placeRepository.findNearby(coords, DEFAULT_NEARBY_OPTIONS);
  if (placesResult.status === 'error') {
    return { status: 'error', message: placesResult.message };
  }
  if (placesResult.places.length === 0) {
    return { status: 'empty' };
  }

  // Local filter/rank by cheap straight-line distance BEFORE Routes — only
  // this short list is ever sent to the metered traffic-aware call.
  const nearest = selectNearestCandidates(placesResult.places, coords, MAX_ROUTE_MATRIX_DESTINATIONS);

  const travelTimeResult = await travelTimeRepository.getTravelTimes({
    origin: coords,
    destinations: nearest.map((candidate) => ({ id: candidate.id, coordinates: candidate.coordinates })),
  });
  if (travelTimeResult.status === 'error') {
    return {
      status: 'ready',
      candidates: [],
      morePlaces: selectNearestCandidates(placesResult.places, coords, placesResult.places.length),
      travelTimesUnavailable: true,
    };
  }

  const candidates = applyTravelTimes(nearest, travelTimeResult.results);
  if (candidates.length === 0) {
    return { status: 'unreachable' };
  }

  const routedIds = new Set(nearest.map((candidate) => candidate.id));
  const morePlaces = selectNearestCandidates(placesResult.places, coords, placesResult.places.length).filter(
    (candidate) => !routedIds.has(candidate.id)
  );

  return { status: 'ready', candidates, morePlaces, travelTimesUnavailable: false };
}
