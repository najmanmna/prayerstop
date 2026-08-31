import { fetchNearbySession } from '../fetch-nearby-session';
import type { PrayerPlaceRepository } from '../prayer-place-repository';
import type { TravelTimeRepository } from '../travel-time-repository';
import type { PrayerPlaceCandidate } from '../types';

const origin = { latitude: 6.9271, longitude: 79.8612 };

function place(id: string, offset: number): PrayerPlaceCandidate {
  return {
    id,
    name: `Place ${id}`,
    area: 'Colombo',
    coordinates: { latitude: origin.latitude + offset, longitude: origin.longitude + offset },
  };
}

function fakeRepos(overrides: { places?: PrayerPlaceCandidate[]; placesError?: string; travelError?: string }) {
  const placeRepository: PrayerPlaceRepository = {
    findNearby: jest.fn(async () =>
      overrides.placesError
        ? { status: 'error' as const, message: overrides.placesError }
        : { status: 'ok' as const, places: overrides.places ?? [] }
    ),
  };
  const travelTimeRepository: TravelTimeRepository = {
    getTravelTimes: jest.fn(async (request) =>
      overrides.travelError
        ? { status: 'error' as const, message: overrides.travelError }
        : {
            status: 'ok' as const,
            results: request.destinations.map((d) => ({
              placeId: d.placeId,
              outcome: { status: 'ok' as const, durationSeconds: 300, distanceMeters: 2000, condition: 'ROUTE_EXISTS' },
            })),
          }
    ),
  };
  return { placeRepository, travelTimeRepository };
}

describe('fetchNearbySession', () => {
  it('returns ready with real distance/ETA-ranked candidates on a full success path', async () => {
    const { placeRepository, travelTimeRepository } = fakeRepos({ places: [place('a', 0.01)] });

    const result = await fetchNearbySession(origin, placeRepository, travelTimeRepository);

    expect(result).toEqual({
      status: 'ready',
      candidates: [
        expect.objectContaining({ id: 'a', etaMinutes: 5, routeCondition: 'ROUTE_EXISTS' }),
      ],
    });
  });

  it('never sends more than the candidate limit to Google Routes', async () => {
    const places = ['a', 'b', 'c', 'd', 'e'].map((id, i) => place(id, 0.01 * (i + 1)));
    const { placeRepository, travelTimeRepository } = fakeRepos({ places });

    await fetchNearbySession(origin, placeRepository, travelTimeRepository);

    const call = (travelTimeRepository.getTravelTimes as jest.Mock).mock.calls[0][0];
    expect(call.destinations.length).toBeLessThanOrEqual(3);
  });

  it('returns empty when Places finds nothing nearby', async () => {
    const { placeRepository, travelTimeRepository } = fakeRepos({ places: [] });

    const result = await fetchNearbySession(origin, placeRepository, travelTimeRepository);

    expect(result).toEqual({ status: 'empty' });
    expect(travelTimeRepository.getTravelTimes).not.toHaveBeenCalled();
  });

  it('returns error when the Places call fails', async () => {
    const { placeRepository, travelTimeRepository } = fakeRepos({ placesError: 'places down' });

    const result = await fetchNearbySession(origin, placeRepository, travelTimeRepository);

    expect(result).toEqual({ status: 'error', message: 'places down' });
    expect(travelTimeRepository.getTravelTimes).not.toHaveBeenCalled();
  });

  it('returns error when the Route Matrix call fails', async () => {
    const { placeRepository, travelTimeRepository } = fakeRepos({
      places: [place('a', 0.01)],
      travelError: 'routes down',
    });

    const result = await fetchNearbySession(origin, placeRepository, travelTimeRepository);

    expect(result).toEqual({ status: 'error', message: 'routes down' });
  });

  it('returns unreachable when every candidate is unroutable', async () => {
    const placeRepository: PrayerPlaceRepository = {
      findNearby: jest.fn(async () => ({ status: 'ok' as const, places: [place('a', 0.01)] })),
    };
    const travelTimeRepository: TravelTimeRepository = {
      getTravelTimes: jest.fn(async () => ({
        status: 'ok' as const,
        results: [{ placeId: 'a', outcome: { status: 'unreachable' as const, condition: 'ROUTE_NOT_FOUND' } }],
      })),
    };

    const result = await fetchNearbySession(origin, placeRepository, travelTimeRepository);

    expect(result).toEqual({ status: 'unreachable' });
  });
});
