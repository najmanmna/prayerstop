import { GoogleMaps } from 'expo-maps';
import { StyleSheet } from 'react-native';

import type { NearbyMapProps } from './map-pin';

/**
 * Turn on ONLY once the installed Android build includes the Google Maps API
 * key (app.json → android.config.googleMaps.apiKey, baked into the native
 * manifest at build time). Google Maps crashes the app if a map is created
 * in a build without the key, and app config served by the dev server can't
 * tell us what the installed native build contains — so this is an explicit
 * switch, flipped when a build with the key is installed.
 */
export const NEARBY_MAP_AVAILABLE = true;

/**
 * Google Maps on Android via expo-maps. Deliberately NO `mapId`: map loads
 * without a map ID bill under Google's "Maps SDK" SKU, whose free usage is
 * unlimited (verified 2026-10-29); a map ID would move them to the paid
 * "Dynamic Maps" SKU. Shows the session's places as pins; never fetches
 * anything itself.
 */
export function NearbyMap({ pins, userCoords, selectedPinId, onSelectPin }: NearbyMapProps) {
  const center = userCoords ?? pins[0]?.coordinates ?? { latitude: 6.9271, longitude: 79.8612 };

  return (
    <GoogleMaps.View
      style={styles.map}
      cameraPosition={{ coordinates: center, zoom: 13 }}
      properties={{ isMyLocationEnabled: userCoords !== null }}
      uiSettings={{ myLocationButtonEnabled: true, compassEnabled: false, mapToolbarEnabled: false }}
      markers={pins.map((pin) => ({
        id: pin.id,
        coordinates: pin.coordinates,
        title: pin.name,
        snippet: pin.detail,
        zIndex: pin.id === selectedPinId ? 1 : 0,
      }))}
      onMarkerClick={(marker) => {
        if (marker.id) onSelectPin(marker.id);
      }}
    />
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
});
