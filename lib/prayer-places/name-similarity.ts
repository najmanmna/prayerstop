/**
 * Words that say "this is a mosque" rather than which mosque it is. Removed
 * before comparing names, so "Masjidun Noor Jummah masjid" (NSDI) and
 * "MASJIDUN NOOR JUMMA MOSQUE" (DMRCA) compare as the same name. Includes
 * the common Sri Lankan transliteration variants seen in the DMRCA/NSDI/OSM
 * data.
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

/**
 * "Masjid-ul X" / "Masjid-un X" = "mosque of X". Usually the prefix is
 * noise ("Masjidhul Gazzali" vs "Gazzali Masjid"), but for short names it
 * also carries signal ("Masjidul Huda" vs "Masjidul Hudha"), so similarity
 * is scored both with and without these words — see `mosqueNameSimilarity`.
 */
const PREFIX_WORDS = new Set([
  'masjidul',
  'masjidhul',
  'masjidun',
  'masjidhun',
  'masjidur',
  'masjidhur',
  'masjidus',
  'masjidhus',
  'masjiduth',
  'masjidhuth',
]);

/**
 * Transliteration variants of the same word, mapped to one spelling so they
 * compare equal ("Daruth Taqwa" vs "Darul Taqwa" — "house of").
 */
const WORD_VARIANTS: Record<string, string> = {
  darul: 'dar',
  daruth: 'dar',
  darut: 'dar',
  darus: 'dar',
  dharul: 'dar',
  dharuth: 'dar',
  dharus: 'dar',
};

/**
 * Lowercases, strips punctuation/diacritics, unifies spelling variants, and
 * drops generic mosque words — and, unless `keepPrefixes`, "Masjid-ul"-style
 * prefixes too.
 */
export function normalizeMosqueName(name: string, keepPrefixes = false): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // Apostrophes join a word ("Jum'aah" → "jumaah"); other punctuation separates ("Al-Noor" → "al noor").
    .replace(/['\u2018\u2019`]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((word) => WORD_VARIANTS[word] ?? word)
    .filter((word) => word.length > 0 && !GENERIC_WORDS.has(word) && (keepPrefixes || !PREFIX_WORDS.has(word)))
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
 * Scored with and without "Masjid-ul"-style prefixes; the higher score
 * wins (see `PREFIX_WORDS`).
 *
 * Returns 0 — never a match — when either name has no distinctive words
 * left after normalization (e.g. "Jumma Mosque", "Masjidul"): a generic
 * name can't confirm which mosque something is.
 */
export function mosqueNameSimilarity(a: string, b: string): number {
  const strictA = normalizeMosqueName(a);
  const strictB = normalizeMosqueName(b);
  if (!strictA || !strictB) return 0;
  return Math.max(
    normalizedSimilarity(strictA, strictB),
    normalizedSimilarity(normalizeMosqueName(a, true), normalizeMosqueName(b, true))
  );
}

function normalizedSimilarity(normalizedA: string, normalizedB: string): number {
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
