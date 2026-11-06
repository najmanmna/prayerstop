import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';

import { PLACE_ICON_SIZE } from '@/components/home/place-list-card';
import { PlaceThumbnail } from '@/components/home/place-thumbnail';
import { StatusGlyph } from '@/components/home/status-glyph';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, FeasibilityColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { displayPlaceText } from '@/lib/display-text';
import { reachabilityDetail, summarizeReachability } from '@/lib/home-display';
import { openExternalNavigation, openPlaceInGoogleMaps } from '@/lib/prayer-places/navigation';
import type { PlanningContext, PrayerPlace, PrayerWindow } from '@/types/home';

/**
 * The best-match card: title row, the place (same layout as the list rows,
 * larger), then one tinted panel with the plain-words verdict and one line
 * ("Asr ends in 1h 45m · mosque 3 min away"), then the actions. Both come
 * from lib/home-display.ts, which only uses facts we have (see there for
 * the NOW/NEXT and unknown-deadline rules).
 */
export function RecommendationHero({
  place,
  window,
  context,
  countdownSeconds,
  onPress,
}: {
  place: PrayerPlace;
  window: PrayerWindow;
  context: PlanningContext;
  /** The prayer engine's countdown for this context (null when the deadline is unknown). */
  countdownSeconds: number | null;
  /** Opens the place's Details screen. Omit to render the card inert (used only in contexts with no Details destination). */
  onPress?: () => void;
}) {
  const theme = Colors[useColorScheme() ?? 'light'];
  const summary = summarizeReachability(context, window, place);
  const detail = reachabilityDetail(context, window, countdownSeconds, place);
  const panel =
    summary.tone === 'neutral'
      ? { background: theme.surface, foreground: theme.textSecondary }
      : FeasibilityColors[summary.tone];
  const area = place.area ? ` · ${displayPlaceText(place.area)}` : '';

  return (
    <TouchableOpacity
      disabled={!onPress}
      onPress={onPress}
      activeOpacity={onPress ? 0.9 : 1}
      accessibilityRole={onPress ? 'button' : undefined}
      style={[styles.card, { backgroundColor: theme.surfaceElevated }, cardShadow(theme.text)]}>
      {/* Same title row as the other place cards (PlaceListCard). */}
      <View style={styles.titleRow}>
        <ThemedText style={styles.title}>Best for {window.name}</ThemedText>
        <View style={[styles.badge, { backgroundColor: theme.accentSoft }]}>
          <IconSymbol name="star.fill" size={11} color={theme.tint} />
          <ThemedText style={[styles.badgeLabel, { color: theme.tint }]}>Recommended</ThemedText>
        </View>
      </View>

      <View style={styles.placeRow}>
        <View style={styles.iconColumn}>
          <PlaceThumbnail size={PLACE_ICON_SIZE} />
        </View>
        <View style={styles.placeInfo}>
          <ThemedText type="defaultSemiBold" style={styles.placeName} numberOfLines={2}>
            {displayPlaceText(place.name)}
          </ThemedText>
          <ThemedText style={[styles.placeArea, { color: theme.textSecondary }]} numberOfLines={1}>
            {place.distanceKm.toFixed(1)} km{area}
          </ThemedText>
        </View>
      </View>

      {/* Verdict panel. The tick sits in the thumbnail's column so the
          verdict text starts on the same line as the mosque name. */}
      <View accessibilityRole="summary" style={[styles.panel, { backgroundColor: panel.background }]}>
        <View style={styles.iconColumn}>
          <StatusGlyph tone={summary.tone} color={panel.foreground} size={28} />
        </View>
        <View style={styles.panelText}>
          <ThemedText style={[styles.verdict, { color: summary.tone === 'neutral' ? theme.text : panel.foreground }]}>
            {summary.title}
          </ThemedText>
          <ThemedText style={[styles.detail, { color: theme.textSecondary }]}>{detail}</ThemedText>
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
    padding: 16,
    gap: 14,
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
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconColumn: {
    width: PLACE_ICON_SIZE,
    alignItems: 'center',
  },
  placeInfo: {
    flex: 1,
    gap: 3,
  },
  placeName: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  placeArea: {
    fontSize: 12.5,
    lineHeight: 16,
  },
  panel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    paddingVertical: 14,
    paddingRight: 16,
  },
  panelText: {
    flex: 1,
    gap: 2,
  },
  verdict: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '800',
  },
  detail: {
    fontSize: 13,
    lineHeight: 18,
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
