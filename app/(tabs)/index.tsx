import { router } from 'expo-router';
import { Linking, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

import { AlternatePlaceRow } from '@/components/home/alternate-place-row';
import { HEADER_CARD_OVERLAP, HomeHeader } from '@/components/home/home-header';
import { PlaceListCard } from '@/components/home/place-list-card';
import { PrayerDayCard } from '@/components/home/prayer-day-card';
import { PrayerPanel } from '@/components/home/prayer-panel';
import { RecommendationHero } from '@/components/home/recommendation-hero';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useNearbyPlacesSession } from '@/hooks/nearby-places-session';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useHeaderStatusBar } from '@/hooks/use-header-status-bar';
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

  // Light status-bar icons while the green header is in view.
  const handleScroll = useHeaderStatusBar(HEADER_SCROLL_THRESHOLD);

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
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={32}>
        <HomeHeader
          locationText={locationText}
          locationInteractive={locationInteractive}
          onLocationPress={handleLocationPress}
          notice={locationNotice?.message ?? null}
          onNoticePress={() => refreshWithLocation()}
          showRefresh={device.status === 'granted'}
          isRefreshing={isRefreshingEverything}
          onRefresh={() => refreshWithLocation()}
        />

        <View style={styles.content}>
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
              />
              {prayerTimes.status === 'ready' && (
                <PrayerDayCard
                  schedule={prayerTimes.schedule}
                  activeName={timing.window.name}
                  sunriseTime={prayerTimes.sunriseTime}
                  now={new Date()}
                />
              )}

              {placeScenario ? (
                <>
                  <RecommendationHero
                    place={placeScenario.recommendation}
                    window={timing.window}
                    context={context}
                    countdownSeconds={timing.countdownSeconds}
                    onPress={() => goToPlaceDetails(placeScenario.recommendation.id)}
                  />

                  {placeScenario.alternates.length > 0 && (
                    <PlaceListCard
                      title="Other nearby places"
                      caption={`${placeScenario.alternates.length} more`}>
                      {placeScenario.alternates.map((place) => (
                        <AlternatePlaceRow
                          key={place.id}
                          place={place}
                          window={timing.window}
                          context={context}
                          onPress={() => goToPlaceDetails(place.id)}
                        />
                      ))}
                    </PlaceListCard>
                  )}
                </>
              ) : placesNotice ? (
                // Compact, secondary — a location/place failure never hides
                // the prayer card above, it only replaces this section.
                <TouchableOpacity
                  style={[styles.unavailableCard, { backgroundColor: theme.surfaceElevated }]}
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
            <View style={[styles.unavailableCard, { backgroundColor: theme.surfaceElevated }]}>
              <ThemedText type="defaultSemiBold" style={styles.unavailableTitle}>
                Prayer times aren&apos;t available for today
              </ThemedText>
              <ThemedText style={[styles.unavailableBody, { color: theme.textSecondary }]}>
                {prayerTimes.status === 'unavailable' ? prayerTimes.reason : 'Please check back shortly.'}
              </ThemedText>
            </View>
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

/** Scroll distance after which the green header is mostly out of view. */
const HEADER_SCROLL_THRESHOLD = 120;

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  content: {
    paddingHorizontal: 16,
    marginTop: -HEADER_CARD_OVERLAP,
    gap: 12,
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
