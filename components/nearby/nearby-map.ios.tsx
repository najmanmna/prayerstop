import { AppleMaps } from 'expo-maps';
import { StyleSheet } from 'react-native';

import { FeasibilityColors } from '@/constants/theme';
import type { GeoCoordinates } from '@/lib/prayer-places/types';
import type { PrayerPlace } from '@/types/home';

/**
 * Real interactive map (Apple Maps via expo-maps), iOS only — see
 * docs/05-technical-architecture.md for why Android doesn't get a working
 * map yet (no Google Maps API key configured). Shows every candidate from
 * the current shared session as a marker; never fetches anything itself.
 *
 * `onMarkerClick` requires iOS 18+ (an expo-maps constraint) — on older
 * iOS versions tapping a marker simply does nothing, but the map still
 * renders and the List view remains fully usable as the reliable fallback.
 */
export function NearbyMap({
  places,
  userCoords,
  selectedPlaceId,
  onSelectPlace,
}: {
  places: PrayerPlace[];
  userCoords: GeoCoordinates | null;
  selectedPlaceId: string | null;
  onSelectPlace: (id: string) => void;
}) {
  const center = userCoords ?? places[0]?.coordinates ?? { latitude: 0, longitude: 0 };

  return (
    <AppleMaps.View
      style={styles.map}
      cameraPosition={{ coordinates: center, zoom: 13 }}
      properties={{ isMyLocationEnabled: userCoords !== null, selectionEnabled: true }}
      uiSettings={{ myLocationButtonEnabled: true, compassEnabled: false }}
      markers={places.map((place) => ({
        id: place.id,
        coordinates: place.coordinates,
        title: place.name,
        systemImage: 'mappin.circle.fill',
        tintColor: place.id === selectedPlaceId ? FeasibilityColors[place.feasibility].foreground : '#8E8E93',
      }))}
      onMarkerClick={(marker) => {
        if (marker.id) onSelectPlace(marker.id);
      }}
    />
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
    borderRadius: 22,
    overflow: 'hidden',
  },
});
