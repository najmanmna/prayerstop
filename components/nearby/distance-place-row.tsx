import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { PlaceThumbnail } from '@/components/home/place-thumbnail';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { openPlaceInGoogleMaps } from '@/lib/prayer-places/navigation';
import type { DistanceRankedCandidate } from '@/lib/prayer-places/select-candidates';

/**
 * A place discovery found but that was never sent to Google Routes (only
 * the nearest few are — see the cost rule in CLAUDE.md). Shows straight-line
 * distance only: no ETA, no arrival time, no feasibility colour, because we
 * have no real travel data for it and must not imply any.
 */
export function DistancePlaceRow({ place, onPress }: { place: DistanceRankedCandidate; onPress: () => void }) {
  const theme = Colors[useColorScheme() ?? 'light'];

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="button" style={styles.row}>
      <PlaceThumbnail size={44} />

      {/* Same layout as AlternatePlaceRow: full name, one-line address, distance below. */}
      <View style={styles.info}>
        <ThemedText type="defaultSemiBold" style={styles.name} numberOfLines={2}>
          {place.name}
        </ThemedText>
        {place.area ? (
          <ThemedText style={[styles.area, { color: theme.textSecondary }]} numberOfLines={1}>
            {place.area}
          </ThemedText>
        ) : null}
        <ThemedText style={[styles.distance, { color: theme.textMuted }]}>
          {formatStraightLineDistance(place.distanceKm)}
        </ThemedText>
      </View>

      <TouchableOpacity
        onPress={() => openPlaceInGoogleMaps(place)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={`View ${place.name} on Google Maps`}
        style={styles.mapsButton}>
        <IconSymbol name="mappin.circle.fill" size={22} color={theme.tint} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

/** "850 m", "1.8 km" — straight-line, so labelled "away" rather than as a route distance. */
export function formatStraightLineDistance(distanceKm: number): string {
  return distanceKm < 1 ? `${Math.max(10, Math.round((distanceKm * 1000) / 10) * 10)} m away` : `${distanceKm.toFixed(1)} km away`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  info: {
    flex: 1,
    gap: 3,
  },
  name: {
    fontSize: 15,
    lineHeight: 20,
  },
  area: {
    fontSize: 12,
    lineHeight: 16,
  },
  distance: {
    fontSize: 12,
    marginTop: 2,
  },
  mapsButton: {
    padding: 4,
  },
});
