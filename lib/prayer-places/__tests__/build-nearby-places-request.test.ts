import { buildNearbyPlacesRequestBody, NEARBY_PLACES_MAX_RESULT_COUNT } from '../build-nearby-places-request';

const origin = { latitude: 6.9271, longitude: 79.8612 };

describe('buildNearbyPlacesRequestBody', () => {
  it('ranks results by DISTANCE, not the default POPULARITY', () => {
    const body = buildNearbyPlacesRequestBody(origin, 5000, 20);
    expect(body.rankPreference).toBe('DISTANCE');
  });

  it('requests up to the given maxResultCount', () => {
    const body = buildNearbyPlacesRequestBody(origin, 5000, 20);
    expect(body.maxResultCount).toBe(20);
  });

  it('exposes 20 as the maximum candidate pool size (Google\'s own Nearby Search limit)', () => {
    expect(NEARBY_PLACES_MAX_RESULT_COUNT).toBe(20);
  });

  it('keeps the mosque type filter, region, and location restriction unchanged', () => {
    const body = buildNearbyPlacesRequestBody(origin, 5000, 20);
    expect(body.includedTypes).toEqual(['mosque']);
    expect(body.regionCode).toBe('LK');
    expect(body.locationRestriction).toEqual({ circle: { center: origin, radius: 5000 } });
  });

  it('passes through whatever radius/count the caller (already clamped) provides', () => {
    const body = buildNearbyPlacesRequestBody(origin, 2500, 5);
    expect(body.locationRestriction.circle.radius).toBe(2500);
    expect(body.maxResultCount).toBe(5);
  });
});
