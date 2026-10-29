import {
  findNearbyPlaces,
  type FindNearbyPlacesDeps,
  type GooglePlacesSource,
  type LocalMosqueSource,
  type PlaceIdLinkWriter,
  type PlaceSourceResult,
} from '../find-nearby-places';
import { NEARBY_SEARCH_CONFIG } from '../nearby-search-config';
import type { GeoCoordinates, PrayerPlaceCandidate } from '../types';

const origin: GeoCoordinates = { latitude: 6.9271, longitude: 79.8612 };
const request = { origin, radiusMeters: 5000, maxResults: 20 };
const METRE = 0.000009;

function at(northMetres: number): GeoCoordinates {
  return { latitude: origin.latitude + northMetres * METRE, longitude: origin.longitude };
}

function local(recordId: string, name: string, northMetres: number): PrayerPlaceCandidate {
  return { id: `db:${recordId}`, source: 'database', localRecordId: recordId, googlePlaceId: null, name, area: '', coordinates: at(northMetres) };
}

function google(placeId: string, name: string, northMetres: number): PrayerPlaceCandidate {
  return { id: `google:${placeId}`, source: 'google', localRecordId: null, googlePlaceId: placeId, name, area: '', coordinates: at(northMetres) };
}

function localSource(result: PlaceSourceResult): LocalMosqueSource & { findVerifiedNearby: jest.Mock } {
  return { findVerifiedNearby: jest.fn(async () => result) };
}

function googleSource(result: PlaceSourceResult): GooglePlacesSource & { searchNearby: jest.Mock } {
  return { searchNearby: jest.fn(async () => result) };
}

function linkWriter(): PlaceIdLinkWriter & { saveLinks: jest.Mock } {
  return { saveLinks: jest.fn(async () => undefined) };
}

function deps(overrides: Partial<FindNearbyPlacesDeps>): FindNearbyPlacesDeps {
  return { local: null, google: null, linkWriter: null, config: NEARBY_SEARCH_CONFIG, ...overrides };
}

const threeNearbyLocals = [local('a', 'Masjid A', 100), local('b', 'Masjid B', 600), local('c', 'Masjid C', 1200)];

describe('findNearbyPlaces — database first', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns local results without calling Google when local coverage is sufficient', async () => {
    const googleMock = googleSource({ status: 'ok', places: [] });

    const result = await findNearbyPlaces(
      request,
      deps({ local: localSource({ status: 'ok', places: threeNearbyLocals }), google: googleMock })
    );

    expect(googleMock.searchNearby).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'ok', meta: { googleStatus: 'not_needed', localCount: 3 } });
    if (result.status === 'ok') expect(result.places.map((p) => p.id)).toEqual(['db:a', 'db:b', 'db:c']);
  });

  it('does not let two records of the same mosque count twice toward local coverage', async () => {
    const googleMock = googleSource({ status: 'ok', places: [] });
    const locals = [
      local('nsdi-18539', 'MARADANA SMALL MOSQUE', 100),
      local('dmrca-R-620-C-57', 'Maradana Small Jumma Masjid', 101),
      local('b', 'Masjid B', 600),
    ];

    const result = await findNearbyPlaces(request, deps({ local: localSource({ status: 'ok', places: locals }), google: googleMock }));

    expect(googleMock.searchNearby).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: 'ok', meta: { localCount: 2, localDuplicatesCollapsed: 1 } });
  });

  it('calls Google exactly once when local coverage is insufficient, and merges the results', async () => {
    const googleMock = googleSource({ status: 'ok', places: [google('g1', 'Masjid G', 300)] });

    const result = await findNearbyPlaces(
      request,
      deps({ local: localSource({ status: 'ok', places: [local('a', 'Masjid A', 100)] }), google: googleMock })
    );

    expect(googleMock.searchNearby).toHaveBeenCalledTimes(1);
    expect(googleMock.searchNearby).toHaveBeenCalledWith(origin, 5000, 20);
    expect(result.status === 'ok' && result.places.map((p) => p.id)).toEqual(['db:a', 'google:g1']);
  });

  it('removes Google duplicates of local records and saves only confident Place ID matches', async () => {
    const writer = linkWriter();
    const result = await findNearbyPlaces(
      request,
      deps({
        local: localSource({ status: 'ok', places: [local('nsdi-1', 'Masjidun Noor', 200)] }),
        google: googleSource({ status: 'ok', places: [google('ChIJnoor', 'Masjidun Noor Jumma Mosque', 220)] }),
        linkWriter: writer,
      })
    );

    expect(result.status === 'ok' && result.places.map((p) => p.id)).toEqual(['db:nsdi-1']);
    expect(writer.saveLinks).toHaveBeenCalledWith([{ localRecordId: 'nsdi-1', googlePlaceId: 'ChIJnoor' }]);
  });

  it('does not call the link writer when there is nothing confident to save', async () => {
    const writer = linkWriter();
    await findNearbyPlaces(
      request,
      deps({
        local: localSource({ status: 'ok', places: [] }),
        google: googleSource({ status: 'ok', places: [google('g1', 'Masjid G', 300)] }),
        linkWriter: writer,
      })
    );

    expect(writer.saveLinks).not.toHaveBeenCalled();
  });

  it('falls back to Google only when the database lookup fails', async () => {
    const result = await findNearbyPlaces(
      request,
      deps({
        local: localSource({ status: 'error', message: 'db down' }),
        google: googleSource({ status: 'ok', places: [google('g1', 'Masjid G', 300)] }),
      })
    );

    expect(result).toMatchObject({ status: 'ok', meta: { localStatus: 'error', googleStatus: 'ok' } });
  });

  it('runs Google-only when Supabase is not configured (previous behaviour)', async () => {
    const result = await findNearbyPlaces(
      request,
      deps({ google: googleSource({ status: 'ok', places: [google('g1', 'Masjid G', 300)] }) })
    );

    expect(result).toMatchObject({ status: 'ok', meta: { localStatus: 'not_configured', googleStatus: 'ok' } });
  });

  it('still returns local results when Google fails', async () => {
    const result = await findNearbyPlaces(
      request,
      deps({
        local: localSource({ status: 'ok', places: [local('a', 'Masjid A', 100)] }),
        google: googleSource({ status: 'error', message: 'The places service is temporarily unavailable.' }),
      })
    );

    expect(result).toMatchObject({ status: 'ok', meta: { googleStatus: 'error' } });
    expect(result.status === 'ok' && result.places.map((p) => p.id)).toEqual(['db:a']);
  });

  it('returns a 502 when Google fails and there are no local results', async () => {
    const result = await findNearbyPlaces(
      request,
      deps({
        local: localSource({ status: 'ok', places: [] }),
        google: googleSource({ status: 'error', message: 'The places service is temporarily unavailable.' }),
      })
    );

    expect(result).toEqual({ status: 'error', httpStatus: 502, message: 'The places service is temporarily unavailable.' });
  });

  it('returns an empty list (not an error) when neither source finds anything', async () => {
    const result = await findNearbyPlaces(
      request,
      deps({ local: localSource({ status: 'ok', places: [] }), google: googleSource({ status: 'ok', places: [] }) })
    );

    expect(result).toMatchObject({ status: 'ok', places: [] });
  });

  it('returns local results when Google is not configured', async () => {
    const result = await findNearbyPlaces(
      request,
      deps({ local: localSource({ status: 'ok', places: [local('a', 'Masjid A', 100)] }) })
    );

    expect(result).toMatchObject({ status: 'ok', meta: { googleStatus: 'not_configured' } });
  });

  it('returns a 503 when nothing is configured', async () => {
    const result = await findNearbyPlaces(request, deps({}));
    expect(result).toMatchObject({ status: 'error', httpStatus: 503 });
  });

  it('honours a smaller requested maxResults for both sources', async () => {
    const localMock = localSource({ status: 'ok', places: [] });
    const googleMock = googleSource({ status: 'ok', places: [] });

    await findNearbyPlaces({ ...request, maxResults: 5 }, deps({ local: localMock, google: googleMock }));

    expect(localMock.findVerifiedNearby).toHaveBeenCalledWith(origin, 5000, 5);
    expect(googleMock.searchNearby).toHaveBeenCalledWith(origin, 5000, 5);
  });
});
