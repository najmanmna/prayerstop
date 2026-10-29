/**
 * Words that say "this is a mosque" rather than which mosque it is. Removed
 * before comparing names, so "Masjidun Noor Jummah masjid" (NSDI) and
 * "MASJIDUN NOOR JUMMA MOSQUE" (DMRCA) compare as "masjidun noor" both
 * times. Includes the common Sri Lankan transliteration variants seen in
 * the DMRCA/NSDI/OSM data.
 */
const GENERIC_WORDS = new Set([
  'mosque',
  'masjid',
  'masjidh',
  'masjith',
  'masjide',
  'jumma',
  'jummah',
  'juma',
  'jumuah',
  'jumah',
  'jumaah',
  'jamma',
  'jamath',
  'jamaath',
  'grand',
  'the',
  'and',
  'of',
  'new',
  'old',
]);

/** Lowercases, strips punctuation/diacritics, and drops generic mosque words. */
export function normalizeMosqueName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // Apostrophes join a word ("Jum'aah" → "jumaah"); other punctuation separates ("Al-Noor" → "al noor").
    .replace(/['\u2018\u2019`]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 0 && !GENERIC_WORDS.has(word))
    .join(' ');
}

function bigrams(value: string): string[] {
  const compact = value.replace(/\s+/g, ' ');
  const result: string[] = [];
  for (let i = 0; i < compact.length - 1; i++) {
    result.push(compact.slice(i, i + 2));
  }
  return result;
}

/**
 * Similarity of two mosque names, 0–1. Sørensen–Dice over character
 * bigrams of the normalized names (tolerant of transliteration like
 * "hudha"/"huda"), raised to 1 when one name's distinctive words are all
 * contained in the other's ("Masjidul Huda" vs "Hinguloya Masjidul Huda").
 *
 * Returns 0 — never a match — when either name has no distinctive words
 * left after normalization (e.g. "Jumma Mosque"): a generic name can't
 * confirm which mosque something is.
 */
export function mosqueNameSimilarity(a: string, b: string): number {
  const normalizedA = normalizeMosqueName(a);
  const normalizedB = normalizeMosqueName(b);
  if (!normalizedA || !normalizedB) return 0;
  if (normalizedA === normalizedB) return 1;

  const wordsA = new Set(normalizedA.split(' '));
  const wordsB = new Set(normalizedB.split(' '));
  const [smaller, larger] = wordsA.size <= wordsB.size ? [wordsA, wordsB] : [wordsB, wordsA];
  // Containment only counts when the contained name has a real word in it —
  // "al" alone being contained in "Al Noor" proves nothing.
  if ([...smaller].some((word) => word.length >= 3) && [...smaller].every((word) => larger.has(word))) return 1;

  const bigramsA = bigrams(normalizedA);
  const bigramsB = bigrams(normalizedB);
  if (bigramsA.length === 0 || bigramsB.length === 0) return 0;

  const remaining = new Map<string, number>();
  for (const gram of bigramsB) remaining.set(gram, (remaining.get(gram) ?? 0) + 1);
  let overlap = 0;
  for (const gram of bigramsA) {
    const count = remaining.get(gram) ?? 0;
    if (count > 0) {
      overlap++;
      remaining.set(gram, count - 1);
    }
  }
  return (2 * overlap) / (bigramsA.length + bigramsB.length);
}
