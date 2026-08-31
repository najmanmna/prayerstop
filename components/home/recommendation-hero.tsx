import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';

import { PlaceThumbnail } from '@/components/home/place-thumbnail';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, FeasibilityColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { openExternalNavigation, openPlaceInGoogleMaps } from '@/lib/prayer-places/navigation';
import { formatClock12, formatDuration, getArrivalOutcome, offsetClock } from '@/lib/time';
import type { PlanningContext, PrayerPlace, PrayerWindow } from '@/types/home';

export function RecommendationHero({
  place,
  window,
  context,
  onPress,
}: {
  place: PrayerPlace;
  window: PrayerWindow;
  context: PlanningContext;
  /** Opens the place's Details screen. Omit to render the card inert (used only in contexts with no Details destination). */
  onPress?: () => void;
}) {
  const theme = Colors[useColorScheme() ?? 'light'];
  const isNow = context === 'now';
  // NOW-only: getArrivalOutcome(window, place.arrivalTime) compares an
  // arrival time computed from "now" against the *active* window's real
  // start/end — safe only when window and "now" are the same effective
  // calendar day, which holds for NOW but not for NEXT (e.g. planning for
  // tomorrow's Fajr from late tonight would otherwise falsely compare
  // "23:50 tonight" as later than "04:45 tomorrow"). Never derive
  // `statusColor` from this for NEXT — `place.feasibility` (below) is
  // already correctly computed per-context by build-place-scenario.ts.
  const outcome = isNow ? getArrivalOutcome(window, place.arrivalTime) : { status: 'unknown' as const };
  const statusColor = FeasibilityColors[place.feasibility].foreground;
  const leaveByTime = offsetClock(window.startTime, -place.etaMinutes);
  const driveDetail = `${place.etaMinutes} min drive · ${place.distanceKm.toFixed(1)} km`;

  // One dominant, colored headline answers "can I make it, and by when" at a
  // glance; a single small caption underneath carries the supporting
  // numbers (drive time, distance, arrival) — replacing what used to be the
  // same handful of facts repeated across a separate ETA chip, a two-column
  // stat pill, and an optional overflow note.
  let headline: string;
  let headlineColor = statusColor;
  let caption: string;
  if (!isNow) {
    headline = `Leave by ${formatClock12(leaveByTime)}`;
    caption = `${driveDetail} · Arrive by ${formatClock12(window.startTime)}`;
  } else if (outcome.status === 'unknown') {
    headline = 'No deadline data';
    headlineColor = theme.textMuted;
    caption = `${driveDetail} · Arrive ${formatClock12(place.arrivalTime)}`;
  } else if (outcome.overflow) {
    // Preserved verbatim — a recorded product decision (see CLAUDE.md /
    // docs/03-ux-and-user-flows.md), not just styling.
    headline = 'Too late to reach';
    caption = `Arrives ${formatDuration(Math.abs(outcome.remaining))} after ${window.name} ends · ${place.etaMinutes} min drive`;
  } else {
    headline = `${formatDuration(outcome.remaining)} to spare`;
    caption = `${driveDetail} · Arrive ${formatClock12(place.arrivalTime)}`;
  }

  return (
    <TouchableOpacity
      disabled={!onPress}
      onPress={onPress}
      activeOpacity={onPress ? 0.9 : 1}
      accessibilityRole={onPress ? 'button' : undefined}
      style={[styles.card, { backgroundColor: theme.surfaceElevated }, cardShadow(theme.text)]}>
      <View style={styles.headerRow}>
        <ThemedText style={[styles.overline, { color: theme.textSecondary }]}>BEST FOR {window.name.toUpperCase()}</ThemedText>
        <View style={[styles.badge, { backgroundColor: theme.accentSoft }]}>
          <ThemedText style={[styles.badgeLabel, { color: theme.tint }]}>Recommended</ThemedText>
        </View>
      </View>

      <View style={styles.placeRow}>
        <PlaceThumbnail size={56} />
        <View style={styles.placeInfo}>
          <ThemedText type="defaultSemiBold" style={styles.placeName}>
            {place.name}
          </ThemedText>
          <ThemedText style={[styles.placeArea, { color: theme.textSecondary }]}>{place.area}</ThemedText>
        </View>
      </View>

      <View style={[styles.headlineBlock, { backgroundColor: theme.surface }]}>
        <ThemedText style={[styles.headline, { color: headlineColor }]}>{headline}</ThemedText>
        <ThemedText style={[styles.caption, { color: theme.textSecondary }]}>{caption}</ThemedText>
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.85}
          onPress={() => openExternalNavigation(place.coordinates, place.id)}
          style={[styles.actionButton, { backgroundColor: theme.tint }]}>
          <IconSymbol name="location.north.fill" size={15} color="#FFFFFF" />
          <ThemedText type="defaultSemiBold" style={styles.primaryActionLabel}>
            Navigate
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.7}
          onPress={() => openPlaceInGoogleMaps(place.name, place.id)}
          style={[styles.actionButton, styles.secondaryAction, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <IconSymbol name="mappin.circle.fill" size={15} color={theme.tint} />
          <ThemedText type="defaultSemiBold" style={[styles.secondaryActionLabel, { color: theme.tint }]}>
            Google Maps
          </ThemedText>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function cardShadow(color: string) {
  return Platform.select({
    ios: {
      shadowColor: color,
      shadowOpacity: 0.08,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 3 },
    default: {},
  });
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 14,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  overline: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  placeInfo: {
    flex: 1,
    gap: 3,
  },
  placeName: {
    fontSize: 18,
    lineHeight: 22,
  },
  placeArea: {
    fontSize: 13,
  },
  headlineBlock: {
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 3,
  },
  headline: {
    fontSize: 21,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  caption: {
    fontSize: 13,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    paddingVertical: 11,
  },
  secondaryAction: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  primaryActionLabel: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  secondaryActionLabel: {
    fontSize: 14,
  },
});
