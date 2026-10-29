import { collapseLocalDuplicates, hasSufficientLocalCoverage, mergeNearbyPlaces, sortByDistance } from '../merge-nearby-places';
import { NEARBY_SEARCH_CONFIG } from '../nearby-search-config';
import type { GeoCoordinates, PrayerPlaceCandidate } from '../types';

const origin: GeoCoordinates = { latitude: 6.9271, longitude: 79.8612 };
// ~1.1 m per 0.00001° of latitude.
const METRE = 0.000009;

function at(northMetres: number): GeoCoordinates {
  return { latitude: origin.latitude + northMetres * METRE, longitude: origin.longitude };
}

function local(recordId: string, name: string, coordinates: GeoCoordinates, googlePlaceId: string | null = null): PrayerPlaceCandidate {
  return { id: `db:${recordId}`, source: 'database', localRecordId: recordId, googlePlaceId, name, area: 'Colombo', coordinates };
}

function google(placeId: string, name: string, coordinates: GeoCoordinates): PrayerPlaceCandidate {
  return { id: `google:${placeId}`, source: 'google', localRecordId: null, googlePlaceId: placeId, name, area: 'Colombo', coordinates };
}

describe('hasSufficientLocalCoverage', () => {
  const config = { minLocalResults: 3, localSufficiencyRadiusMeters: 2000 };

  it('is sufficient with enough verified mosques inside the sufficiency radius', () => {
    const places = [local('a', 'A', at(100)), local('b', 'B', at(500)), local('c', 'C', at(1500))];
    expect(hasSufficientLocalCoverage(places, origin, config)).toBe(true);
  });

  it('is not sufficient when there are too few', () => {
    expect(hasSufficientLocalCoverage([local('a', 'A', at(100)), local('b', 'B', at(500))], origin, config)).toBe(false);
  });

  it('does not count mosques beyond the sufficiency radius, even inside the search radius', () => {
    const places = [local('a', 'A', at(100)), local('b', 'B', at(500)), local('c', 'C', at(4000))];
    expect(hasSufficientLocalCoverage(places, origin, config)).toBe(false);
  });
});

describe('mergeNearbyPlaces', () => {
  it('removes a Google result that is the same mosque as a local record, keeping the local record', () => {
    const localPlace = local('nsdi-28480', 'Masjidun Noor Jummah masjid', at(200));
    const duplicate = google('ChIJnoor', 'MASJIDUN NOOR JUMMA MOSQUE', at(230)); // 30 m away, same name
    const distinct = google('ChIJother', 'Masjid Al Akbar', at(800));

    const result = mergeNearbyPlaces(origin, [localPlace], [duplicate, distinct], NEARBY_SEARCH_CONFIG);

    expect(result.places.map((p) => p.id)).toEqual(['db:nsdi-28480', 'google:ChIJother']);
    expect(result.duplicatesRemoved).toBe(1);
  });

  it('removes a Google result whose Place ID is already mapped to a local record', () => {
    const localPlace = local('nsdi-1', 'Jami Ul Alfar', at(200), 'ChIJalfar');
    const sameListing = google('ChIJalfar', 'Red Mosque', at(400)); // name/position differ, ID doesn't

    const result = mergeNearbyPlaces(origin, [localPlace], [sameListing], NEARBY_SEARCH_CONFIG);

    expect(result.places.map((p) => p.id)).toEqual(['db:nsdi-1']);
    expect(result.links).toEqual([]);
  });

  it('proposes saving the Place ID for a confident, unambiguous match and uses it in the response', () => {
    const localPlace = local('nsdi-28480', 'Masjidun Noor Jummah masjid', at(200));
    const match = google('ChIJnoor', 'Masjidun Noor Mosque', at(220));

    const result = mergeNearbyPlaces(origin, [localPlace], [match], NEARBY_SEARCH_CONFIG);

    expect(result.links).toEqual([{ localRecordId: 'nsdi-28480', googlePlaceId: 'ChIJnoor' }]);
    expect(result.places[0]).toMatchObject({ id: 'db:nsdi-28480', source: 'database', googlePlaceId: 'ChIJnoor' });
  });

  it('does not save a mapping when two local records plausibly match the same Google result', () => {
    const localA = local('nsdi-1', 'Masjidun Noor', at(200));
    const localB = local('dmrca-9', 'Masjidun Noor Jumma Mosque', at(230));
    const match = google('ChIJnoor', 'Masjidun Noor', at(215));

    const result = mergeNearbyPlaces(origin, [localA, localB], [match], NEARBY_SEARCH_CONFIG);

    expect(result.links).toEqual([]);
    // Still a duplicate for display purposes — just not confident enough to persist.
    expect(result.places.map((p) => p.source)).toEqual(['database', 'database']);
  });

  it('does not save a mapping when two Google listings both match the same local record', () => {
    const localPlace = local('nsdi-1', 'Masjidun Noor', at(200));
    const listingA = google('ChIJa', 'Masjidun Noor', at(210));
    const listingB = google('ChIJb', 'Masjidun Noor Jumma Masjid', at(190));

    const result = mergeNearbyPlaces(origin, [localPlace], [listingA, listingB], NEARBY_SEARCH_CONFIG);

    expect(result.links).toEqual([]);
    expect(result.places.map((p) => p.id)).toEqual(['db:nsdi-1']);
  });

  it('never overwrites an existing, different mapping', () => {
    const localPlace = local('nsdi-1', 'Masjidun Noor', at(200), 'ChIJexisting');
    const match = google('ChIJnew', 'Masjidun Noor', at(210));

    const result = mergeNearbyPlaces(origin, [localPlace], [match], NEARBY_SEARCH_CONFIG);

    expect(result.links).toEqual([]);
    expect(result.places[0].googlePlaceId).toBe('ChIJexisting');
  });

  it('treats a same-building Google result with a different name as a duplicate, but never maps it', () => {
    const localPlace = local('nsdi-22326', 'Masjidul Akbar Jumma Mosque', at(200));
    const sameBuilding = google('ChIJmaberiya', 'Maberiya Jummah Masjidh', at(207)); // ~7 m

    const result = mergeNearbyPlaces(origin, [localPlace], [sameBuilding], NEARBY_SEARCH_CONFIG);

    expect(result.places.map((p) => p.id)).toEqual(['db:nsdi-22326']);
    expect(result.links).toEqual([]);
  });

  it('catches a strong name match whose Google pin is a little further away, without saving its Place ID (real Dehiwala case)', () => {
    const localPlace = local('dmrca-R-2597-C-24-2', 'MASJIDHUL GAZZALI', at(200));
    const googlePin = google('ChIJfVVcJOBa4joR55ynz_trIKw', 'Gazzali Masjid', at(255)); // 55 m

    const result = mergeNearbyPlaces(origin, [localPlace], [googlePin], NEARBY_SEARCH_CONFIG);

    expect(result.places.map((p) => p.id)).toEqual(['db:dmrca-R-2597-C-24-2']);
    expect(result.duplicatesRemoved).toBe(1);
    expect(result.links).toEqual([]); // beyond the 50 m Place ID threshold
  });

  it('catches Darul/Daruth spelling variants at a typical Google pin offset (real Dehiwala case)', () => {
    const localPlace = local('dmrca-R-2226-C-21-7', 'DARUTH TAQWA AL QURAN MADRASA MASJID', at(200));
    const googlePin = google('ChIJvb9XoFVa4joRxH_by7A-h-w', 'Masjid Darul Taqwa', at(262)); // 62 m

    expect(mergeNearbyPlaces(origin, [localPlace], [googlePin], NEARBY_SEARCH_CONFIG).places).toHaveLength(1);
  });

  it('does not treat a strong name match beyond the strong-match distance as the same mosque', () => {
    const localPlace = local('dmrca-R-1014-C-104', 'MASJIDUL AZHARIYAH', at(200));
    const googlePin = google('ChIJM_8W8v9R4joRfz8CaO0JA1w', 'Azhariya Jummah Masjid', at(449)); // 249 m

    expect(mergeNearbyPlaces(origin, [localPlace], [googlePin], NEARBY_SEARCH_CONFIG).places).toHaveLength(2);
  });

  it('keeps a differently named Google mosque 80 m away', () => {
    const localPlace = local('nsdi-1', 'Masjidul Akbar', at(200));
    const neighbour = google('ChIJn', 'Masjid Al Hidaya', at(280));

    expect(mergeNearbyPlaces(origin, [localPlace], [neighbour], NEARBY_SEARCH_CONFIG).places).toHaveLength(2);
  });

  it('keeps a nearby Google mosque with a different name that is beyond the same-building distance', () => {
    const localPlace = local('nsdi-1', 'Masjidul Akbar', at(200));
    const neighbour = google('ChIJn', 'Masjid Al Hidaya', at(240)); // 40 m, different name

    const result = mergeNearbyPlaces(origin, [localPlace], [neighbour], NEARBY_SEARCH_CONFIG);

    expect(result.places).toHaveLength(2);
  });

  it('returns one nearest-first list, capped at maxResults', () => {
    const locals = [local('far', 'Far', at(1500)), local('near', 'Near', at(100))];
    const googles = [google('mid', 'Masjid Mid', at(700))];

    const result = mergeNearbyPlaces(origin, locals, googles, { ...NEARBY_SEARCH_CONFIG, maxResults: 2 });

    expect(result.places.map((p) => p.id)).toEqual(['db:near', 'google:mid']);
  });
});

describe('sortByDistance', () => {
  it('prefers the verified local record on an exact distance tie', () => {
    const sorted = sortByDistance([google('g', 'G', at(100)), local('l', 'L', at(100))], origin);
    expect(sorted.map((p) => p.source)).toEqual(['database', 'google']);
  });
});

describe('collapseLocalDuplicates — duplicates inside our own verified data', () => {
  it('shows the same mosque once when it was imported from two sources (real Maradana case)', () => {
    const dmrca = local('dmrca-R-620-C-57', 'Maradana Small Jumma Masjid', at(400));
    const nsdi = local('nsdi-18539', 'MARADANA SMALL MOSQUE', at(401.6));

    const result = collapseLocalDuplicates([dmrca, nsdi], NEARBY_SEARCH_CONFIG);

    expect(result.places.map((p) => p.localRecordId)).toEqual(['nsdi-18539']);
    expect(result.collapsed).toBe(1);
  });

  it('prefers the record that already has a Google Place ID, over source priority', () => {
    const nsdi = local('nsdi-1', 'Masjidun Noor', at(100));
    const dmrca = local('dmrca-1', 'Masjidun Noor', at(105), 'ChIJx');

    expect(collapseLocalDuplicates([nsdi, dmrca], NEARBY_SEARCH_CONFIG).places.map((p) => p.localRecordId)).toEqual(['dmrca-1']);
  });

  it('collapses records at the same spot even when the names differ', () => {
    const a = local('nsdi-18695', 'Aluthkade Masjid', at(300));
    const b = local('dmrca-R-2087-C-19-7', "MASJID SA'D BIN ABI WAQQAS (RALI)", at(302.3));

    expect(collapseLocalDuplicates([a, b], NEARBY_SEARCH_CONFIG).places).toHaveLength(1);
  });

  it('keeps genuinely different neighbouring mosques', () => {
    const a = local('dmrca-R-40-C-07', 'MUHIYIDEEN JUMMA MASJID', at(300));
    const b = local('dmrca-R-782-C-65', 'MEERANIYA JUMMA MASJID', at(325));

    expect(collapseLocalDuplicates([a, b], NEARBY_SEARCH_CONFIG).places).toHaveLength(2);
  });
});
