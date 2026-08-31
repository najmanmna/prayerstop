import { applyTravelTimes } from '../apply-travel-times';
import type { DistanceRankedCandidate } from '../select-candidates';
import type { TravelTimeResult } from '../travel-time-repository';

function candidate(id: string, distanceKm: number): DistanceRankedCandidate {
  return { id, name: `Place ${id}`, area: 'Colombo', coordinates: { latitude: 6.9, longitude: 79.8 }, distanceKm };
}

describe('applyTravelTimes', () => {
  it('merges a successful 3-destination travel-time response onto the candidates', () => {
    const candidates = [candidate('a', 1), candidate('b', 2), candidate('c', 3)];
    const travelTimes: TravelTimeResult[] = [
      { placeId: 'a', outcome: { status: 'ok', durationSeconds: 300, distanceMeters: 2000, condition: 'ROUTE_EXISTS' } },
      { placeId: 'b', outcome: { status: 'ok', durationSeconds: 600, distanceMeters: 5000, condition: 'ROUTE_EXISTS' } },
      { placeId: 'c', outcome: { status: 'ok', durationSeconds: 900, distanceMeters: 8000, condition: 'ROUTE_EXISTS' } },
    ];

    const ranked = applyTravelTimes(candidates, travelTimes);

    const coordinates = { latitude: 6.9, longitude: 79.8 };
    const routeCondition = 'ROUTE_EXISTS';
    expect(ranked).toEqual([
      { id: 'a', name: 'Place a', area: 'Colombo', coordinates, distanceKm: 2, etaMinutes: 5, routeCondition },
      { id: 'b', name: 'Place b', area: 'Colombo', coordinates, distanceKm: 5, etaMinutes: 10, routeCondition },
      { id: 'c', name: 'Place c', area: 'Colombo', coordinates, distanceKm: 8, etaMinutes: 15, routeCondition },
    ]);
  });

  it('drops a candidate whose individual matrix element failed, rather than fabricating an ETA', () => {
    const candidates = [candidate('a', 1), candidate('b', 2)];
    const travelTimes: TravelTimeResult[] = [
      { placeId: 'a', outcome: { status: 'ok', durationSeconds: 300, distanceMeters: 2000, condition: 'ROUTE_EXISTS' } },
      { placeId: 'b', outcome: { status: 'error', message: 'Internal error' } },
    ];

    const ranked = applyTravelTimes(candidates, travelTimes);

    expect(ranked).toHaveLength(1);
    expect(ranked[0].id).toBe('a');
  });

  it('drops a candidate Google could not find a route to (ROUTE_NOT_FOUND)', () => {
    const candidates = [candidate('a', 1), candidate('b', 2)];
    const travelTimes: TravelTimeResult[] = [
      { placeId: 'a', outcome: { status: 'ok', durationSeconds: 300, distanceMeters: 2000, condition: 'ROUTE_EXISTS' } },
      { placeId: 'b', outcome: { status: 'unreachable', condition: 'ROUTE_NOT_FOUND' } },
    ];

    const ranked = applyTravelTimes(candidates, travelTimes);

    expect(ranked).toHaveLength(1);
    expect(ranked[0].id).toBe('a');
  });

  it('returns an empty array when every candidate is unreachable (zero routable candidates)', () => {
    const candidates = [candidate('a', 1), candidate('b', 2), candidate('c', 3)];
    const travelTimes: TravelTimeResult[] = candidates.map((c) => ({
      placeId: c.id,
      outcome: { status: 'unreachable', condition: 'ROUTE_NOT_FOUND' },
    }));

    expect(applyTravelTimes(candidates, travelTimes)).toEqual([]);
  });

  it('drops a candidate with no matching travel-time result at all', () => {
    const candidates = [candidate('a', 1)];
    expect(applyTravelTimes(candidates, [])).toEqual([]);
  });

  it('rounds duration to whole minutes and never returns less than 1 minute', () => {
    const candidates = [candidate('a', 1)];
    const travelTimes: TravelTimeResult[] = [
      { placeId: 'a', outcome: { status: 'ok', durationSeconds: 20, distanceMeters: 100, condition: 'ROUTE_EXISTS' } },
    ];

    const ranked = applyTravelTimes(candidates, travelTimes);

    expect(ranked[0].etaMinutes).toBe(1);
  });
});
