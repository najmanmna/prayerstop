/**
 * Many database records are stored in ALL CAPS ("AL-MASJIDUL FALAH",
 * "23, FORBES LANE, MARADANA"). For display only, turn all-caps text into
 * title case (anything already mixed-case keeps its casing) and drop a
 * stray trailing comma or dash.
 */
export function displayPlaceText(raw: string): string {
  // Records often end in a stray separator ("55, Lake Road,").
  const text = raw.trim().replace(/[\s,;:\-–]+$/, '');
  if (/[a-z]/.test(text) || !/[A-Z]/.test(text)) return text;
  return text.toLowerCase().replace(/(^|[\s\-(/.,'])([a-z])/g, (_, before: string, letter: string) => before + letter.toUpperCase());
}
