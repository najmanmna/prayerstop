import { NEARBY_SEARCH_CONFIG } from '../nearby-search-config';
import { validateNearbyRequest } from '../validate-nearby-request';

function validate(query: Record<string, string>) {
  return validateNearbyRequest(new URLSearchParams(query), NEARBY_SEARCH_CONFIG);
}

describe('validateNearbyRequest', () => {
  it('accepts Colombo coordinates and applies defaults', () => {
    expect(validate({ latitude: '6.9271', longitude: '79.8612' })).toEqual({
      ok: true,
      request: { origin: { latitude: 6.9271, longitude: 79.8612 }, radiusMeters: 5000, maxResults: 20 },
    });
  });

  it.each([
    [{ longitude: '79.86' }],
    [{ latitude: 'abc', longitude: '79.86' }],
    [{ latitude: '', longitude: '79.86' }],
    [{ latitude: '95', longitude: '79.86' }],
    [{ latitude: '6.9', longitude: '200' }],
    [{ latitude: 'Infinity', longitude: '79.86' }],
  ])('rejects invalid coordinates %j', (query) => {
    expect(validate(query).ok).toBe(false);
  });

  it('rejects locations outside Sri Lanka', () => {
    expect(validate({ latitude: '37.42', longitude: '-122.08' })).toEqual({
      ok: false,
      error: 'PrayerStop currently only serves locations in Sri Lanka.',
    });
  });

  it.each(['50', '20001', '1000000', '-5', 'abc'])('rejects an unreasonable radius of %s', (radius) => {
    expect(validate({ latitude: '6.9271', longitude: '79.8612', radius }).ok).toBe(false);
  });

  it.each(['0', '21', '2.5', 'abc'])('rejects an out-of-range maxResults of %s', (maxResults) => {
    expect(validate({ latitude: '6.9271', longitude: '79.8612', maxResults }).ok).toBe(false);
  });

  it('accepts in-range radius and maxResults', () => {
    expect(validate({ latitude: '6.9271', longitude: '79.8612', radius: '2000', maxResults: '10' })).toMatchObject({
      ok: true,
      request: { radiusMeters: 2000, maxResults: 10 },
    });
  });
});
