import { buildPlaceDetailsPath, findCandidateById } from '../find-candidate';
import type { RankedPrayerPlaceCandidate } from '../types';

function candidate(id: string): RankedPrayerPlaceCandidate {
  return {
    id,
    name: `Place ${id}`,
    area: 'Colombo',
    coordinates: { latitude: 6.9, longitude: 79.8 },
    distanceKm: 1,
    etaMinutes: 5,
    routeCondition: 'ROUTE_EXISTS',
  };
}

describe('findCandidateById', () => {
  it('finds the matching candidate by id', () => {
    const candidates = [candidate('a'), candidate('b')];
    expect(findCandidateById(candidates, 'b')?.id).toBe('b');
  });

  it('returns null when no candidate matches', () => {
    expect(findCandidateById([candidate('a')], 'missing')).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(findCandidateById([], 'a')).toBeNull();
  });
});

describe('buildPlaceDetailsPath', () => {
  it('builds the typed-route destination object for a place id', () => {
    expect(buildPlaceDetailsPath('abc123')).toEqual({ pathname: '/place/[id]', params: { id: 'abc123' } });
  });

  it('always targets the /place/[id] route regardless of the id value', () => {
    expect(buildPlaceDetailsPath('anything').pathname).toBe('/place/[id]');
  });
});
