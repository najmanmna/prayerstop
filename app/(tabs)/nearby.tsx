import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AlternatePlaceRow } from '@/components/home/alternate-place-row';
import { DistancePlaceRow, formatStraightLineDistance } from '@/components/nearby/distance-place-row';
import type { NearbyMapPin } from '@/components/nearby/map-pin';
import { NEARBY_MAP_AVAILABLE, NearbyMap } from '@/components/nearby/nearby-map';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useNearbyPlacesSession } from '@/hooks/nearby-places-session';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { selectPrayerTimesForContext, usePrayerTimes } from '@/hooks/use-prayer-times';
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

  const places: PrayerPlace[] =
    timing && nearby.status === 'ready'
      ? (() => {
          const scenario = buildPlaceScenario(nearby.candidates, 'now', timing.window, timing.countdownSeconds);
          return scenario ? [scenario.recommendation, ...scenario.alternates] : [];
        })()
      : [];

  // Everything else discovery found — distance only, no ETA (never sent to
  // Routes). Only shown alongside the routed places, never instead of them.
  const morePlaces = places.length > 0 && nearby.status === 'ready' ? nearby.morePlaces : [];
  const totalCount = places.length + morePlaces.length;
  const radiusKm = DEFAULT_NEARBY_OPTIONS.radiusMeters / 1000;
  const prayerSummary = timing
    ? timing.countdownSeconds !== null
      ? `${timing.window.name} · ${formatDuration(Math.max(0, Math.round(timing.countdownSeconds / 60)))} left`
      : timing.window.name
    : null;

  const goToDetails = (placeId: string) => router.push(buildPlaceDetailsPath(placeId));

  // Map pins: the routed places with their real ETA, then the distance-only
  // ones with straight-line distance — the same honesty rule as the list.
  const pins: NearbyMapPin[] = [
    ...places.map((place) => ({
      id: place.id,
      name: place.name,
      coordinates: place.coordinates,
      detail: `${place.etaMinutes} min · arrive ${formatClock12(place.arrivalTime)}`,
    })),
    ...morePlaces.map((place) => ({
      id: place.id,
      name: place.name,
      coordinates: place.coordinates,
      detail: formatStraightLineDistance(place.distanceKm),
    })),
  ];
  const selectedPin = pins.find((pin) => pin.id === selectedPinId) ?? null;
  const allPlaces = [...places, ...morePlaces];
  const showMap = NEARBY_MAP_AVAILABLE && places.length > 0;

  // Mirrors Home's placesNotice pattern — every step of the pipeline gets an
  // honest state to render rather than a blank screen.
  const notice: { title: string; body: string; onPress?: () => void } | null = (() => {
    if (places.length > 0) return null;
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
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <ThemedText style={styles.title}>Nearby</ThemedText>
          <TouchableOpacity
            onPress={() => refreshWithLocation()}
            disabled={isRefreshingEverything}
            accessibilityRole="button"
            style={styles.refreshButton}>
            {isRefreshingEverything ? (
              <ActivityIndicator size="small" color={theme.tint} />
            ) : (
              <IconSymbol name="location.fill" size={14} color={theme.tint} />
            )}
            <ThemedText style={[styles.refreshLabel, { color: theme.tint }]}>Refresh</ThemedText>
          </TouchableOpacity>
        </View>

        {isStale && places.length > 0 && (
          <ThemedText style={[styles.staleNotice, { color: theme.textMuted }]}>
            This may be a little out of date · tap Refresh for the latest
          </ThemedText>
        )}

        {places.length === 0 ? (
          <View style={styles.noticeWrap}>
            <TouchableOpacity
              style={[styles.unavailableCard, { backgroundColor: theme.surface }]}
              disabled={!notice?.onPress}
              onPress={notice?.onPress}
              activeOpacity={notice?.onPress ? 0.7 : 1}>
              <ThemedText type="defaultSemiBold" style={styles.unavailableTitle}>
                {notice?.title}
              </ThemedText>
              <ThemedText style={[styles.unavailableBody, { color: theme.textSecondary }]}>{notice?.body}</ThemedText>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.listContent}
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
            {showMap && (
              <View style={styles.mapCard}>
                <NearbyMap
                  pins={pins}
                  userCoords={device.status === 'granted' ? device.coords : null}
                  selectedPinId={selectedPin?.id ?? null}
                  onSelectPin={setSelectedPinId}
                />
              </View>
            )}
            {showMap && selectedPin && (
              <SelectedPinCard
                pin={selectedPin}
                onOpen={() => goToDetails(selectedPin.id)}
                onOpenInMaps={() => {
                  const place = allPlaces.find((entry) => entry.id === selectedPin.id);
                  if (place) void openPlaceInGoogleMaps(place);
                }}
              />
            )}

            <ThemedText style={[styles.summary, { color: theme.textSecondary }]}>
              {totalCount} {totalCount === 1 ? 'mosque' : 'mosques'} within {radiusKm} km
              {prayerSummary ? ` · ${prayerSummary}` : ''}
            </ThemedText>

            <ThemedText style={[styles.sectionTitle, { color: theme.textMuted }]}>FASTEST TO REACH</ThemedText>
            <View style={[styles.listCard, { backgroundColor: theme.surface }]}>
              {places.map((place, index) => (
                <View key={place.id}>
                  <AlternatePlaceRow
                    place={place}
                    window={timing!.window}
                    context="now"
                    onPress={() => goToDetails(place.id)}
                  />
                  {index < places.length - 1 && (
                    <View style={[styles.rowDivider, { backgroundColor: theme.border }]} />
                  )}
                </View>
              ))}
            </View>

            {morePlaces.length > 0 && (
              <>
                <ThemedText style={[styles.sectionTitle, { color: theme.textMuted }]}>MORE NEARBY</ThemedText>
                <ThemedText style={[styles.sectionCaption, { color: theme.textMuted }]}>
                  Straight-line distance. Live travel times are checked for the nearest {places.length} only.
                </ThemedText>
                <View style={[styles.listCard, { backgroundColor: theme.surface }]}>
                  {morePlaces.map((place, index) => (
                    <View key={place.id}>
                      <DistancePlaceRow place={place} onPress={() => goToDetails(place.id)} />
                      {index < morePlaces.length - 1 && (
                        <View style={[styles.rowDivider, { backgroundColor: theme.border }]} />
                      )}
                    </View>
                  ))}
                </View>
              </>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
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
      style={[styles.selectedCard, { backgroundColor: theme.surface }]}>
      <View style={styles.selectedInfo}>
        <ThemedText type="defaultSemiBold" numberOfLines={1}>
          {pin.name}
        </ThemedText>
        <ThemedText style={[styles.selectedDetail, { color: theme.textSecondary }]} numberOfLines={1}>
          {pin.detail}
        </ThemedText>
      </View>
      <TouchableOpacity
        onPress={onOpenInMaps}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`View ${pin.name} on Google Maps`}
        style={styles.mapsButton}>
        <IconSymbol name="mappin.circle.fill" size={20} color={theme.tint} />
      </TouchableOpacity>
      <IconSymbol name="chevron.right" size={16} color={theme.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 2,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  refreshLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  staleNotice: {
    fontSize: 12,
    paddingHorizontal: 20,
    marginTop: 6,
  },
  noticeWrap: {
    padding: 20,
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
  listContent: {
    padding: 20,
    gap: 10,
  },
  summary: {
    fontSize: 13,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginTop: 6,
  },
  sectionCaption: {
    fontSize: 12,
    marginTop: -6,
  },
  mapCard: {
    height: 260,
    borderRadius: 22,
    overflow: 'hidden',
  },
  selectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 15,
  },
  selectedDetail: {
    fontSize: 13,
  },
  listCard: {
    borderRadius: 22,
    padding: 15,
    gap: 10,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    marginTop: 10,
  },
  selectedInfo: {
    flex: 1,
    gap: 2,
  },
  mapsButton: {
    padding: 2,
  },
});
