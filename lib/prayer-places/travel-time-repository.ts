import type { GeoCoordinates } from './types';

export interface TravelTimeDestination {
  placeId: string;
  coordinates: GeoCoordinates;
}

export interface TravelTimeRequest {
  origin: GeoCoordinates;
  destinations: TravelTimeDestination[];
}

export type TravelTimeOutcome =
  | { status: 'ok'; durationSeconds: number; distanceMeters: number; condition: string }
  | { status: 'unreachable'; condition: string }
  | { status: 'error'; message: string };

export interface TravelTimeResult {
  placeId: string;
  outcome: TravelTimeOutcome;
}

export type TravelTimeMatrixResult =
  | { status: 'ok'; results: TravelTimeResult[] }
  | { status: 'error'; message: string };

/**
 * Max destinations sent to Google Routes per request. Matches the
 * non-negotiable "never call Routes for every nearby place — only a short
 * top-N list" rule (see CLAUDE.md) and Phase 4's explicit 3-candidate cap.
 */
export const MAX_ROUTE_MATRIX_DESTINATIONS = 3;

/**
 * The data-access boundary between however real, traffic-aware travel time
 * is actually computed (Google Routes today) and the rest of the app.
 * Mirrors `PrayerPlaceRepository`'s role for place discovery — ranking logic
 * and the UI depend only on this interface, never on Google Routes directly.
 */
export interface TravelTimeRepository {
  getTravelTimes(request: TravelTimeRequest): Promise<TravelTimeMatrixResult>;
}
