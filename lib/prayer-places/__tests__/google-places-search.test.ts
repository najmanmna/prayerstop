import { createQuotaBreaker } from '../../quota-breaker';
import { createGooglePlacesSource, GOOGLE_PLACES_FIELD_MASK } from '../google-places-search';

const origin = { latitude: 6.9271, longitude: 79.8612 };

function response(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}

describe('createGooglePlacesSource', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('requests only the fields the app uses, with the server key in a header', async () => {
    const fetchMock = jest.fn(async () => response({ places: [] }));
    const source = createGooglePlacesSource('server-key', 1000, fetchMock as unknown as typeof fetch);

    await source.searchNearby(origin, 5000, 20);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(url).toBe('https://places.googleapis.com/v1/places:searchNearby');
    expect(headers['X-Goog-FieldMask']).toBe(GOOGLE_PLACES_FIELD_MASK);
    expect(GOOGLE_PLACES_FIELD_MASK).not.toMatch(/photos|rating|reviews|openingHours|\*/);
    expect(headers['X-Goog-Api-Key']).toBe('server-key');
    expect(url).not.toContain('server-key');
  });

  it('normalizes results into Google-sourced places', async () => {
    const source = createGooglePlacesSource('k', 1000, (async () =>
      response({ places: [{ id: 'ChIJa', displayName: { text: 'Masjid A' }, location: { latitude: 6.93, longitude: 79.86 } }] })) as unknown as typeof fetch);

    const result = await source.searchNearby(origin, 5000, 20);

    expect(result).toEqual({
      status: 'ok',
      places: [
        {
          id: 'google:ChIJa',
          source: 'google',
          localRecordId: null,
          googlePlaceId: 'ChIJa',
          name: 'Masjid A',
          area: '',
          coordinates: { latitude: 6.93, longitude: 79.86 },
        },
      ],
    });
  });

  it('treats a response with no places as an empty result, not an error', async () => {
    const source = createGooglePlacesSource('k', 1000, (async () => response({})) as unknown as typeof fetch);
    expect(await source.searchNearby(origin, 5000, 20)).toEqual({ status: 'ok', places: [] });
  });

  it('returns an error on a Google API error status', async () => {
    const source = createGooglePlacesSource('k', 1000, (async () =>
      response({ error: { status: 'PERMISSION_DENIED' } }, false, 403)) as unknown as typeof fetch);
    expect(await source.searchNearby(origin, 5000, 20)).toEqual({
      status: 'error',
      message: 'The places service is temporarily unavailable.',
    });
  });

  it('returns an error when Google is unreachable', async () => {
    const source = createGooglePlacesSource('k', 1000, (async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch);
    expect((await source.searchNearby(origin, 5000, 20)).status).toBe('error');
  });

  it('returns an error on an unreadable body', async () => {
    const source = createGooglePlacesSource('k', 1000, (async () =>
      ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad json'); } }) as unknown as Response) as unknown as typeof fetch);
    expect((await source.searchNearby(origin, 5000, 20)).status).toBe('error');
  });

  describe('quota breaker', () => {
    it('opens the breaker on a 429 and reports a distinct quota message', async () => {
      const breaker = createQuotaBreaker({ cooldownMs: 60_000 });
      const fetchMock = jest.fn(async () => response({ error: { status: 'RESOURCE_EXHAUSTED' } }, false, 429));
      const source = createGooglePlacesSource('k', 1000, fetchMock as unknown as typeof fetch, breaker);

      const result = await source.searchNearby(origin, 5000, 20);

      expect(result).toEqual({ status: 'error', message: 'The places service has reached its quota for now.' });
      expect(breaker.isInCooldown()).toBe(true);
    });

    it('opens the breaker on a non-429 RESOURCE_EXHAUSTED body too', async () => {
      const breaker = createQuotaBreaker({ cooldownMs: 60_000 });
      const fetchMock = jest.fn(async () => response({ error: { status: 'RESOURCE_EXHAUSTED' } }, false, 403));
      const source = createGooglePlacesSource('k', 1000, fetchMock as unknown as typeof fetch, breaker);

      await source.searchNearby(origin, 5000, 20);

      expect(breaker.isInCooldown()).toBe(true);
    });

    it('does not open the breaker for an unrelated failure', async () => {
      const breaker = createQuotaBreaker({ cooldownMs: 60_000 });
      const fetchMock = jest.fn(async () => response({ error: { status: 'PERMISSION_DENIED' } }, false, 403));
      const source = createGooglePlacesSource('k', 1000, fetchMock as unknown as typeof fetch, breaker);

      await source.searchNearby(origin, 5000, 20);

      expect(breaker.isInCooldown()).toBe(false);
    });

    it('short-circuits without calling fetch while the breaker is open', async () => {
      const breaker = createQuotaBreaker({ cooldownMs: 60_000 });
      breaker.recordExceeded();
      const fetchMock = jest.fn(async () => response({ places: [] }));
      const source = createGooglePlacesSource('k', 1000, fetchMock as unknown as typeof fetch, breaker);

      const result = await source.searchNearby(origin, 5000, 20);

      expect(result.status).toBe('error');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('calls Google again once the cooldown elapses', async () => {
      const breaker = createQuotaBreaker({ cooldownMs: 1 });
      breaker.recordExceeded(0);
      const fetchMock = jest.fn(async () => response({ places: [] }));
      const source = createGooglePlacesSource('k', 1000, fetchMock as unknown as typeof fetch, breaker);

      // isInCooldown(Date.now()) — real time is well past the 1ms cooldown by now.
      const result = await source.searchNearby(origin, 5000, 20);

      expect(result.status).toBe('ok');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
