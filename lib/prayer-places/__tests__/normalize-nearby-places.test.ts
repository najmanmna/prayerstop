import { normalizeNearbyPlacesResponse, type RawNearbyPlace } from '../normalize-nearby-places';
import { selectNearestCandidates } from '../select-candidates';

const origin = { latitude: 6.9271, longitude: 79.8612 };

function rawPlace(id: string, offsetDegrees: number, businessStatus?: string): RawNearbyPlace {
  return {
    id,
    displayName: { text: `Place ${id}` },
    shortFormattedAddress: 'Colombo',
    location: { latitude: origin.latitude + offsetDegrees, longitude: origin.longitude + offsetDegrees },
    businessStatus,
  };
}

describe('normalizeNearbyPlacesResponse', () => {
  it('excludes a place explicitly marked CLOSED_TEMPORARILY', () => {
    const places = [rawPlace('open', 0.01, 'OPERATIONAL'), rawPlace('closed', 0.02, 'CLOSED_TEMPORARILY')];

    const result = normalizeNearbyPlacesResponse(places);

    expect(result.map((p) => p.id)).toEqual(['open']);
  });

  it('does not exclude a place with no businessStatus at all — missing data is not evidence of closure', () => {
    const places = [rawPlace('unknown-status', 0.01, undefined)];

    const result = normalizeNearbyPlacesResponse(places);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('unknown-status');
  });

  it('does not exclude a place marked CLOSED_PERMANENTLY (out of scope for this filter)', () => {
    // Only "temporarily closed" is the explicit requirement here — permanently
    // closed places are a separate concern Google's Nearby Search itself
    // generally already excludes by default.
    const places = [rawPlace('perm-closed', 0.01, 'CLOSED_PERMANENTLY')];

    const result = normalizeNearbyPlacesResponse(places);

    expect(result).toHaveLength(1);
  });

  it('drops places without usable coordinates regardless of business status', () => {
    const places: RawNearbyPlace[] = [{ id: 'no-location', displayName: { text: 'No Location' } }];

    expect(normalizeNearbyPlacesResponse(places)).toEqual([]);
  });
});

describe('temporarily closed places are excluded before the Route Matrix candidate limit is applied', () => {
  it('never lets a closed place occupy one of the top-3 candidate slots, even when it is the single nearest result', () => {
    const rawPlaces = [
      rawPlace('closed-nearest', 0.001, 'CLOSED_TEMPORARILY'), // nearest by far, but closed
      rawPlace('open-1', 0.01, 'OPERATIONAL'),
      rawPlace('open-2', 0.02, 'OPERATIONAL'),
      rawPlace('open-3', 0.03, 'OPERATIONAL'),
      rawPlace('open-4', 0.04, 'OPERATIONAL'),
    ];

    // Stage 1 (normalize/filter — where the closure check happens):
    const normalized = normalizeNearbyPlacesResponse(rawPlaces);
    expect(normalized.find((p) => p.id === 'closed-nearest')).toBeUndefined();

    // Stage 2 (the 3-candidate limit applied afterward, per the Phase 4 pipeline):
    const topCandidates = selectNearestCandidates(normalized, origin, 3);

    expect(topCandidates).toHaveLength(3);
    expect(topCandidates.some((c) => c.id === 'closed-nearest')).toBe(false);
    expect(topCandidates.map((c) => c.id)).toEqual(['open-1', 'open-2', 'open-3']);
  });
});
