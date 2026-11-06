import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { PLACE_ICON_SIZE } from '@/components/home/place-list-card';
import { PlaceThumbnail } from '@/components/home/place-thumbnail';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { displayPlaceText } from '@/lib/display-text';
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
      <PlaceThumbnail size={PLACE_ICON_SIZE} />

      {/* Same layout as AlternatePlaceRow: full name, one-line address, distance below. */}
      <View style={styles.info}>
        <ThemedText type="defaultSemiBold" style={styles.name} numberOfLines={2}>
          {displayPlaceText(place.name)}
        </ThemedText>
        {place.area ? (
          <ThemedText style={[styles.area, { color: theme.textSecondary }]} numberOfLines={1}>
            {displayPlaceText(place.area)}
          </ThemedText>
        ) : null}
        <View style={styles.distanceLine}>
          <IconSymbol name="mappin.circle.fill" size={12} color={theme.textMuted} />
          <ThemedText style={[styles.distance, { color: theme.textMuted }]}>
            {formatStraightLineDistance(place.distanceKm)}
          </ThemedText>
        </View>
      </View>

      <TouchableOpacity
        onPress={() => openPlaceInGoogleMaps(place)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`View ${place.name} on Google Maps`}
        style={[styles.mapsButton, { backgroundColor: theme.accentSoft }]}>
        <IconSymbol name="map.fill" size={17} color={theme.tint} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

/** "850 m", "1.8 km" — straight-line, so labelled "away" rather than as a route distance. */
export function formatStraightLineDistance(distanceKm: number): string {
  return distanceKm < 1 ? `${Math.max(10, Math.round((distanceKm * 1000) / 10) * 10)} m away` : `${distanceKm.toFixed(1)} km away`;
}

const styles = StyleSheet.create({
  // Top-aligned: the thumbnail sits beside the name rather than floating
  // halfway down a 3-line text block. The map button stays centred.
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 14.5,
    lineHeight: 19,
    fontWeight: '700',
  },
  area: {
    fontSize: 12,
    lineHeight: 16,
  },
  distanceLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  distance: {
    fontSize: 12,
    fontWeight: '500',
  },
  mapsButton: {
    alignSelf: 'center',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
