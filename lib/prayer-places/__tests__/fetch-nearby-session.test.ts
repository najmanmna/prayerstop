import { fetchNearbySession } from '../fetch-nearby-session';
import type { PrayerPlaceRepository } from '../prayer-place-repository';
import type { TravelTimeRepository } from '../travel-time-repository';
import type { PrayerPlaceCandidate } from '../types';

const origin = { latitude: 6.9271, longitude: 79.8612 };

function place(id: string, offset: number): PrayerPlaceCandidate {
  return {
    id,
    source: 'google',
    localRecordId: null,
    googlePlaceId: null,
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
              id: d.id,
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
      morePlaces: [],
    });
  });

  it('keeps every place not sent to Routes as distance-only "more places", nearest first, with no ETA', async () => {
    const places = ['e', 'b', 'd', 'a', 'c'].map((id) => place(id, 0.01 * (id.charCodeAt(0) - 96)));
    const { placeRepository, travelTimeRepository } = fakeRepos({ places });

    const result = await fetchNearbySession(origin, placeRepository, travelTimeRepository);

    expect(result.status === 'ready' && result.candidates.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(result.status === 'ready' && result.morePlaces.map((c) => c.id)).toEqual(['d', 'e']);
    if (result.status === 'ready') {
      for (const more of result.morePlaces) {
        expect(more).not.toHaveProperty('etaMinutes');
        expect(more.distanceKm).toBeGreaterThan(0);
      }
    }
  });

  it('never lists a routed place that turned out unreachable among "more places"', async () => {
    const places = ['a', 'b', 'c', 'd'].map((id, i) => place(id, 0.01 * (i + 1)));
    const { placeRepository } = fakeRepos({ places });
    const travelTimeRepository: TravelTimeRepository = {
      getTravelTimes: jest.fn(async (request) => ({
        status: 'ok' as const,
        results: request.destinations.map((d) => ({
          id: d.id,
          outcome:
            d.id === 'b'
              ? { status: 'unreachable' as const, condition: 'ROUTE_NOT_FOUND' }
              : { status: 'ok' as const, durationSeconds: 300, distanceMeters: 2000, condition: 'ROUTE_EXISTS' },
        })),
      })),
    };

    const result = await fetchNearbySession(origin, placeRepository, travelTimeRepository);

    expect(result.status === 'ready' && result.candidates.map((c) => c.id)).toEqual(['a', 'c']);
    expect(result.status === 'ready' && result.morePlaces.map((c) => c.id)).toEqual(['d']);
  });

  it('computes travel times for local database and Google places alike, by coordinates', async () => {
    const localPlace: PrayerPlaceCandidate = {
      id: 'db:nsdi-18469',
      source: 'database',
      localRecordId: 'nsdi-18469',
      googlePlaceId: null,
      name: 'Wekanda Jumma Mosque',
      area: 'Colombo',
      coordinates: { latitude: origin.latitude + 0.005, longitude: origin.longitude },
    };
    const googlePlace: PrayerPlaceCandidate = {
      id: 'google:ChIJabc',
      source: 'google',
      localRecordId: null,
      googlePlaceId: 'ChIJabc',
      name: 'Masjid G',
      area: 'Colombo',
      coordinates: { latitude: origin.latitude + 0.01, longitude: origin.longitude },
    };
    const { placeRepository, travelTimeRepository } = fakeRepos({ places: [googlePlace, localPlace] });

    const result = await fetchNearbySession(origin, placeRepository, travelTimeRepository);

    const call = (travelTimeRepository.getTravelTimes as jest.Mock).mock.calls[0][0];
    expect(call.destinations).toEqual([
      { id: 'db:nsdi-18469', coordinates: localPlace.coordinates },
      { id: 'google:ChIJabc', coordinates: googlePlace.coordinates },
    ]);
    expect(result.status === 'ready' && result.candidates).toEqual([
      expect.objectContaining({ id: 'db:nsdi-18469', source: 'database', localRecordId: 'nsdi-18469', googlePlaceId: null, etaMinutes: 5 }),
      expect.objectContaining({ id: 'google:ChIJabc', source: 'google', googlePlaceId: 'ChIJabc', etaMinutes: 5 }),
    ]);
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
        results: [{ id: 'a', outcome: { status: 'unreachable' as const, condition: 'ROUTE_NOT_FOUND' } }],
      })),
    };

    const result = await fetchNearbySession(origin, placeRepository, travelTimeRepository);

    expect(result).toEqual({ status: 'unreachable' });
  });
});
