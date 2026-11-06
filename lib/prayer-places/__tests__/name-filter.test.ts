import { isExcludedByName } from '../name-filter';
import { NEARBY_SEARCH_CONFIG } from '../nearby-search-config';

const excluded = (name: string) => isExcludedByName(name, NEARBY_SEARCH_CONFIG);

describe('isExcludedByName', () => {
  it.each(['Ahamed House', "Fathima's Residence", 'Rizvi Home', 'Green Residencies Residency', 'HOUSE OF RAZEEN'])(
    'drops "%s"',
    (name) => {
      expect(excluded(name)).toBe(true);
    }
  );

  it.each(['Prayer House', 'Masjid Noor House', 'Jumma Mosque Residence Road', 'Thakkiya Home'])(
    'keeps "%s" (also has a mosque word)',
    (name) => {
      expect(excluded(name)).toBe(false);
    }
  );

  it.each(['Homagama Jumma Masjid', 'Housing Scheme Mosque', 'Al Masjidul Bukhary Thaika', 'Dewatagaha Mosque'])(
    'keeps "%s" (whole words only)',
    (name) => {
      expect(excluded(name)).toBe(false);
    }
  );
});
