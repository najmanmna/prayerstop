// Pure coordinate-parsing/formatting helpers — no Supabase, no DOM, fully
// unit-testable. Carries forward the exact fixes found necessary in the
// Step 6B local review tool: full precision on display (never round a
// pasted coordinate for redisplay — a truncated echo reads as "did this
// actually save?" even when it did), and a distinct "empty" vs "error"
// parse result so an empty box never blocks saving other fields.

export const COORD_UNCHANGED_THRESHOLD_M = 1; // treat as "same point" below this
export const SRI_LANKA_BOUNDS = { latMin: 5.5, latMax: 10.0, lonMin: 79.0, lonMax: 82.5 };

export function parseCoordPair(text) {
  if (!text || !text.trim()) return { empty: true };
  const parts = text.split(',').map((p) => p.trim()).filter((p) => p.length);
  if (parts.length !== 2) return { error: 'Expected exactly two comma-separated numbers: latitude, longitude.' };
  const lat = Number(parts[0]);
  const lon = Number(parts[1]);
  if (!isFinite(lat) || !isFinite(lon)) return { error: 'Could not parse both values as numbers.' };
  if (lat < -90 || lat > 90) return { error: `Latitude ${lat} is out of range (must be between -90 and 90).` };
  if (lon < -180 || lon > 180) return { error: `Longitude ${lon} is out of range (must be between -180 and 180).` };
  const withinSriLanka =
    lat >= SRI_LANKA_BOUNDS.latMin && lat <= SRI_LANKA_BOUNDS.latMax && lon >= SRI_LANKA_BOUNDS.lonMin && lon <= SRI_LANKA_BOUNDS.lonMax;
  return { lat, lon, warning: withinSriLanka ? null : "This looks far from Sri Lanka's usual range — double-check you copied the right value." };
}

export function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dphi = toRad(lat2 - lat1);
  const dl = toRad(lon2 - lon1);
  const a = Math.sin(dphi / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function formatDistance(m) {
  return m < 1000 ? `${m.toFixed(1)} m` : `${(m / 1000).toFixed(2)} km`;
}

/** Full precision, never rounded — see file header for why. */
export function fmtCoord(v) {
  return v === null || v === undefined ? '—' : String(v);
}

/**
 * Given the current stored coordinate and a freshly parsed one, decides
 * whether this save is a no-op confirmation ("verify") or a real change
 * ("correct") — the exact same rule the database-backed decision hinges
 * on, computed here purely so the UI can preview it before saving.
 */
export function classifyCoordinateSave(current, parsed) {
  if (parsed.error) return { kind: 'blocked', reason: parsed.error };
  const hasCurrent = current && current.latitude !== null && current.latitude !== undefined;
  if (parsed.empty) {
    return hasCurrent ? { kind: 'unchanged' } : { kind: 'blocked', reason: 'No coordinate yet — paste one to continue.' };
  }
  if (!hasCurrent) return { kind: 'correct', distanceM: null };
  const distanceM = haversineM(current.latitude, current.longitude, parsed.lat, parsed.lon);
  return distanceM < COORD_UNCHANGED_THRESHOLD_M ? { kind: 'unchanged', distanceM } : { kind: 'correct', distanceM };
}

export function googleMapsSearchUrl(name, address, district) {
  const parts = [name, address, district, 'Sri Lanka'].filter(Boolean);
  const q = parts.length ? parts.join(', ') : 'Sri Lanka';
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
}
