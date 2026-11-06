import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlaceThumbnail } from '@/components/home/place-thumbnail';
import { formatStraightLineDistance } from '@/components/nearby/distance-place-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, FeasibilityColors } from '@/constants/theme';
import { useNearbyPlacesSession } from '@/hooks/nearby-places-session';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { selectPrayerTimesForContext, usePrayerTimes } from '@/hooks/use-prayer-times';
import { buildPlaceScenario } from '@/lib/prayer-places/build-place-scenario';
import { findCandidateById } from '@/lib/prayer-places/find-candidate';
import { displayPlaceText } from '@/lib/display-text';
import { openExternalNavigation, openPlaceInGoogleMaps } from '@/lib/prayer-places/navigation';
import type { DistanceRankedCandidate } from '@/lib/prayer-places/select-candidates';
import { formatClock12, formatDuration, getArrivalOutcome } from '@/lib/time';

/**
 * Reads the place to show from the shared session (`useNearbyPlacesSession`)
 * by id — never fetches Places/Routes itself, and never a second time even
 * if the session was already fetched for Home/Nearby. Shows only fields we
 * actually have reliable data for: no opening hours, Jama'ah times,
 * facilities, or reviews (see CLAUDE.md / docs/06 on that data limitation).
 */
export default function PlaceDetailsScreen() {
  const theme = Colors[useColorScheme() ?? 'light'];
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state: nearby } = useNearbyPlacesSession();
  const prayerTimes = usePrayerTimes();
  const timing = selectPrayerTimesForContext(prayerTimes, 'now');

  const candidate = nearby.status === 'ready' ? findCandidateById(nearby.candidates, id) : null;
  const place =
    candidate && timing
      ? buildPlaceScenario([candidate], 'now', timing.window, timing.countdownSeconds)?.recommendation
      : null;

  // A "More nearby" place: found by discovery but never sent to Routes, so
  // there is no ETA or feasibility to show — distance and actions only.
  const distanceOnly =
    !candidate && nearby.status === 'ready' ? (nearby.morePlaces.find((entry) => entry.id === id) ?? null) : null;
  if (distanceOnly) {
    return <DistanceOnlyDetails place={distanceOnly} />;
  }

  if (!place || !timing) {
    return (
      <ThemedView style={styles.flex}>
        <SafeAreaView style={styles.flex} edges={['bottom']}>
          <View style={styles.notice}>
            <ThemedText type="defaultSemiBold" style={styles.noticeTitle}>
              {nearby.status === 'loading' || nearby.status === 'idle'
                ? 'Loading this place…'
                : 'This place is no longer available'}
            </ThemedText>
            <ThemedText style={[styles.noticeBody, { color: theme.textSecondary }]}>
              {nearby.status === 'loading' || nearby.status === 'idle'
                ? 'Hang on while we finish loading nearby prayer places.'
                : 'It may have dropped out of the current nearby-places session — go back and refresh from Nearby.'}
            </ThemedText>
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const outcome = getArrivalOutcome(timing.window, place.arrivalTime);
  const statusColor = FeasibilityColors[place.feasibility].foreground;

  let deadlineLabel = 'Deadline';
  let deadlineValue = 'Not available';
  let deadlineColor = theme.textMuted;
  if (outcome.status === 'known') {
    if (outcome.overflow) {
      deadlineLabel = `${timing.window.name} ends`;
      deadlineValue = timing.window.endTime ? formatClock12(timing.window.endTime) : 'Unknown';
      deadlineColor = statusColor;
    } else {
      deadlineLabel = "You'll have";
      deadlineValue = formatDuration(outcome.remaining);
      deadlineColor = statusColor;
    }
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.headerRow}>
            <PlaceThumbnail size={72} />
            <View style={styles.headerInfo}>
              <ThemedText type="defaultSemiBold" style={styles.name}>
                {displayPlaceText(place.name)}
              </ThemedText>
              <ThemedText style={[styles.address, { color: theme.textSecondary }]}>{displayPlaceText(place.area)}</ThemedText>
            </View>
          </View>

          <View style={[styles.statsCard, { backgroundColor: theme.surfaceElevated }]}>
            <View style={styles.statColumn}>
              <ThemedText style={[styles.statLabel, { color: theme.textMuted }]}>Distance</ThemedText>
              <ThemedText style={styles.statValue}>{place.distanceKm.toFixed(1)} km</ThemedText>
            </View>
            <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
            <View style={styles.statColumn}>
              <ThemedText style={[styles.statLabel, { color: theme.textMuted }]}>Drive time</ThemedText>
              <View style={styles.statValueRow}>
                <IconSymbol name="car.fill" size={15} color={statusColor} />
                <ThemedText style={[styles.statValue, { color: statusColor }]}>{place.etaMinutes} min</ThemedText>
              </View>
            </View>
            <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
            <View style={styles.statColumn}>
              <ThemedText style={[styles.statLabel, { color: theme.textMuted }]}>Arrive by</ThemedText>
              <ThemedText style={styles.statValue}>{formatClock12(place.arrivalTime)}</ThemedText>
            </View>
          </View>

          <View style={[styles.feasibilityCard, { backgroundColor: FeasibilityColors[place.feasibility].background }]}>
            <ThemedText style={[styles.feasibilityLabel, { color: deadlineColor }]}>{deadlineLabel}</ThemedText>
            <ThemedText type="defaultSemiBold" style={[styles.feasibilityValue, { color: deadlineColor }]}>
              {deadlineValue}
            </ThemedText>
            {outcome.status === 'unknown' && (
              <ThemedText style={[styles.feasibilityNote, { color: theme.textMuted }]}>
                We don&apos;t have a reliable {timing.window.name} deadline yet, so we can&apos;t say how much time
                this leaves you.
              </ThemedText>
            )}
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.85}
            onPress={() => openExternalNavigation(place.coordinates, place.googlePlaceId)}
            style={[styles.cta, { backgroundColor: theme.tint }]}>
            <IconSymbol name="location.north.fill" size={16} color="#FFFFFF" />
            <ThemedText type="defaultSemiBold" style={styles.ctaLabel}>
              Navigate
            </ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`View ${place.name} on Google Maps`}
            activeOpacity={0.7}
            onPress={() => openPlaceInGoogleMaps(place)}
            style={styles.secondaryCta}>
            <IconSymbol name="mappin.circle.fill" size={16} color={theme.tint} />
            <ThemedText type="defaultSemiBold" style={{ color: theme.tint }}>
              View on Google Maps
            </ThemedText>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function DistanceOnlyDetails({ place }: { place: DistanceRankedCandidate }) {
  const theme = Colors[useColorScheme() ?? 'light'];
  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.headerRow}>
            <PlaceThumbnail size={72} />
            <View style={styles.headerInfo}>
              <ThemedText type="defaultSemiBold" style={styles.name}>
                {displayPlaceText(place.name)}
              </ThemedText>
              {place.area ? (
                <ThemedText style={[styles.address, { color: theme.textSecondary }]}>{displayPlaceText(place.area)}</ThemedText>
              ) : null}
            </View>
          </View>

          <View style={[styles.statsCard, { backgroundColor: theme.surfaceElevated }]}>
            <View style={styles.statColumn}>
              <ThemedText style={[styles.statLabel, { color: theme.textMuted }]}>Straight-line distance</ThemedText>
              <ThemedText style={styles.statValue}>{formatStraightLineDistance(place.distanceKm)}</ThemedText>
            </View>
          </View>

          <ThemedText style={[styles.feasibilityNote, { color: theme.textMuted }]}>
            Live travel time is only checked for the nearest few mosques, so we can&apos;t say how long this one takes
            to reach or whether you&apos;d arrive in time. Navigate to see the route in Google Maps.
          </ThemedText>

          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.85}
            onPress={() => openExternalNavigation(place.coordinates, place.googlePlaceId)}
            style={[styles.cta, { backgroundColor: theme.tint }]}>
            <IconSymbol name="location.north.fill" size={16} color="#FFFFFF" />
            <ThemedText type="defaultSemiBold" style={styles.ctaLabel}>
              Navigate
            </ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.7}
            onPress={() => openPlaceInGoogleMaps(place)}
            style={styles.secondaryCta}>
            <IconSymbol name="mappin.circle.fill" size={16} color={theme.tint} />
            <ThemedText type="defaultSemiBold" style={{ color: theme.tint }}>
              View on Google Maps
            </ThemedText>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: 20,
    gap: 16,
  },
  notice: {
    padding: 20,
    gap: 6,
  },
  noticeTitle: {
    fontSize: 17,
  },
  noticeBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  headerInfo: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontSize: 21,
    lineHeight: 26,
  },
  address: {
    fontSize: 14,
    lineHeight: 19,
  },
  statsCard: {
    flexDirection: 'row',
    borderRadius: 18,
    paddingVertical: 16,
  },
  statColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
  },
  statLabel: {
    fontSize: 12,
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  feasibilityCard: {
    borderRadius: 18,
    padding: 16,
    gap: 4,
  },
  feasibilityLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  feasibilityValue: {
    fontSize: 20,
  },
  feasibilityNote: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    paddingVertical: 14,
  },
  secondaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  ctaLabel: {
    color: '#FFFFFF',
    fontSize: 15,
  },
});
