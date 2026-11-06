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
  // Distance is already on the place row above, so the caption keeps to timing.
  const driveDetail = `${place.etaMinutes} min drive`;

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
    // Factual: ACJU's timetable lists no end time for this prayer (Isha).
    headline = `${window.name} end time not listed`;
    headlineColor = theme.textMuted;
    caption = `${driveDetail} · Arrive ${formatClock12(place.arrivalTime)}`;
  } else if (outcome.overflow) {
    // Preserved verbatim — a recorded product decision (see CLAUDE.md /
    // docs/03-ux-and-user-flows.md), not just styling.
    headline = 'Too late to reach';
    caption = `Arrives ${formatDuration(Math.abs(outcome.remaining))} after ${window.name} ends · ${place.etaMinutes} min drive`;
  } else {
    // Plain wording (was "X to spare", which testers found unclear).
    headline = `Arrive ${formatDuration(outcome.remaining)} before ${window.name} ends`;
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
          <IconSymbol name="star.fill" size={13} color={theme.tint} />
          <ThemedText style={[styles.badgeLabel, { color: theme.tint }]}>BEST MATCH</ThemedText>
        </View>
      </View>

      <View style={styles.placeRow}>
        <PlaceThumbnail size={76} />
        <View style={styles.placeInfo}>
          <ThemedText type="defaultSemiBold" style={styles.placeName} numberOfLines={2}>
            {place.name}
          </ThemedText>
          <View style={styles.areaRow}>
            <IconSymbol name="mappin.circle.fill" size={14} color={theme.textMuted} />
            <ThemedText style={[styles.placeArea, { color: theme.textSecondary }]} numberOfLines={1}>
              {/* Distance first so a long address can't truncate it away. */}
              {place.distanceKm.toFixed(1)} km away{place.area ? ` · ${place.area}` : ''}
            </ThemedText>
          </View>
        </View>
        {onPress && <IconSymbol name="chevron.right" size={22} color={theme.textMuted} />}
      </View>

      <View style={[styles.headlineBlock, { backgroundColor: theme.surface }]}>
        <View style={[styles.carBadge, { backgroundColor: theme.surfaceElevated }]}>
          <IconSymbol name="car.fill" size={20} color={headlineColor} />
        </View>
        <View style={styles.headlineText}>
          <ThemedText style={[styles.headline, { color: headlineColor }]}>{headline}</ThemedText>
          <ThemedText style={[styles.caption, { color: theme.textSecondary }]}>{caption}</ThemedText>
        </View>
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.85}
          onPress={() => openExternalNavigation(place.coordinates, place.googlePlaceId)}
          style={[styles.primaryAction, { backgroundColor: theme.tint }]}>
          <IconSymbol name="location.north.fill" size={18} color="#FFFFFF" />
          <ThemedText type="defaultSemiBold" style={styles.primaryActionLabel}>
            Get directions
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`View ${place.name} on Google Maps`}
          activeOpacity={0.7}
          onPress={() => openPlaceInGoogleMaps(place)}
          style={[styles.secondaryAction, { backgroundColor: theme.accentSoft }]}>
          <IconSymbol name="map.fill" size={20} color={theme.tint} />
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
    borderRadius: 26,
    padding: 16,
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  overline: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  badgeLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  placeInfo: {
    flex: 1,
    gap: 5,
  },
  placeName: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '700',
  },
  areaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  placeArea: {
    fontSize: 14,
    flexShrink: 1,
  },
  headlineBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  carBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headlineText: {
    flex: 1,
    gap: 2,
  },
  headline: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  caption: {
    fontSize: 13,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    paddingVertical: 15,
  },
  primaryActionLabel: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  secondaryAction: {
    width: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
