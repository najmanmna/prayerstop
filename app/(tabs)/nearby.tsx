import { router } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

import { AlternatePlaceRow } from '@/components/home/alternate-place-row';
import { cardShadow, PlaceListCard } from '@/components/home/place-list-card';
import { DistancePlaceRow, formatStraightLineDistance } from '@/components/nearby/distance-place-row';
import type { NearbyMapPin } from '@/components/nearby/map-pin';
import { NEARBY_HEADER_OVERLAP, NearbyHeader } from '@/components/nearby/nearby-header';
import { NEARBY_MAP_AVAILABLE, NearbyMap } from '@/components/nearby/nearby-map';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useNearbyPlacesSession } from '@/hooks/nearby-places-session';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useHeaderStatusBar } from '@/hooks/use-header-status-bar';
import { selectPrayerTimesForContext, usePrayerTimes } from '@/hooks/use-prayer-times';
import { displayPlaceText } from '@/lib/display-text';
import { buildPlaceScenario } from '@/lib/prayer-places/build-place-scenario';
import { buildPlaceDetailsPath } from '@/lib/prayer-places/find-candidate';
import { DEFAULT_NEARBY_OPTIONS } from '@/lib/prayer-places/nearby-places-api-repository';
import { openPlaceInGoogleMaps } from '@/lib/prayer-places/navigation';
import { formatClock12, formatDuration } from '@/lib/time';
import type { PrayerPlace } from '@/types/home';

/**
 * Nearby reads the same shared session Home does (`useNearbyPlacesSession`)
 * — it never fetches Places/Routes itself. Always shows the "now" view
 * (no NOW/NEXT toggle here); Home remains the place for planning ahead.
 */
export default function NearbyScreen() {
  const theme = Colors[useColorScheme() ?? 'light'];
  const { device, state: nearby, isStale, refresh, refreshWithLocation } = useNearbyPlacesSession();
  const isRefreshingEverything = device.isRefreshing || nearby.status === 'loading';
  const prayerTimes = usePrayerTimes();
  const timing = selectPrayerTimesForContext(prayerTimes, 'now');
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const handleScroll = useHeaderStatusBar(90);

  const places: PrayerPlace[] =
    timing && nearby.status === 'ready'
      ? (() => {
          const scenario = buildPlaceScenario(nearby.candidates, 'now', timing.window, timing.countdownSeconds);
          return scenario ? [scenario.recommendation, ...scenario.alternates] : [];
        })()
      : [];

  // Everything else discovery found — distance only, no ETA (never sent to
  // Routes). Only shown alongside the routed places, never instead of them.
  // When drive times are unavailable (Routes outage or daily cap), every
  // place is distance-only and listed here — still real places, just no ETA.
  const travelTimesUnavailable = nearby.status === 'ready' && nearby.travelTimesUnavailable;
  const morePlaces =
    (places.length > 0 || travelTimesUnavailable) && nearby.status === 'ready' ? nearby.morePlaces : [];
  const totalCount = places.length + morePlaces.length;
  const radiusKm = DEFAULT_NEARBY_OPTIONS.radiusMeters / 1000;
  const prayerSummary = timing
    ? timing.countdownSeconds !== null
      ? `${timing.window.name} ends in ${formatDuration(Math.max(0, Math.round(timing.countdownSeconds / 60)))}`
      : `${timing.window.name} · end time not listed`
    : null;
  const headerSummary =
    totalCount > 0
      ? `${totalCount} ${totalCount === 1 ? 'mosque' : 'mosques'} within ${radiusKm} km of you`
      : 'Prayer places around you';

  const goToDetails = (placeId: string) => router.push(buildPlaceDetailsPath(placeId));

  // Map pins: the routed places with their real ETA, then the distance-only
  // ones with straight-line distance — the same honesty rule as the list.
  const pins: NearbyMapPin[] = [
    ...places.map((place) => ({
      id: place.id,
      name: displayPlaceText(place.name),
      coordinates: place.coordinates,
      detail: `${place.etaMinutes} min · arrive ${formatClock12(place.arrivalTime)}`,
      isDriveTime: true,
    })),
    ...morePlaces.map((place) => ({
      id: place.id,
      name: displayPlaceText(place.name),
      coordinates: place.coordinates,
      detail: formatStraightLineDistance(place.distanceKm),
    })),
  ];
  const selectedPin = pins.find((pin) => pin.id === selectedPinId) ?? null;
  const allPlaces = [...places, ...morePlaces];
  const showMap = NEARBY_MAP_AVAILABLE && totalCount > 0;

  // Mirrors Home's placesNotice pattern — every step of the pipeline gets an
  // honest state to render rather than a blank screen.
  const notice: { title: string; body: string; onPress?: () => void } | null = (() => {
    if (totalCount > 0) return null;
    if (device.status === 'idle' || device.status === 'requesting') {
      return { title: 'Finding your location', body: 'Getting your current position…' };
    }
    if (device.status === 'denied') {
      return {
        title: 'Location needed',
        body: device.canAskAgain
          ? 'Allow location access to see nearby prayer places.'
          : 'Location access is off. Tap to open Settings.',
        onPress: device.retry,
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
        scrollEventThrottle={32}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshingEverything}
            onRefresh={() => {
              // Fire-and-forget: `refreshing` above reflects the shared
              // session's real state, not this promise settling, so the
              // native indicator stays in sync even though the actual
              // Places/Routes fetch happens asynchronously inside the
              // one shared Provider (see refreshWithLocation).
              void refreshWithLocation();
            }}
            tintColor={theme.tint}
          />
        }>
        <NearbyHeader
          summary={headerSummary}
          detail={totalCount > 0 ? prayerSummary : null}
          isRefreshing={isRefreshingEverything}
          onRefresh={() => refreshWithLocation()}
        />

        <View style={styles.content}>
          {totalCount === 0 ? (
            <TouchableOpacity
              style={[styles.unavailableCard, { backgroundColor: theme.surfaceElevated }, cardShadow()]}
              disabled={!notice?.onPress}
              onPress={notice?.onPress}
              activeOpacity={notice?.onPress ? 0.7 : 1}>
              <ThemedText type="defaultSemiBold" style={styles.unavailableTitle}>
                {notice?.title}
              </ThemedText>
              <ThemedText style={[styles.unavailableBody, { color: theme.textSecondary }]}>{notice?.body}</ThemedText>
            </TouchableOpacity>
          ) : (
            <>
              {showMap && (
                <View style={[styles.mapCard, { backgroundColor: theme.surface }, cardShadow()]}>
                  <NearbyMap
                    pins={pins}
                    userCoords={device.status === 'granted' ? device.coords : null}
                    selectedPinId={selectedPin?.id ?? null}
                    onSelectPin={setSelectedPinId}
                  />
                  {selectedPin && (
                    <SelectedPinCard
                      pin={selectedPin}
                      onOpen={() => goToDetails(selectedPin.id)}
                      onOpenInMaps={() => {
                        const place = allPlaces.find((entry) => entry.id === selectedPin.id);
                        if (place) void openPlaceInGoogleMaps(place);
                      }}
                    />
                  )}
                </View>
              )}

              {isStale && (
                <TouchableOpacity onPress={() => refreshWithLocation()} activeOpacity={0.7}>
                  <ThemedText style={[styles.staleNotice, { color: theme.textMuted }]}>
                    This may be a little out of date · tap to refresh
                  </ThemedText>
                </TouchableOpacity>
              )}

              {places.length > 0 && (
                <PlaceListCard title="Fastest to reach" caption="Live drive times">
                  {places.map((place) => (
                    <AlternatePlaceRow
                      key={place.id}
                      place={place}
                      window={timing!.window}
                      context="now"
                      onPress={() => goToDetails(place.id)}
                    />
                  ))}
                </PlaceListCard>
              )}

              {morePlaces.length > 0 && (
                <PlaceListCard
                  title={travelTimesUnavailable ? 'Nearest by distance' : 'More nearby'}
                  caption={travelTimesUnavailable ? `${morePlaces.length} places` : `${morePlaces.length} more`}
                  note={
                    travelTimesUnavailable
                      ? 'Live drive times are unavailable right now, so these are sorted by straight-line distance. Pull down to try again later.'
                      : `Straight-line distance. Live travel times are checked for the nearest ${places.length} only.`
                  }>
                  {morePlaces.map((place) => (
                    <DistancePlaceRow key={place.id} place={place} onPress={() => goToDetails(place.id)} />
                  ))}
                </PlaceListCard>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

function SelectedPinCard({
  pin,
  onOpen,
  onOpenInMaps,
}: {
  pin: NearbyMapPin;
  onOpen: () => void;
  onOpenInMaps: () => void;
}) {
  const theme = Colors[useColorScheme() ?? 'light'];
  return (
    <TouchableOpacity
      onPress={onOpen}
      activeOpacity={0.85}
      accessibilityRole="button"
      style={[styles.selectedCard, { backgroundColor: theme.surfaceElevated }, cardShadow()]}>
      <View style={styles.selectedInfo}>
        <ThemedText type="defaultSemiBold" style={styles.selectedName} numberOfLines={1}>
          {pin.name}
        </ThemedText>
        <View style={styles.selectedDetailRow}>
          {pin.isDriveTime && <IconSymbol name="car.fill" size={13} color={theme.textSecondary} />}
          <ThemedText style={[styles.selectedDetail, { color: theme.textSecondary }]} numberOfLines={1}>
            {pin.detail}
          </ThemedText>
        </View>
      </View>
      <TouchableOpacity
        onPress={onOpenInMaps}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`View ${pin.name} on Google Maps`}
        style={[styles.selectedMapsButton, { backgroundColor: theme.accentSoft }]}>
        <IconSymbol name="map.fill" size={16} color={theme.tint} />
      </TouchableOpacity>
      <IconSymbol name="chevron.right" size={18} color={theme.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    paddingBottom: 24,
  },
  content: {
    paddingHorizontal: 16,
    marginTop: -NEARBY_HEADER_OVERLAP,
    gap: 10,
  },
  unavailableCard: {
    borderRadius: 22,
    gap: 6,
    padding: 18,
  },
  unavailableTitle: {
    fontSize: 15,
  },
  unavailableBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  mapCard: {
    height: 250,
    borderRadius: 24,
    overflow: 'hidden',
  },
  staleNotice: {
    fontSize: 12,
    textAlign: 'center',
  },
  selectedCard: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  selectedInfo: {
    flex: 1,
    gap: 1,
  },
  selectedName: {
    fontSize: 14.5,
  },
  selectedDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  selectedDetail: {
    fontSize: 12.5,
  },
  selectedMapsButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
