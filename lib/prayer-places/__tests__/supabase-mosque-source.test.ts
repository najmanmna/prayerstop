import { normalizeDatabaseMosques } from '../normalize-database-mosques';
import { createSupabaseBlocklistSource, createSupabaseMosqueSource, createSupabasePlaceIdLinkWriter } from '../supabase-mosque-source';

const origin = { latitude: 6.9271, longitude: 79.8612 };

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}

describe('normalizeDatabaseMosques', () => {
  it('maps a verified record to the unified place format, keeping the original record ID', () => {
    const [place] = normalizeDatabaseMosques([
      {
        id: 'nsdi-18469',
        name: 'Wekanda Jumma Mosque',
        address: '19 Wekanda Jumma Masjid Road, Colombo',
        district: 'Colombo',
        latitude: 6.9222,
        longitude: 79.8517,
        google_place_id: null,
      },
    ]);

    expect(place).toEqual({
      id: 'db:nsdi-18469',
      source: 'database',
      localRecordId: 'nsdi-18469',
      googlePlaceId: null,
      name: 'Wekanda Jumma Mosque',
      area: '19 Wekanda Jumma Masjid Road, Colombo',
      coordinates: { latitude: 6.9222, longitude: 79.8517 },
    });
  });

  it('carries an existing Google Place ID mapping through', () => {
    const [place] = normalizeDatabaseMosques([
      { id: 'nsdi-1', name: 'A', latitude: 6.9, longitude: 79.8, google_place_id: 'ChIJx' },
    ]);
    expect(place.googlePlaceId).toBe('ChIJx');
  });

  it('falls back to district for the area, and drops rows without an ID or coordinates', () => {
    const places = normalizeDatabaseMosques([
      { id: 'a', name: 'A', address: null, district: 'Colombo', latitude: 6.9, longitude: 79.8 },
      { id: 'b', name: 'B', latitude: null, longitude: 79.8 },
      { name: 'C', latitude: 6.9, longitude: 79.8 },
    ]);
    expect(places.map((p) => [p.id, p.area])).toEqual([['db:a', 'Colombo']]);
  });
});

describe('createSupabaseMosqueSource', () => {
  it('calls nearby_verified_mosques with the publishable key and bounded parameters', async () => {
    const fetchMock = jest.fn(async () => jsonResponse([]));
    const source = createSupabaseMosqueSource('https://proj.supabase.co/', 'sb_publishable_x', 1000, fetchMock as unknown as typeof fetch);

    await source.findVerifiedNearby(origin, 5000, 20);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://proj.supabase.co/rest/v1/rpc/nearby_verified_mosques');
    expect((init.headers as Record<string, string>).apikey).toBe('sb_publishable_x');
    expect(JSON.parse(init.body as string)).toEqual({ p_latitude: 6.9271, p_longitude: 79.8612, p_radius_m: 5000, p_limit: 20 });
  });

  it('returns an error (never throws) on a failed or unreachable request', async () => {
    const failing = createSupabaseMosqueSource('https://p', 'k', 1000, (async () => jsonResponse({ message: 'nope' }, false, 500)) as unknown as typeof fetch);
    const unreachable = createSupabaseMosqueSource('https://p', 'k', 1000, (async () => {
      throw new Error('ENOTFOUND');
    }) as unknown as typeof fetch);

    expect((await failing.findVerifiedNearby(origin, 5000, 20)).status).toBe('error');
    expect((await unreachable.findVerifiedNearby(origin, 5000, 20)).status).toBe('error');
  });
});

describe('createSupabasePlaceIdLinkWriter', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends links to link_google_place_ids with the secret key', async () => {
    const fetchMock = jest.fn(async () => jsonResponse([{ mosque_id: 'nsdi-1', google_place_id: 'ChIJx', outcome: 'linked' }]));
    const writer = createSupabasePlaceIdLinkWriter('https://p', 'sb_secret_x', 1000, fetchMock as unknown as typeof fetch);

    await writer.saveLinks([{ localRecordId: 'nsdi-1', googlePlaceId: 'ChIJx' }]);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://p/rest/v1/rpc/link_google_place_ids');
    expect((init.headers as Record<string, string>).apikey).toBe('sb_secret_x');
    expect(JSON.parse(init.body as string)).toEqual({ p_links: [{ mosque_id: 'nsdi-1', google_place_id: 'ChIJx' }] });
  });

  it('never throws when saving fails', async () => {
    const writer = createSupabasePlaceIdLinkWriter('https://p', 'k', 1000, (async () => {
      throw new Error('down');
    }) as unknown as typeof fetch);

    await expect(writer.saveLinks([{ localRecordId: 'a', googlePlaceId: 'b' }])).resolves.toBeUndefined();
  });
});

describe('createSupabaseBlocklistSource', () => {
  it('asks blocked_google_place_ids about exactly the given IDs, with the publishable key', async () => {
    const fetchMock = jest.fn(async () => jsonResponse(['ChIJbad']));
    const source = createSupabaseBlocklistSource('https://p', 'sb_publishable_x', 1000, fetchMock as unknown as typeof fetch);

    const result = await source.findBlocked(['ChIJbad', 'ChIJok']);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://p/rest/v1/rpc/blocked_google_place_ids');
    expect((init.headers as Record<string, string>).apikey).toBe('sb_publishable_x');
    expect(JSON.parse(init.body as string)).toEqual({ p_ids: ['ChIJbad', 'ChIJok'] });
    expect(result).toEqual({ status: 'ok', blocked: new Set(['ChIJbad']) });
  });

  it('returns an error (never throws) when the lookup fails', async () => {
    const source = createSupabaseBlocklistSource('https://p', 'k', 1000, (async () => jsonResponse({}, false, 404)) as unknown as typeof fetch);
    expect((await source.findBlocked(['a'])).status).toBe('error');
  });
});
