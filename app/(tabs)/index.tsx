import { router } from 'expo-router';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AlternatePlaceRow } from '@/components/home/alternate-place-row';
import { PrayerPanel } from '@/components/home/prayer-panel';
import { RecommendationHero } from '@/components/home/recommendation-hero';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useNearbyPlacesSession } from '@/hooks/nearby-places-session';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePlanningContext } from '@/hooks/use-planning-context';
import { selectPrayerTimesForContext, usePrayerTimes } from '@/hooks/use-prayer-times';
import { formatCoordinates } from '@/lib/location';
import { isLocationStale, resolveLocationNotice } from '@/lib/location-freshness';
import { buildPlaceScenario } from '@/lib/prayer-places/build-place-scenario';
import { buildPlaceDetailsPath } from '@/lib/prayer-places/find-candidate';

export default function HomeScreen() {
  const theme = Colors[useColorScheme() ?? 'light'];
  const { device, state: nearby, isStale, refresh, refreshWithLocation } = useNearbyPlacesSession();
  const prayerTimes = usePrayerTimes();
  const [context, setContext] = usePlanningContext(prayerTimes.status === 'ready' ? prayerTimes.now.window : null);
  const timing = selectPrayerTimesForContext(prayerTimes, context);
  const placeScenario =
    timing && nearby.status === 'ready'
      ? buildPlaceScenario(nearby.candidates, context, timing.window, timing.countdownSeconds)
      : null;

  const locationInteractive = device.status === 'denied' || device.status === 'error';
  const locationText =
    device.status === 'granted' && device.coords
      ? (device.address ?? formatCoordinates(device.coords.latitude, device.coords.longitude))
      : device.status === 'denied'
        ? device.canAskAgain
          ? 'Location needed · Tap to allow'
          : 'Location denied · Tap to open Settings'
        : device.status === 'error'
          ? 'Location unavailable · Tap to retry'
          : 'Locating…';

  const handleLocationPress = () => {
    if (device.status === 'denied' && !device.canAskAgain) {
      Linking.openSettings();
    } else if (locationInteractive) {
      device.retry();
    }
  };

  const locationStale =
    device.status === 'granted' && device.timestamp !== null && isLocationStale(device.timestamp, Date.now());

  // One compact, tappable line replaces what used to be up to two separate
  // vertical blocks (a location-staleness caption here, plus a full "pull to
  // refresh on Nearby" banner further down) — see resolveLocationNotice for
  // the priority between a failed refresh, an old GPS fix, and an old
  // fetched session.
  const locationNotice = resolveLocationNotice({
    refreshError: device.refreshError,
    locationStale,
    sessionStale: isStale,
  });
  const isRefreshingEverything = device.isRefreshing || nearby.status === 'loading';

  const goToPlaceDetails = (placeId: string) => router.push(buildPlaceDetailsPath(placeId));

  // What to show in place of the recommendation/alternates when we don't
  // have a ready place scenario yet — covers every step of device GPS →
  // Google Places → ranked results, so nothing silently renders blank.
  const placesNotice: { title: string; body: string; onPress?: () => void } | null = (() => {
    if (placeScenario) return null;
    if (!timing) return null; // the "prayer times unavailable" card already covers this

    if (device.status === 'idle' || device.status === 'requesting') {
      return { title: 'Finding your location', body: 'Getting your current position…' };
    }
    if (device.status === 'denied') {
      return {
        title: 'Location needed',
        body: device.canAskAgain
          ? 'Allow location access to see nearby prayer places.'
          : 'Location access is off. Tap to open Settings.',
        onPress: handleLocationPress,
      };
    }
    if (device.status === 'error') {
      return {
        title: 'Location unavailable',
        body: device.errorMessage ?? 'Could not get your location. Tap to retry.',
        onPress: device.retry,
      };
    }
    if (nearby.status === 'error') {
      return { title: 'Nearby places unavailable', body: nearby.message, onPress: refresh };
    }
    if (nearby.status === 'empty') {
      return { title: 'No prayer places found nearby', body: 'Try again later or move to a different area.' };
    }
    if (nearby.status === 'unreachable') {
      return {
        title: 'No reachable prayer places found',
        body: 'We found nearby places, but couldn’t work out a driving route to any of them.',
        onPress: refresh,
      };
    }
    return { title: 'Finding nearby prayer places', body: 'Searching for mosques near you…' };
  })();

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <View style={styles.headerTextColumn}>
                <ThemedText style={[styles.eyebrow, { color: theme.tint }]}>Prayer planner</ThemedText>
                <TouchableOpacity
                  style={styles.locationRow}
                  disabled={!locationInteractive}
                  onPress={handleLocationPress}
                  activeOpacity={0.7}>
                  <IconSymbol name="location.fill" size={16} color={theme.tint} />
                  <ThemedText type="defaultSemiBold" style={styles.locationTitle} numberOfLines={1}>
                    {locationText}
                  </ThemedText>
                </TouchableOpacity>
                {/* Fixed-height slot regardless of whether there's a notice
                    to show — otherwise the prayer card below shifts up/down
                    every time the notice appears or clears. */}
                <View style={styles.noticeSlot}>
                  {locationNotice && (
                    <TouchableOpacity
                      onPress={() => refreshWithLocation()}
                      disabled={isRefreshingEverything}
                      activeOpacity={0.7}>
                      <ThemedText style={[styles.locationStaleNotice, { color: theme.textMuted }]}>
                        {locationNotice.message}
                      </ThemedText>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              {device.status === 'granted' && (
                <TouchableOpacity
                  onPress={() => refreshWithLocation()}
                  disabled={isRefreshingEverything}
                  accessibilityRole="button"
                  accessibilityLabel="Refresh location and nearby places"
                  style={styles.refreshLocationButton}>
                  {isRefreshingEverything ? (
                    <ActivityIndicator size="small" color={theme.tint} />
                  ) : (
                    <IconSymbol name="arrow.clockwise" size={18} color={theme.tint} />
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>

          {timing ? (
            <>
              {/* Prayer data is independent of location/places — it must
                  always render here whenever the prayer engine has a valid
                  answer, regardless of GPS/Places/Routes state below. */}
              <PrayerPanel
                context={context}
                onChangeContext={setContext}
                window={timing.window}
                countdownSeconds={timing.countdownSeconds}
                schedule={prayerTimes.status === 'ready' ? prayerTimes.schedule : []}
                sunriseTime={prayerTimes.status === 'ready' ? prayerTimes.sunriseTime : undefined}
              />

              {placeScenario ? (
                <>
                  <View style={styles.primarySection}>
                    <RecommendationHero
                      place={placeScenario.recommendation}
                      window={timing.window}
                      context={context}
                      onPress={() => goToPlaceDetails(placeScenario.recommendation.id)}
                    />
                  </View>

                  {placeScenario.alternates.length > 0 && (
                    <View style={styles.alternatesSection}>
                      <View style={styles.sectionHeader}>
                        <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
                          Other nearby places
                        </ThemedText>
                        <ThemedText style={[styles.resultCount, { color: theme.textMuted }]}>
                          {placeScenario.alternates.length} options
                        </ThemedText>
                      </View>
                      <View style={[styles.alternatesCard, { backgroundColor: theme.surface }]}>
                        {placeScenario.alternates.map((place, index) => (
                          <View key={place.id}>
                            <AlternatePlaceRow
                              place={place}
                              window={timing.window}
                              context={context}
                              onPress={() => goToPlaceDetails(place.id)}
                            />
                            {index < placeScenario.alternates.length - 1 && (
                              <View style={[styles.rowDivider, { backgroundColor: theme.border }]} />
                            )}
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </>
              ) : placesNotice ? (
                // Compact, secondary — a location/place failure never hides
                // the prayer card above, it only replaces this section.
                <TouchableOpacity
                  style={[styles.unavailableCard, { backgroundColor: theme.surface }]}
                  disabled={!placesNotice.onPress}
                  onPress={placesNotice.onPress}
                  activeOpacity={placesNotice.onPress ? 0.7 : 1}>
                  <ThemedText type="defaultSemiBold" style={styles.unavailableTitle}>
                    {placesNotice.title}
                  </ThemedText>
                  <ThemedText style={[styles.unavailableBody, { color: theme.textSecondary }]}>
                    {placesNotice.body}
                  </ThemedText>
                </TouchableOpacity>
              ) : null}
            </>
          ) : (
            // Prayer engine itself has no answer (e.g. no ACJU data for
            // today) — an explicit, distinct state, never conflated with a
            // location/places failure and never silently falling back to a
            // different zone's data.
            <View style={[styles.unavailableCard, { backgroundColor: theme.surface }]}>
              <ThemedText type="defaultSemiBold" style={styles.unavailableTitle}>
                Prayer times aren&apos;t available for today
              </ThemedText>
              <ThemedText style={[styles.unavailableBody, { color: theme.textSecondary }]}>
                {prayerTimes.status === 'unavailable' ? prayerTimes.reason : 'Please check back shortly.'}
              </ThemedText>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 20,
    gap: 14,
  },
  header: {
    paddingTop: 0,
    paddingBottom: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTextColumn: {
    flex: 1,
    gap: 3,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  locationTitle: {
    flexShrink: 1,
    fontSize: 20,
    lineHeight: 25,
  },
  refreshLocationButton: {
    padding: 2,
  },
  primarySection: {
    marginTop: 2,
  },
  noticeSlot: {
    height: 18,
    justifyContent: 'center',
  },
  locationStaleNotice: {
    fontSize: 11,
  },
  alternatesSection: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 17,
  },
  resultCount: {
    fontSize: 13,
    fontWeight: '500',
  },
  alternatesCard: {
    borderRadius: 22,
    padding: 15,
    gap: 10,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    marginTop: 10,
  },
  unavailableCard: {
    borderRadius: 22,
    padding: 18,
    gap: 6,
  },
  unavailableTitle: {
    fontSize: 15,
  },
  unavailableBody: {
    fontSize: 13,
    lineHeight: 18,
  },
});
