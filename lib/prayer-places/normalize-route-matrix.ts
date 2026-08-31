import type { TravelTimeDestination, TravelTimeOutcome, TravelTimeResult } from './travel-time-repository';

/** The shape of one element in Google's raw computeRouteMatrix REST response. */
export interface RawRouteMatrixElement {
  originIndex?: number;
  destinationIndex?: number;
  status?: { code?: number; message?: string };
  condition?: string;
  distanceMeters?: number;
  duration?: string; // e.g. "1234s" — Google's Duration proto serializes as a string.
}

function parseDurationSeconds(duration: string | undefined): number | null {
  if (!duration) return null;
  const match = /^(\d+(?:\.\d+)?)s$/.exec(duration);
  return match ? Math.round(Number(match[1])) : null;
}

function toOutcome(element: RawRouteMatrixElement | undefined): TravelTimeOutcome {
  if (!element) {
    return { status: 'error', message: 'No route matrix result was returned for this destination.' };
  }
  if (element.status?.code !== undefined && element.status.code !== 0) {
    return {
      status: 'error',
      message: element.status.message ?? `Route lookup failed (code ${element.status.code}).`,
    };
  }
  if (element.condition === 'ROUTE_NOT_FOUND') {
    return { status: 'unreachable', condition: element.condition };
  }

  const durationSeconds = parseDurationSeconds(element.duration);
  if (element.condition !== 'ROUTE_EXISTS' || durationSeconds === null || element.distanceMeters === undefined) {
    return { status: 'error', message: 'Route matrix result was missing required fields.' };
  }

  return { status: 'ok', durationSeconds, distanceMeters: element.distanceMeters, condition: element.condition };
}

/**
 * Converts Google's raw computeRouteMatrix response elements into our own
 * per-destination `TravelTimeResult[]`, keyed by the `placeId` we originally
 * sent (Google only knows the positional `destinationIndex`). An element
 * that errored, found no route, or is simply missing from the response is
 * normalized to an honest 'error'/'unreachable' outcome rather than a
 * fabricated duration — never silently drop a destination the caller asked
 * about, and never invent a feasibility-relevant number (see CLAUDE.md).
 */
export function normalizeRouteMatrixResponse(
  elements: RawRouteMatrixElement[],
  destinations: TravelTimeDestination[]
): TravelTimeResult[] {
  return destinations.map((destination, index) => ({
    placeId: destination.placeId,
    outcome: toOutcome(elements.find((element) => element.destinationIndex === index)),
  }));
}
