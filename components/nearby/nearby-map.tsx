import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { GeoCoordinates } from '@/lib/prayer-places/types';
import type { PrayerPlace } from '@/types/home';

/**
 * Non-iOS fallback. The Nearby screen only offers the Map toggle on iOS
 * (see nearby-map.ios.tsx and docs/05), so this should not normally render —
 * it exists so importing `NearbyMap` is safe on every platform without
 * pulling in expo-maps' iOS-only native view.
 */
export function NearbyMap(_props: {
  places: PrayerPlace[];
  userCoords: GeoCoordinates | null;
  selectedPlaceId: string | null;
  onSelectPlace: (id: string) => void;
}) {
  return (
    <View style={styles.fallback}>
      <ThemedText>Map view isn&apos;t available on this platform yet.</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
});
