import {
  type BlockedPlaceSource,
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

function blocklist(result: Awaited<ReturnType<BlockedPlaceSource['findBlocked']>>): BlockedPlaceSource & { findBlocked: jest.Mock } {
  return { findBlocked: jest.fn(async () => result) };
}

function linkWriter(): PlaceIdLinkWriter & { saveLinks: jest.Mock } {
  return { saveLinks: jest.fn(async () => undefined) };
}

function deps(overrides: Partial<FindNearbyPlacesDeps>): FindNearbyPlacesDeps {
  return { local: null, google: null, blocklist: null, linkWriter: null, config: NEARBY_SEARCH_CONFIG, ...overrides };
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

  it('calls Google when the only verified mosques are 1.5–2 km away (real Wattala case)', async () => {
    const googleMock = googleSource({ status: 'ok', places: [google('ChIJbadriya', 'Al Badriya Jummah Masjid', 639)] });
    const sparse = [local('a', 'Masjid A', 1200), local('b', 'Masjid B', 1674), local('c', 'Masjid C', 1900)];

    const result = await findNearbyPlaces(request, deps({ local: localSource({ status: 'ok', places: sparse }), google: googleMock }));

    expect(googleMock.searchNearby).toHaveBeenCalledTimes(1);
    expect(result.status === 'ok' && result.places[0].id).toBe('google:ChIJbadriya');
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

  it('drops blocklisted Google results (non-mosques Google labels as mosques)', async () => {
    const blocklistMock = blocklist({ status: 'ok', blocked: new Set(['ChIJsZi-UepR4joRANXd2Fn8OuM']) });
    const result = await findNearbyPlaces(
      request,
      deps({
        local: localSource({ status: 'ok', places: [] }),
        google: googleSource({
          status: 'ok',
          places: [google('ChIJsZi-UepR4joRANXd2Fn8OuM', 'Veesoft IT PVT (Ltd)', 300), google('g1', 'Masjid G', 500)],
        }),
        blocklist: blocklistMock,
      })
    );

    expect(blocklistMock.findBlocked).toHaveBeenCalledWith(['ChIJsZi-UepR4joRANXd2Fn8OuM', 'g1']);
    expect(result.status === 'ok' && result.places.map((p) => p.id)).toEqual(['google:g1']);
    expect(result).toMatchObject({ meta: { blockedRemoved: 1 } });
  });

  it('drops Google results named as homes, before the blocklist lookup', async () => {
    const blocklistMock = blocklist({ status: 'ok', blocked: new Set() });
    const result = await findNearbyPlaces(
      request,
      deps({
        local: localSource({ status: 'ok', places: [] }),
        google: googleSource({
          status: 'ok',
          places: [google('h1', 'Rizvi Residence', 200), google('h2', 'Ahamed House', 250), google('g1', 'Prayer House', 400)],
        }),
        blocklist: blocklistMock,
      })
    );

    expect(blocklistMock.findBlocked).toHaveBeenCalledWith(['g1']);
    expect(result.status === 'ok' && result.places.map((p) => p.id)).toEqual(['google:g1']);
    expect(result).toMatchObject({ meta: { nameExcludedRemoved: 2 } });
  });

  it('never filters verified database records by name', async () => {
    const result = await findNearbyPlaces(
      request,
      deps({ local: localSource({ status: 'ok', places: [local('a', 'Rizvi House', 100), ...threeNearbyLocals] }) })
    );

    expect(result.status === 'ok' && result.places.map((p) => p.name)).toContain('Rizvi House');
  });

  it('never links a blocklisted Google result to a local record, even with a matching name', async () => {
    const writer = linkWriter();
    await findNearbyPlaces(
      request,
      deps({
        local: localSource({ status: 'ok', places: [local('nsdi-1', 'Masjidun Noor', 200)] }),
        google: googleSource({ status: 'ok', places: [google('ChIJbad', 'Masjidun Noor', 210)] }),
        blocklist: blocklist({ status: 'ok', blocked: new Set(['ChIJbad']) }),
        linkWriter: writer,
      })
    );

    expect(writer.saveLinks).not.toHaveBeenCalled();
  });

  it('returns Google results unfiltered if the blocklist cannot be read', async () => {
    const result = await findNearbyPlaces(
      request,
      deps({
        local: localSource({ status: 'ok', places: [] }),
        google: googleSource({ status: 'ok', places: [google('g1', 'Masjid G', 300)] }),
        blocklist: blocklist({ status: 'error', message: 'db down' }),
      })
    );

    expect(result).toMatchObject({ status: 'ok', meta: { blockedRemoved: 0 } });
    expect(result.status === 'ok' && result.places).toHaveLength(1);
  });

  it('does not query the blocklist when Google was not called', async () => {
    const blocklistMock = blocklist({ status: 'ok', blocked: new Set() });
    await findNearbyPlaces(
      request,
      deps({ local: localSource({ status: 'ok', places: threeNearbyLocals }), google: googleSource({ status: 'ok', places: [] }), blocklist: blocklistMock })
    );

    expect(blocklistMock.findBlocked).not.toHaveBeenCalled();
  });

  it('honours a smaller requested maxResults for both sources', async () => {
    const localMock = localSource({ status: 'ok', places: [] });
    const googleMock = googleSource({ status: 'ok', places: [] });

    await findNearbyPlaces({ ...request, maxResults: 5 }, deps({ local: localMock, google: googleMock }));

    expect(localMock.findVerifiedNearby).toHaveBeenCalledWith(origin, 5000, 5);
    expect(googleMock.searchNearby).toHaveBeenCalledWith(origin, 5000, 5);
  });
});
