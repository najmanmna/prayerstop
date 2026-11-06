import type { NearbySearchConfig } from './nearby-search-config';

/**
 * True for a Google result whose name says it's a home rather than a mosque
 * (a word from `excludedNameWords`, and no word from `mosqueNameWords`).
 * Whole words only, so "Housing Road Masjid" or "Homagama" don't match.
 */
export function isExcludedByName(
  name: string,
  config: Pick<NearbySearchConfig, 'excludedNameWords' | 'mosqueNameWords'>
): boolean {
  const words = new Set(name.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean));
  const excluded = config.excludedNameWords.some((word) => words.has(word));
  return excluded && !config.mosqueNameWords.some((word) => words.has(word));
}
