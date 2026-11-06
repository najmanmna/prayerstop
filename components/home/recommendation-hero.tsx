import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';

import { PlaceThumbnail } from '@/components/home/place-thumbnail';
import { ReachabilityStrip } from '@/components/home/reachability-strip';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, FeasibilityColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { ReachabilitySummary } from '@/lib/home-display';
import { openExternalNavigation, openPlaceInGoogleMaps } from '@/lib/prayer-places/navigation';
import { formatClock12, formatDuration, getArrivalOutcome, offsetClock } from '@/lib/time';
import type { PlanningContext, PrayerPlace, PrayerWindow } from '@/types/home';

export function RecommendationHero({
  place,
  window,
  context,
  summary,
  onPress,
}: {
  place: PrayerPlace;
  window: PrayerWindow;
  context: PlanningContext;
  /** Plain-words reachability answer shown as the card's top band. */
  summary?: ReachabilitySummary;
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
      {summary && <ReachabilityStrip summary={summary} />}

      <View style={styles.body}>
        <View style={styles.placeRow}>
          <PlaceThumbnail size={56} />
          <View style={styles.placeInfo}>
            <View style={styles.bestMatch}>
              <IconSymbol name="star.fill" size={11} color={theme.tint} />
              <ThemedText style={[styles.bestMatchLabel, { color: theme.tint }]}>
                BEST MATCH FOR {window.name.toUpperCase()}
              </ThemedText>
            </View>
            <ThemedText type="defaultSemiBold" style={styles.placeName} numberOfLines={2}>
              {place.name}
            </ThemedText>
            <ThemedText style={[styles.placeArea, { color: theme.textSecondary }]} numberOfLines={1}>
              {/* Distance first so a long address can't truncate it away. */}
              {place.distanceKm.toFixed(1)} km away{place.area ? ` · ${place.area}` : ''}
            </ThemedText>
          </View>
          {onPress && <IconSymbol name="chevron.right" size={20} color={theme.textMuted} />}
        </View>

        <View style={[styles.headlineBlock, { backgroundColor: theme.surface }]}>
          <View style={[styles.carBadge, { backgroundColor: theme.surfaceElevated }]}>
            <IconSymbol name="car.fill" size={17} color={headlineColor} />
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
            <IconSymbol name="location.north.fill" size={16} color="#FFFFFF" />
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
            <IconSymbol name="map.fill" size={18} color={theme.tint} />
          </TouchableOpacity>
        </View>
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
    borderRadius: 22,
    overflow: 'hidden',
  },
  body: {
    padding: 14,
    gap: 12,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  placeInfo: {
    flex: 1,
    gap: 2,
  },
  bestMatch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bestMatchLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  placeName: {
    fontSize: 16.5,
    lineHeight: 21,
    fontWeight: '700',
  },
  placeArea: {
    fontSize: 12.5,
  },
  headlineBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  carBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headlineText: {
    flex: 1,
    gap: 1,
  },
  headline: {
    fontSize: 14.5,
    lineHeight: 19,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  caption: {
    fontSize: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  primaryAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 14,
    paddingVertical: 12,
  },
  primaryActionLabel: {
    color: '#FFFFFF',
    fontSize: 15,
  },
  secondaryAction: {
    width: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
