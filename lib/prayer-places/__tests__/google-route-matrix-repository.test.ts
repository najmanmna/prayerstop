import { GoogleRouteMatrixRepository } from '../google-route-matrix-repository';

describe('GoogleRouteMatrixRepository', () => {
  const request = {
    origin: { latitude: 6.9271, longitude: 79.8612 },
    destinations: [{ placeId: 'a', coordinates: { latitude: 6.9, longitude: 79.8 } }],
  };
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('calls the local API route, never Google directly', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    const repository = new GoogleRouteMatrixRepository();

    await repository.getTravelTimes(request);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/route-matrix');
    expect(url).not.toMatch(/googleapis\.com/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(request);
  });

  it('returns ok with normalized results on success', async () => {
    const results = [
      { placeId: 'a', outcome: { status: 'ok', durationSeconds: 300, distanceMeters: 2000, condition: 'ROUTE_EXISTS' } },
    ];
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ results }) });
    const repository = new GoogleRouteMatrixRepository();

    const result = await repository.getTravelTimes(request);

    expect(result).toEqual({ status: 'ok', results });
  });

  it('returns an error when the network request itself fails', async () => {
    fetchMock.mockRejectedValue(new Error('Network down'));
    const repository = new GoogleRouteMatrixRepository();

    const result = await repository.getTravelTimes(request);

    expect(result).toEqual({ status: 'error', message: 'Network down' });
  });

  it('returns an error using the server-provided message on a non-ok response (e.g. missing key)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'Travel-time lookup is not configured on the server.' }),
    });
    const repository = new GoogleRouteMatrixRepository();

    const result = await repository.getTravelTimes(request);

    expect(result).toEqual({ status: 'error', message: 'Travel-time lookup is not configured on the server.' });
  });

  it('returns an error when the response shape is unexpected', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ results: 'not-an-array' }) });
    const repository = new GoogleRouteMatrixRepository();

    const result = await repository.getTravelTimes(request);

    expect(result).toEqual({ status: 'error', message: 'Unexpected response shape from the travel-time service.' });
  });
});
