import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';

import { PLACE_ICON_SIZE } from '@/components/home/place-list-card';
import { PlaceThumbnail } from '@/components/home/place-thumbnail';
import { StatusGlyph } from '@/components/home/status-glyph';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, FeasibilityColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { displayPlaceText } from '@/lib/display-text';
import { summarizeReachability } from '@/lib/home-display';
import { openExternalNavigation, openPlaceInGoogleMaps } from '@/lib/prayer-places/navigation';
import { formatClock12, formatDuration, getArrivalOutcome } from '@/lib/time';
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
  // the verdict from this for NEXT — summarizeReachability uses
  // `place.feasibility`, already computed per-context by build-place-scenario.ts.
  const outcome = isNow ? getArrivalOutcome(window, place.arrivalTime) : { status: 'unknown' as const };
  const summary = summarizeReachability(context, window, place);
  const panelColors =
    summary.tone === 'neutral'
      ? { background: theme.surface, foreground: theme.textSecondary }
      : FeasibilityColors[summary.tone];
  const drive = `${place.etaMinutes} min drive`;

  // The verdict (title) answers "can I make it?"; this one line underneath
  // carries the numbers behind it.
  let detail: string;
  if (!isNow) {
    detail = `${drive} · arrive by ${formatClock12(window.startTime)}`;
  } else if (!window.hasStarted) {
    detail = `Starts at ${formatClock12(window.startTime)} · ${drive}`;
  } else if (outcome.status === 'unknown' || !outcome.overflow) {
    detail = `${drive} · arrive ${formatClock12(place.arrivalTime)}`;
  } else {
    detail = `Arrives ${formatDuration(Math.abs(outcome.remaining))} after ${window.name} ends · ${drive}`;
  }

  return (
    <TouchableOpacity
      disabled={!onPress}
      onPress={onPress}
      activeOpacity={onPress ? 0.9 : 1}
      accessibilityRole={onPress ? 'button' : undefined}
      style={[styles.card, { backgroundColor: theme.surfaceElevated }, cardShadow(theme.text)]}>
      <View style={styles.body}>
        {/* Same title row as the other place cards (PlaceListCard). */}
        <View style={styles.titleRow}>
          <ThemedText style={styles.title}>Best for {window.name}</ThemedText>
          <View style={[styles.badge, { backgroundColor: theme.accentSoft }]}>
            <IconSymbol name="star.fill" size={11} color={theme.tint} />
            <ThemedText style={[styles.badgeLabel, { color: theme.tint }]}>Recommended</ThemedText>
          </View>
        </View>

        <View style={styles.placeRow}>
          <PlaceThumbnail size={PLACE_ICON_SIZE} />
          <View style={styles.placeInfo}>
            <ThemedText type="defaultSemiBold" style={styles.placeName} numberOfLines={2}>
              {displayPlaceText(place.name)}
            </ThemedText>
            <ThemedText style={[styles.placeArea, { color: theme.textSecondary }]} numberOfLines={1}>
              {/* Distance first so a long address can't truncate it away. */}
              {place.distanceKm.toFixed(1)} km away{place.area ? ` · ${displayPlaceText(place.area)}` : ''}
            </ThemedText>
          </View>
          {onPress && <IconSymbol name="chevron.right" size={20} color={theme.textMuted} />}
        </View>

        {/* One tinted panel: the verdict and the numbers behind it. The
            glyph sits in the thumbnail's column so the text lines up. */}
        <View accessibilityRole="summary" style={[styles.verdict, { backgroundColor: panelColors.background }]}>
          <View style={styles.glyphColumn}>
            <StatusGlyph tone={summary.tone} color={panelColors.foreground} size={28} />
          </View>
          <View style={styles.verdictText}>
            <ThemedText style={[styles.verdictTitle, { color: summary.tone === 'neutral' ? theme.text : panelColors.foreground }]}>
              {summary.title}
            </ThemedText>
            <ThemedText style={[styles.verdictDetail, { color: theme.textSecondary }]}>{detail}</ThemedText>
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 15.5,
    fontWeight: '700',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  badgeLabel: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  placeName: {
    fontSize: 16.5,
    lineHeight: 21,
    fontWeight: '700',
  },
  placeArea: {
    fontSize: 12.5,
  },
  verdict: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    paddingVertical: 11,
    paddingRight: 12,
  },
  glyphColumn: {
    width: PLACE_ICON_SIZE,
    alignItems: 'center',
  },
  verdictText: {
    flex: 1,
    gap: 2,
  },
  verdictTitle: {
    fontSize: 15.5,
    lineHeight: 20,
    fontWeight: '800',
  },
  verdictDetail: {
    fontSize: 12.5,
    lineHeight: 17,
    fontVariant: ['tabular-nums'],
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
