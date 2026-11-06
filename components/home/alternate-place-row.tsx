import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { PLACE_ICON_SIZE } from '@/components/home/place-list-card';
import { PlaceThumbnail } from '@/components/home/place-thumbnail';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, FeasibilityColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { displayPlaceText } from '@/lib/display-text';
import { openPlaceInGoogleMaps } from '@/lib/prayer-places/navigation';
import { formatClock12, getArrivalOutcome, offsetClock } from '@/lib/time';
import type { PlanningContext, PrayerPlace, PrayerWindow } from '@/types/home';

/** A lighter-weight row (no card of its own) so alternates never compete with the hero. */
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

  const colors = FeasibilityColors[place.feasibility];

  return (
    <TouchableOpacity
      disabled={!onPress}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      accessibilityRole={onPress ? 'button' : undefined}
      style={styles.row}>
      <PlaceThumbnail size={PLACE_ICON_SIZE} />

      {/* Full name (up to 2 lines), address on one line, then drive time,
          distance and a short status — kept deliberately sparse. */}
      <View style={styles.info}>
        <ThemedText type="defaultSemiBold" style={styles.name} numberOfLines={2}>
          {displayPlaceText(place.name)}
        </ThemedText>
        {place.area ? (
          <ThemedText style={[styles.area, { color: theme.textSecondary }]} numberOfLines={1}>
            {displayPlaceText(place.area)}
          </ThemedText>
        ) : null}
        <View style={styles.statsLine}>
          <View style={[styles.etaChip, { backgroundColor: colors.background }]}>
            <IconSymbol name="car.fill" size={12} color={statusColor} />
            <ThemedText style={[styles.eta, { color: statusColor }]}>{place.etaMinutes} min</ThemedText>
          </View>
          <ThemedText style={[styles.distance, { color: theme.textMuted }]}>{place.distanceKm.toFixed(1)} km</ThemedText>
          {statusLabel ? (
            <>
              <View style={[styles.dot, { backgroundColor: theme.textMuted }]} />
              <ThemedText style={[styles.statusLabel, { color: statusColor }]} numberOfLines={1}>
                {statusLabel}
              </ThemedText>
            </>
          ) : null}
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

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
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
  statsLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 7,
    rowGap: 4,
    marginTop: 4,
  },
  etaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  eta: {
    fontSize: 12,
    fontWeight: '800',
  },
  distance: {
    fontSize: 12,
    fontWeight: '500',
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  mapsButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
