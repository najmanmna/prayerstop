/**
 * Many database records are stored in ALL CAPS ("AL-MASJIDUL FALAH",
 * "23, FORBES LANE, MARADANA"). For display only, turn all-caps text into
 * title case; anything already mixed-case is left exactly as written.
 */
export function displayPlaceText(text: string): string {
  if (/[a-z]/.test(text) || !/[A-Z]/.test(text)) return text;
  return text.toLowerCase().replace(/(^|[\s\-(/.,'])([a-z])/g, (_, before: string, letter: string) => before + letter.toUpperCase());
}
