import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { PlaceThumbnail } from '@/components/home/place-thumbnail';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, FeasibilityColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { openPlaceInGoogleMaps } from '@/lib/prayer-places/navigation';
import { formatClock12, formatDuration, getArrivalOutcome, offsetClock } from '@/lib/time';
import type { PlanningContext, PrayerPlace, PrayerWindow } from '@/types/home';

/** Deliberately a plain row, not a card — reads as a lighter-weight alternative to the hero. */
export function AlternatePlaceRow({
  place,
  window,
  context,
  onPress,
}: {
  place: PrayerPlace;
  window: PrayerWindow;
  context: PlanningContext;
  /** Opens the place's Details screen. Omit to render the row inert. */
  onPress?: () => void;
}) {
  const theme = Colors[useColorScheme() ?? 'light'];
  const isNow = context === 'now';
  // NOW-only: see the identical comment in recommendation-hero.tsx — this
  // comparison is only safe when `window` and "now" are the same effective
  // calendar day, which doesn't hold for NEXT (e.g. tonight vs. tomorrow's
  // Fajr). `place.feasibility` (used for `statusColor` below) is already
  // correctly computed per-context by build-place-scenario.ts.
  const outcome = isNow ? getArrivalOutcome(window, place.arrivalTime) : { status: 'unknown' as const };
  const statusColor = FeasibilityColors[place.feasibility].foreground;
  const leaveByTime = offsetClock(window.startTime, -place.etaMinutes);

  let remainingText: string;
  if (context === 'next') {
    remainingText = `Leave by ${formatClock12(leaveByTime)}`;
  } else if (outcome.status === 'unknown') {
    remainingText = 'No deadline data';
  } else if (outcome.overflow) {
    remainingText = 'Too late to reach';
  } else {
    remainingText = `${formatDuration(outcome.remaining)} left`;
  }

  return (
    <TouchableOpacity
      disabled={!onPress}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      accessibilityRole={onPress ? 'button' : undefined}
      style={styles.row}>
      <PlaceThumbnail size={48} />

      <View style={styles.info}>
        <ThemedText type="defaultSemiBold" style={styles.name} numberOfLines={1}>
          {place.name}
        </ThemedText>
        <ThemedText style={[styles.area, { color: theme.textSecondary }]}>{place.area}</ThemedText>
      </View>

      <View style={styles.stats}>
        <View style={styles.etaRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <IconSymbol name="location.north.fill" size={11} color={statusColor} />
          <ThemedText style={[styles.eta, { color: statusColor }]}>{place.etaMinutes} min</ThemedText>
        </View>
        <ThemedText style={[styles.distance, { color: theme.textMuted }]}>
          {place.distanceKm.toFixed(1)} km
        </ThemedText>
        <ThemedText style={[styles.remaining, { color: statusColor }]}>{remainingText}</ThemedText>
      </View>

      <TouchableOpacity
        onPress={() => openPlaceInGoogleMaps(place.name, place.id)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`View ${place.name} on Google Maps`}
        style={styles.mapsButton}>
        <IconSymbol name="mappin.circle.fill" size={20} color={theme.tint} />
      </TouchableOpacity>

      <IconSymbol name="chevron.right" size={16} color={theme.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 58,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 15,
  },
  area: {
    fontSize: 12,
  },
  stats: {
    alignItems: 'flex-end',
    gap: 2,
  },
  etaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  eta: {
    fontSize: 14,
    fontWeight: '700',
  },
  distance: {
    fontSize: 11,
  },
  remaining: {
    fontSize: 11,
    fontWeight: '600',
  },
  mapsButton: {
    padding: 2,
  },
});
