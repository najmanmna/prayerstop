import { AppleMaps } from 'expo-maps';
import { StyleSheet } from 'react-native';

import type { NearbyMapProps } from './map-pin';

export const NEARBY_MAP_AVAILABLE = true;

// Approved accent green (constants/theme.ts); darker when selected — matches the Android pins.
const DEFAULT_TINT = '#126B46';
const SELECTED_TINT = '#0B4A30';

/**
 * Real interactive map (Apple Maps via expo-maps) on iOS. Shows the
 * session's places as pins; never fetches anything itself.
 *
 * `onMarkerClick` requires iOS 18+ (an expo-maps constraint) — on older
 * iOS versions tapping a marker simply does nothing, but the map still
 * renders and the list below it remains fully usable.
 */
export function NearbyMap({ pins, userCoords, selectedPinId, onSelectPin }: NearbyMapProps) {
  const center = userCoords ?? pins[0]?.coordinates ?? { latitude: 6.9271, longitude: 79.8612 };

  return (
    <AppleMaps.View
      style={styles.map}
      cameraPosition={{ coordinates: center, zoom: 13 }}
      properties={{ isMyLocationEnabled: userCoords !== null, selectionEnabled: true }}
      uiSettings={{ myLocationButtonEnabled: true, compassEnabled: false }}
      markers={pins.map((pin) => ({
        id: pin.id,
        coordinates: pin.coordinates,
        title: pin.name,
        systemImage: 'mappin.circle.fill',
        tintColor: pin.id === selectedPinId ? SELECTED_TINT : DEFAULT_TINT,
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
