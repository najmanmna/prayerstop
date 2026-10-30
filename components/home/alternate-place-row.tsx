import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { PlaceThumbnail } from '@/components/home/place-thumbnail';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, FeasibilityColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { openPlaceInGoogleMaps } from '@/lib/prayer-places/navigation';
import { formatClock12, getArrivalOutcome, offsetClock } from '@/lib/time';
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

  // One short status label instead of a sentence — the exact minutes live on
  // the Home card and in Place Details. `place.feasibility` already encodes
  // comfortable/tight/too-late correctly for this context.
  let statusLabel: string | null;
  if (context === 'next') {
    statusLabel = `Leave by ${formatClock12(leaveByTime)}`;
  } else if (outcome.status === 'unknown') {
    statusLabel = null; // no listed end time (Isha) — nothing factual to label
  } else if (outcome.overflow) {
    statusLabel = 'Too late to reach';
  } else {
    statusLabel = place.feasibility === 'tight' ? 'Just in time' : 'In time';
  }

  return (
    <TouchableOpacity
      disabled={!onPress}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      accessibilityRole={onPress ? 'button' : undefined}
      style={styles.row}>
      <PlaceThumbnail size={44} />

      {/* Full name (up to 2 lines), address on one line, then just drive
          time + distance and a status label — kept deliberately sparse. */}
      <View style={styles.info}>
        <ThemedText type="defaultSemiBold" style={styles.name} numberOfLines={2}>
          {place.name}
        </ThemedText>
        {place.area ? (
          <ThemedText style={[styles.area, { color: theme.textSecondary }]} numberOfLines={1}>
            {place.area}
          </ThemedText>
        ) : null}
        <View style={styles.statsLine}>
          <IconSymbol name="location.north.fill" size={11} color={statusColor} />
          <ThemedText style={[styles.eta, { color: statusColor }]}>{place.etaMinutes} min</ThemedText>
          <ThemedText style={[styles.distance, { color: theme.textMuted }]}>· {place.distanceKm.toFixed(1)} km</ThemedText>
          {statusLabel ? (
            <View style={[styles.statusPill, { backgroundColor: FeasibilityColors[place.feasibility].background }]}>
              <ThemedText style={[styles.statusLabel, { color: statusColor }]} numberOfLines={1}>
                {statusLabel}
              </ThemedText>
            </View>
          ) : null}
        </View>
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
  statsLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 4,
    rowGap: 4,
    marginTop: 2,
  },
  eta: {
    fontSize: 13,
    fontWeight: '700',
  },
  distance: {
    fontSize: 12,
  },
  statusPill: {
    marginLeft: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  mapsButton: {
    padding: 4,
  },
});
