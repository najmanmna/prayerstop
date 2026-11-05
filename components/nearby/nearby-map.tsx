import type { NearbyMapProps } from './map-pin';

/**
 * Web/other platforms: no native map. Exists so importing `NearbyMap` is
 * safe everywhere without pulling in expo-maps' native views — the Nearby
 * screen checks `NEARBY_MAP_AVAILABLE` and simply doesn't render a map.
 */
export const NEARBY_MAP_AVAILABLE = false;

export function NearbyMap(_props: NearbyMapProps) {
  return null;
}
