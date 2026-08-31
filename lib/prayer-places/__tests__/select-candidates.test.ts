import { selectNearestCandidates } from '../select-candidates';
import type { PrayerPlaceCandidate } from '../types';

const origin = { latitude: 6.9271, longitude: 79.8612 };

function candidate(id: string, offsetDegrees: number): PrayerPlaceCandidate {
  return {
    id,
    name: `Place ${id}`,
    area: 'Colombo',
    coordinates: { latitude: origin.latitude + offsetDegrees, longitude: origin.longitude + offsetDegrees },
  };
}

describe('selectNearestCandidates', () => {
  it('caps the result at the given limit even with many more candidates', () => {
    const candidates = [
      candidate('far', 0.1),
      candidate('near', 0.001),
      candidate('mid', 0.02),
      candidate('farther', 0.2),
      candidate('farthest', 0.3),
    ];

    const result = selectNearestCandidates(candidates, origin, 3);

    expect(result).toHaveLength(3);
  });

  it('orders results nearest-first by straight-line distance', () => {
    const candidates = [candidate('far', 0.1), candidate('near', 0.001), candidate('mid', 0.02)];

    const result = selectNearestCandidates(candidates, origin, 3);

    expect(result.map((c) => c.id)).toEqual(['near', 'mid', 'far']);
  });

  it('returns fewer than the limit when fewer candidates exist', () => {
    const candidates = [candidate('only', 0.01)];

    const result = selectNearestCandidates(candidates, origin, 3);

    expect(result).toHaveLength(1);
  });

  it('returns an empty array for no candidates', () => {
    expect(selectNearestCandidates([], origin, 3)).toEqual([]);
  });

  it('attaches the computed distanceKm to each result', () => {
    const candidates = [candidate('near', 0.001)];
    const result = selectNearestCandidates(candidates, origin, 3);
    expect(result[0].distanceKm).toBeGreaterThan(0);
  });

  it('still routes only the top 3 when given a full 20-candidate Places pool', () => {
    // Mirrors the real pipeline post-rankPreference=DISTANCE change: Places
    // can now return up to 20 candidates, but only the nearest 3 are ever
    // sent to Google Routes — this must hold regardless of pool size.
    const candidates = Array.from({ length: 20 }, (_, index) => candidate(`p${index}`, 0.001 * (index + 1)));

    const result = selectNearestCandidates(candidates, origin, 3);

    expect(result).toHaveLength(3);
    expect(result.map((c) => c.id)).toEqual(['p0', 'p1', 'p2']);
  });
});
