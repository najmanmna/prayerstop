import { mosqueNameSimilarity, normalizeMosqueName } from '../name-similarity';

describe('normalizeMosqueName', () => {
  it('drops generic mosque words, punctuation, and case', () => {
    expect(normalizeMosqueName('Masjidun Noor Jummah masjid')).toBe('masjidun noor');
    expect(normalizeMosqueName('MASJIDUN NOOR JUMMA MOSQUE')).toBe('masjidun noor');
    expect(normalizeMosqueName("Masjidh Al-Noor Jum'aah")).toBe('al noor');
  });
});

describe('mosqueNameSimilarity', () => {
  it('treats the same mosque across NSDI/DMRCA spellings as identical', () => {
    expect(mosqueNameSimilarity('Masjidun Noor Jummah masjid', 'MASJIDUN NOOR JUMMA MOSQUE')).toBe(1);
  });

  it('matches when one name is the other plus a locality prefix', () => {
    expect(mosqueNameSimilarity('Masjidul Huda', 'HINGULOYA MASJIDUL HUDA JUMMA MOSQUE')).toBe(1);
  });

  it('tolerates small transliteration differences', () => {
    expect(mosqueNameSimilarity('Masjidul Hudha', 'Masjidul Huda')).toBeGreaterThanOrEqual(0.6);
  });

  it('scores clearly different mosques low', () => {
    expect(mosqueNameSimilarity('Masjidul Akbar', 'Maberiya Masjidh')).toBeLessThan(0.6);
  });

  it('never matches on a purely generic name', () => {
    expect(mosqueNameSimilarity('Jumma Mosque', 'Jumma Masjid')).toBe(0);
    expect(mosqueNameSimilarity('Mosque', 'Masjidun Noor')).toBe(0);
  });
});
