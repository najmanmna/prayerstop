import boundaries from '@/data/geo/sri-lanka-districts.json';

import type { GeoCoordinates } from '@/lib/prayer-places/types';

/**
 * Which ACJU prayer-time zone each district uses, exactly as printed in
 * ACJU's own zone PDFs (data/acju/zone-NN.json `regions`).
 *
 * Known limitation: ACJU puts two divisions of Ampara district —
 * Dehiaththakandiya and Padiyatalawa — in Zone 10 (Badulla/Monaragala),
 * while the rest of Ampara is Zone 08. We only have district-level
 * boundaries, so users there get Zone 08 times; the two zones differ by
 * at most 4 minutes (checked Aug–Dec 2026). "Nallur" in Zone 02 is a
 * division of Jaffna district, so it needs no special handling.
 */
export const DISTRICT_ZONES: Record<string, string> = {
  Colombo: '01',
  Gampaha: '01',
  Kalutara: '01',
  Jaffna: '02',
  Mullaitivu: '03',
  Kilinochchi: '03',
  Vavuniya: '03',
  Mannar: '04',
  Puttalam: '04',
  Anuradhapura: '05',
  Polonnaruwa: '05',
  Kurunegala: '06',
  Kandy: '07',
  Matale: '07',
  'Nuwara Eliya': '07',
  Batticaloa: '08',
  Ampara: '08',
  Trincomalee: '09',
  Badulla: '10',
  Moneragala: '10',
  Ratnapura: '11',
  Kegalle: '11',
  Galle: '12',
  Matara: '12',
  Hambantota: '13',
};

/**
 * A point outside every (simplified) district polygon but this close to one
 * — on a beach, a pier, or just past a coastline the simplification
 * smoothed — still belongs to that district. Beyond it, the user is treated
 * as outside Sri Lanka rather than guessed into a zone.
 */
export const COASTAL_TOLERANCE_METERS = 5000;

export type PrayerZoneResolution =
  | { status: 'ok'; zoneId: string; district: string }
  | { status: 'outside' };

type Ring = number[][]; // [lng, lat] pairs
type DistrictRings = Record<string, Ring[]>;

const DISTRICT_RINGS = boundaries.districts as DistrictRings;

/** Even-odd point-in-polygon across all of a district's rings (so holes and multi-part districts both just work). */
function containsPoint(rings: Ring[], longitude: number, latitude: number): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > latitude !== yj > latitude && longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
  }
  return inside;
}

/** Distance in metres from a point to a district's nearest edge (equirectangular — accurate enough at Sri Lanka's scale for a 5 km tolerance). */
function distanceToEdgeMeters(rings: Ring[], longitude: number, latitude: number): number {
  const metersPerDegLat = 111_320;
  const metersPerDegLng = 111_320 * Math.cos((latitude * Math.PI) / 180);
  let best = Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const ax = (ring[i][0] - longitude) * metersPerDegLng;
      const ay = (ring[i][1] - latitude) * metersPerDegLat;
      const bx = (ring[i + 1][0] - longitude) * metersPerDegLng;
      const by = (ring[i + 1][1] - latitude) * metersPerDegLat;
      const dx = bx - ax;
      const dy = by - ay;
      const lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return best;
}

/**
 * The ACJU prayer zone for a location: the district it falls in, or the
 * nearest district within `COASTAL_TOLERANCE_METERS`; otherwise `outside`.
 * Never falls back to a default zone — showing another zone's times would
 * be presenting wrong prayer times as right.
 */
export function resolvePrayerZone(
  coords: GeoCoordinates,
  districtRings: DistrictRings = DISTRICT_RINGS
): PrayerZoneResolution {
  const { latitude, longitude } = coords;

  for (const [district, rings] of Object.entries(districtRings)) {
    if (containsPoint(rings, longitude, latitude)) {
      const zoneId = DISTRICT_ZONES[district];
      if (zoneId) return { status: 'ok', zoneId, district };
    }
  }

  let nearest: { district: string; meters: number } | null = null;
  for (const [district, rings] of Object.entries(districtRings)) {
    const meters = distanceToEdgeMeters(rings, longitude, latitude);
    if (!nearest || meters < nearest.meters) nearest = { district, meters };
  }
  if (nearest && nearest.meters <= COASTAL_TOLERANCE_METERS && DISTRICT_ZONES[nearest.district]) {
    return { status: 'ok', zoneId: DISTRICT_ZONES[nearest.district], district: nearest.district };
  }
  return { status: 'outside' };
}

export interface StoredPrayerZone {
  zoneId: string;
  district: string;
}

export type PrayerZoneState =
  | {
      status: 'ok';
      zoneId: string;
      district: string;
      /** `last-known-location`: no fix right now (still locating, or permission/GPS failed) — using the zone from the last successful fix. */
      basis: 'current-location' | 'last-known-location';
    }
  /** Still locating, and no zone remembered from a previous launch. */
  | { status: 'resolving' }
  /** The current fix is outside Sri Lanka. A remembered zone is NOT used — the user has left it. */
  | { status: 'outside' }
  /** No location (denied/failed) and no zone remembered — we can't know which timetable applies. */
  | { status: 'needs-location' };

export interface PrayerZoneInputs {
  deviceStatus: 'idle' | 'requesting' | 'granted' | 'denied' | 'error';
  coords: GeoCoordinates | null;
  /** The zone saved from the last successful resolution, if any. */
  stored: StoredPrayerZone | null;
  /** False until the stored zone has been read — so "nothing stored" isn't concluded too early. */
  storageLoaded: boolean;
}

/**
 * Decides which ACJU zone's timetable to show. A current fix always wins;
 * without one, the last-known zone is used (users rarely change zone, and
 * this makes times appear instantly on launch); with neither, an explicit
 * non-ok state — never a default zone.
 */
export function decidePrayerZone(
  { deviceStatus, coords, stored, storageLoaded }: PrayerZoneInputs,
  resolve: (coords: GeoCoordinates) => PrayerZoneResolution = resolvePrayerZone
): PrayerZoneState {
  if (deviceStatus === 'granted' && coords) {
    const resolution = resolve(coords);
    return resolution.status === 'ok'
      ? { status: 'ok', zoneId: resolution.zoneId, district: resolution.district, basis: 'current-location' }
      : { status: 'outside' };
  }
  if (stored && DISTRICT_ZONES[stored.district] === stored.zoneId) {
    return { status: 'ok', zoneId: stored.zoneId, district: stored.district, basis: 'last-known-location' };
  }
  if (!storageLoaded || deviceStatus === 'idle' || deviceStatus === 'requesting') {
    return { status: 'resolving' };
  }
  return { status: 'needs-location' };
}

/** Why prayer times can't be shown, for a non-ok zone state — factual, and says what would fix it. */
export function prayerZoneUnavailableReason(state: Exclude<PrayerZoneState, { status: 'ok' }>): string {
  switch (state.status) {
    case 'resolving':
      return 'Finding your location to choose the right ACJU prayer timetable for your area…';
    case 'outside':
      return 'ACJU prayer times cover Sri Lanka only, and your current location appears to be outside Sri Lanka.';
    case 'needs-location':
      return 'PrayerStop needs your location to choose the right ACJU prayer timetable for your area. Allow location access to see prayer times.';
  }
}
