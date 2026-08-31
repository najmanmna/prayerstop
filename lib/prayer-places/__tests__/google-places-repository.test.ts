import { NEARBY_PLACES_MAX_RESULT_COUNT } from '../build-nearby-places-request';
import { DEFAULT_NEARBY_OPTIONS, GooglePlacesRepository } from '../google-places-repository';

describe('DEFAULT_NEARBY_OPTIONS', () => {
  it('requests the full 20-candidate pool by default', () => {
    expect(DEFAULT_NEARBY_OPTIONS.maxResults).toBe(NEARBY_PLACES_MAX_RESULT_COUNT);
    expect(DEFAULT_NEARBY_OPTIONS.maxResults).toBe(20);
  });
});

describe('GooglePlacesRepository', () => {
  const origin = { latitude: 6.9271, longitude: 79.8612 };
  const options = { radiusMeters: 5000, maxResults: 10 };
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('calls the local API route, never Google directly', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ places: [] }) });
    const repository = new GooglePlacesRepository();

    await repository.findNearby(origin, options);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toMatch(/^\/api\/nearby-places\?/);
    expect(url).not.toMatch(/googleapis\.com/);
  });

  it('returns ok with normalized places on success', async () => {
    const places = [{ id: '1', name: 'Masjid A', area: 'Colombo', coordinates: { latitude: 6.9, longitude: 79.8 } }];
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ places }) });
    const repository = new GooglePlacesRepository();

    const result = await repository.findNearby(origin, options);

    expect(result).toEqual({ status: 'ok', places });
  });

  it('returns an error when the network request itself fails', async () => {
    fetchMock.mockRejectedValue(new Error('Network down'));
    const repository = new GooglePlacesRepository();

    const result = await repository.findNearby(origin, options);

    expect(result).toEqual({ status: 'error', message: 'Network down' });
  });

  it('returns an error using the server-provided message on a non-ok response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'Nearby place search is not configured on the server.' }),
    });
    const repository = new GooglePlacesRepository();

    const result = await repository.findNearby(origin, options);

    expect(result).toEqual({ status: 'error', message: 'Nearby place search is not configured on the server.' });
  });

  it('returns an error when the response body is not valid JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error('invalid json');
      },
    });
    const repository = new GooglePlacesRepository();

    const result = await repository.findNearby(origin, options);

    expect(result).toEqual({ status: 'error', message: 'The places service returned an unreadable response.' });
  });

  it('returns an error when the response shape is unexpected', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ places: 'not-an-array' }) });
    const repository = new GooglePlacesRepository();

    const result = await repository.findNearby(origin, options);

    expect(result).toEqual({ status: 'error', message: 'Unexpected response shape from the places service.' });
  });
});
