import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Platform, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AlternatePlaceRow } from '@/components/home/alternate-place-row';
import { NearbyMap } from '@/components/nearby/nearby-map';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, FeasibilityColors } from '@/constants/theme';
import { useNearbyPlacesSession } from '@/hooks/nearby-places-session';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { selectPrayerTimesForContext, usePrayerTimes } from '@/hooks/use-prayer-times';
import { buildPlaceScenario } from '@/lib/prayer-places/build-place-scenario';
import { buildPlaceDetailsPath } from '@/lib/prayer-places/find-candidate';
import { openPlaceInGoogleMaps } from '@/lib/prayer-places/navigation';
import { formatClock12 } from '@/lib/time';
import type { PrayerPlace } from '@/types/home';

type ViewMode = 'list' | 'map';

// expo-maps' Apple Maps path is the only one wired up (Android's Google
// Maps path needs its own Maps SDK API key we don't have configured — see
// docs/06-data-and-api-plan.md). Only offer the toggle where it works.
const MAP_SUPPORTED = Platform.OS === 'ios';

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
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);

  const places: PrayerPlace[] =
    timing && nearby.status === 'ready'
      ? (() => {
          const scenario = buildPlaceScenario(nearby.candidates, 'now', timing.window, timing.countdownSeconds);
          return scenario ? [scenario.recommendation, ...scenario.alternates] : [];
        })()
      : [];

  const selectedPlace = places.find((place) => place.id === selectedPlaceId) ?? places[0] ?? null;
  const goToDetails = (placeId: string) => router.push(buildPlaceDetailsPath(placeId));

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

        {MAP_SUPPORTED && places.length > 0 && (
          <View style={styles.toggleRow}>
            <ToggleButton label="List" active={viewMode === 'list'} onPress={() => setViewMode('list')} />
            <ToggleButton label="Map" active={viewMode === 'map'} onPress={() => setViewMode('map')} />
          </View>
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
        ) : viewMode === 'map' && MAP_SUPPORTED ? (
          <View style={styles.mapArea}>
            <NearbyMap
              places={places}
              userCoords={device.status === 'granted' ? device.coords : null}
              selectedPlaceId={selectedPlace?.id ?? null}
              onSelectPlace={setSelectedPlaceId}
            />
            {selectedPlace && (
              <SelectedPlaceCard
                place={selectedPlace}
                theme={theme}
                onPress={() => goToDetails(selectedPlace.id)}
              />
            )}
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
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function ToggleButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = Colors[useColorScheme() ?? 'light'];
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.toggleButton, active && { backgroundColor: theme.surfaceElevated }]}>
      <ThemedText
        type={active ? 'defaultSemiBold' : 'default'}
        style={[styles.toggleLabel, { color: active ? theme.tint : theme.textSecondary }]}>
        {label}
      </ThemedText>
    </TouchableOpacity>
  );
}

function SelectedPlaceCard({
  place,
  theme,
  onPress,
}: {
  place: PrayerPlace;
  theme: (typeof Colors)['light'];
  onPress: () => void;
}) {
  const statusColor = FeasibilityColors[place.feasibility].foreground;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      style={[styles.selectedCard, { backgroundColor: theme.surfaceElevated }]}>
      <View style={styles.selectedInfo}>
        <ThemedText type="defaultSemiBold" numberOfLines={1}>
          {place.name}
        </ThemedText>
        <ThemedText style={[styles.selectedArea, { color: theme.textSecondary }]} numberOfLines={1}>
          {place.area}
        </ThemedText>
      </View>
      <View style={styles.selectedMeta}>
        <ThemedText style={[styles.selectedEta, { color: statusColor }]}>{place.etaMinutes} min</ThemedText>
        <ThemedText style={[styles.selectedArrival, { color: theme.textMuted }]}>
          Arrive {formatClock12(place.arrivalTime)}
        </ThemedText>
      </View>
      <TouchableOpacity
        onPress={() => openPlaceInGoogleMaps(place.name, place.id)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`View ${place.name} on Google Maps`}
        style={styles.mapsButton}>
        <IconSymbol name="mappin.circle.fill" size={18} color={theme.tint} />
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
  toggleRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 14,
    padding: 3,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 10,
    alignItems: 'center',
  },
  toggleLabel: {
    fontSize: 13,
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
  listCard: {
    borderRadius: 22,
    padding: 15,
    gap: 10,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    marginTop: 10,
  },
  mapArea: {
    flex: 1,
    margin: 20,
    marginTop: 14,
  },
  selectedCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  selectedInfo: {
    flex: 1,
    gap: 2,
  },
  selectedArea: {
    fontSize: 12,
  },
  selectedMeta: {
    alignItems: 'flex-end',
    gap: 2,
  },
  selectedEta: {
    fontSize: 14,
    fontWeight: '700',
  },
  selectedArrival: {
    fontSize: 11,
  },
  mapsButton: {
    padding: 2,
  },
});
