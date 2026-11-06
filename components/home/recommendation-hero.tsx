import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';

import { PLACE_ICON_SIZE } from '@/components/home/place-list-card';
import { PlaceThumbnail } from '@/components/home/place-thumbnail';
import { StatusGlyph } from '@/components/home/status-glyph';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, FeasibilityColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { displayPlaceText } from '@/lib/display-text';
import { planFigures, summarizeReachability } from '@/lib/home-display';
import { openExternalNavigation, openPlaceInGoogleMaps } from '@/lib/prayer-places/navigation';
import type { PlanningContext, PrayerPlace, PrayerWindow } from '@/types/home';

/**
 * The best-match card: title row, the place (same layout as the list rows,
 * larger), then one tinted panel with the plain-words verdict over three
 * evenly spaced figures, then the actions. The verdict and figures come
 * from lib/home-display.ts, which only uses facts we have (see there for
 * the NOW/NEXT and unknown-deadline rules).
 */
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
  const summary = summarizeReachability(context, window, place);
  const figures = planFigures(context, window, place);
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

      <View accessibilityRole="summary" style={[styles.panel, { backgroundColor: panel.background }]}>
        <View style={styles.verdictRow}>
          <StatusGlyph tone={summary.tone} color={panel.foreground} size={20} />
          <ThemedText style={[styles.verdict, { color: summary.tone === 'neutral' ? theme.text : panel.foreground }]}>
            {summary.title}
          </ThemedText>
        </View>
        <View style={[styles.panelDivider, { backgroundColor: `${panel.foreground}26` }]} />
        <View style={styles.figures}>
          {figures.map((figure, index) => (
            <View key={figure.label} style={styles.figureWrap}>
              {index > 0 && <View style={[styles.figureDivider, { backgroundColor: `${panel.foreground}26` }]} />}
              <View style={styles.figure}>
                <ThemedText style={styles.figureValue} numberOfLines={1}>
                  {figure.value}
                </ThemedText>
                <ThemedText style={[styles.figureLabel, { color: theme.textSecondary }]} numberOfLines={1}>
                  {figure.label}
                </ThemedText>
              </View>
            </View>
          ))}
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
    borderRadius: 16,
    paddingVertical: 14,
  },
  verdictRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  verdict: {
    fontSize: 15.5,
    lineHeight: 20,
    fontWeight: '800',
    flexShrink: 1,
  },
  panelDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 12,
    marginHorizontal: 16,
  },
  figures: {
    flexDirection: 'row',
  },
  figureWrap: {
    flex: 1,
    flexDirection: 'row',
  },
  figureDivider: {
    width: StyleSheet.hairlineWidth,
  },
  figure: {
    flex: 1,
    alignItems: 'center',
    gap: 1,
    paddingHorizontal: 4,
  },
  figureValue: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  figureLabel: {
    fontSize: 11.5,
    lineHeight: 15,
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
