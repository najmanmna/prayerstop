import { normalizeRouteMatrixResponse, type RawRouteMatrixElement } from '../normalize-route-matrix';
import type { TravelTimeDestination } from '../travel-time-repository';

const destinations: TravelTimeDestination[] = [
  { placeId: 'a', coordinates: { latitude: 6.9, longitude: 79.8 } },
  { placeId: 'b', coordinates: { latitude: 6.91, longitude: 79.81 } },
  { placeId: 'c', coordinates: { latitude: 6.92, longitude: 79.82 } },
];

function okElement(destinationIndex: number, durationSeconds: number, distanceMeters: number): RawRouteMatrixElement {
  return {
    originIndex: 0,
    destinationIndex,
    status: { code: 0 },
    condition: 'ROUTE_EXISTS',
    duration: `${durationSeconds}s`,
    distanceMeters,
  };
}

describe('normalizeRouteMatrixResponse', () => {
  it('normalizes a successful 3-destination response', () => {
    const elements = [okElement(0, 300, 2000), okElement(1, 600, 5000), okElement(2, 900, 8000)];

    const results = normalizeRouteMatrixResponse(elements, destinations);

    expect(results).toEqual([
      { placeId: 'a', outcome: { status: 'ok', durationSeconds: 300, distanceMeters: 2000, condition: 'ROUTE_EXISTS' } },
      { placeId: 'b', outcome: { status: 'ok', durationSeconds: 600, distanceMeters: 5000, condition: 'ROUTE_EXISTS' } },
      { placeId: 'c', outcome: { status: 'ok', durationSeconds: 900, distanceMeters: 8000, condition: 'ROUTE_EXISTS' } },
    ]);
  });

  it('normalizes an individually failed element to an error outcome, without dropping the destination', () => {
    const elements = [
      okElement(0, 300, 2000),
      { originIndex: 0, destinationIndex: 1, status: { code: 13, message: 'Internal error' } },
      okElement(2, 900, 8000),
    ];

    const results = normalizeRouteMatrixResponse(elements, destinations);

    expect(results[1]).toEqual({ placeId: 'b', outcome: { status: 'error', message: 'Internal error' } });
    expect(results[0].outcome.status).toBe('ok');
    expect(results[2].outcome.status).toBe('ok');
  });

  it('normalizes a ROUTE_NOT_FOUND condition to an unreachable outcome, not an error or fabricated duration', () => {
    const elements = [
      okElement(0, 300, 2000),
      { originIndex: 0, destinationIndex: 1, status: { code: 0 }, condition: 'ROUTE_NOT_FOUND' },
      okElement(2, 900, 8000),
    ];

    const results = normalizeRouteMatrixResponse(elements, destinations);

    expect(results[1]).toEqual({ placeId: 'b', outcome: { status: 'unreachable', condition: 'ROUTE_NOT_FOUND' } });
  });

  it('treats a missing element for a destination index as an error, never silently dropped', () => {
    const elements = [okElement(0, 300, 2000), okElement(2, 900, 8000)]; // index 1 missing entirely

    const results = normalizeRouteMatrixResponse(elements, destinations);

    expect(results).toHaveLength(3);
    expect(results[1].outcome).toEqual({
      status: 'error',
      message: 'No route matrix result was returned for this destination.',
    });
  });

  it('treats a route marked ROUTE_EXISTS but with a malformed/missing duration as an error', () => {
    const elements = [
      { originIndex: 0, destinationIndex: 0, status: { code: 0 }, condition: 'ROUTE_EXISTS', distanceMeters: 2000 },
    ];

    const results = normalizeRouteMatrixResponse(elements, [destinations[0]]);

    expect(results[0].outcome.status).toBe('error');
  });
});
