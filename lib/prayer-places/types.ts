export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

/** A candidate prayer place as returned by the discovery layer, before any local ranking/enrichment. */
export interface PrayerPlaceCandidate {
  id: string;
  name: string;
  area: string;
  coordinates: GeoCoordinates;
}

/** A candidate after local distance/ETA enrichment, before feasibility is computed against a specific prayer window. */
export interface RankedPrayerPlaceCandidate {
  id: string;
  name: string;
  area: string;
  coordinates: GeoCoordinates;
  distanceKm: number;
  etaMinutes: number;
  /** Google Routes' own condition for this route (always `'ROUTE_EXISTS'` today, since only 'ok' outcomes reach this type) — preserved as session data per docs/05, not currently surfaced in any UI. */
  routeCondition: string;
}
