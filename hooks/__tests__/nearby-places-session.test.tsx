// Component-level tests (an intentional, narrow exception to this project's
// "pure logic only" testing convention) — the guarantee under test IS a
// React lifecycle property (the Provider persists across navigation while
// screens mount/unmount beneath it), which cannot be verified with a pure
// function alone. Uses react-test-renderer (already a transitive
// dependency, no new test library added) rather than mocking full
// navigation, to keep this focused on the session contract itself.
import * as Location from 'expo-location';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

import type { NearbyPlacesOptions, NearbyPlacesResult } from '@/lib/prayer-places/prayer-place-repository';
import type { TravelTimeMatrixResult, TravelTimeRequest } from '@/lib/prayer-places/travel-time-repository';
import type { GeoCoordinates, PrayerPlaceCandidate } from '@/lib/prayer-places/types';

import { NearbyPlacesSessionProvider, useNearbyPlacesSession, type NearbyPlacesSessionValue } from '../nearby-places-session';

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied' },
}));

const mockedLocation = Location as jest.Mocked<typeof Location>;

const ORIGIN_A: GeoCoordinates = { latitude: 6.9271, longitude: 79.8612 };
// ~5.5km from ORIGIN_A — well beyond the significant-movement threshold.
const ORIGIN_B: GeoCoordinates = { latitude: 6.9771, longitude: 79.8612 };

function place(id: string): PrayerPlaceCandidate {
  return { id, name: `Place ${id}`, area: 'Colombo', coordinates: { latitude: 6.92, longitude: 79.85 } };
}

function grantLocation(coords: GeoCoordinates, timestamp = Date.now()) {
  mockedLocation.requestForegroundPermissionsAsync.mockResolvedValue({
    status: 'granted',
    canAskAgain: true,
  } as never);
  mockedLocation.getCurrentPositionAsync.mockResolvedValueOnce({
    coords: { ...coords, altitude: null, accuracy: null, altitudeAccuracy: null, heading: null, speed: null },
    timestamp,
  } as never);
  mockedLocation.reverseGeocodeAsync.mockResolvedValue([] as never);
}

function makeFakeRepositories() {
  const findNearby = jest.fn(
    async (_origin: GeoCoordinates, _options: NearbyPlacesOptions): Promise<NearbyPlacesResult> => ({
      status: 'ok',
      places: [place('a')],
    })
  );
  const getTravelTimes = jest.fn(
    async (_request: TravelTimeRequest): Promise<TravelTimeMatrixResult> => ({
      status: 'ok',
      results: [{ placeId: 'a', outcome: { status: 'ok', durationSeconds: 300, distanceMeters: 2000, condition: 'ROUTE_EXISTS' } }],
    })
  );
  return { placeRepository: { findNearby }, travelTimeRepository: { getTravelTimes } };
}

/** Captures the session context value so the test can inspect/drive it, standing in for "a screen." */
function SessionProbe({ onValue }: { onValue: (value: NearbyPlacesSessionValue) => void }) {
  const session = useNearbyPlacesSession();
  onValue(session);
  return <Text>{session.state.status}</Text>;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('NearbyPlacesSessionProvider — single session shared across screens', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches Places + Route Matrix exactly once, then reuses the session across simulated Home -> Nearby -> Details navigation', async () => {
    grantLocation(ORIGIN_A);
    const { placeRepository, travelTimeRepository } = makeFakeRepositories();
    let latest: NearbyPlacesSessionValue | undefined;

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <NearbyPlacesSessionProvider placeRepository={placeRepository} travelTimeRepository={travelTimeRepository}>
          <SessionProbe onValue={(v) => (latest = v)} />
        </NearbyPlacesSessionProvider>
      );
    });
    await flush();

    expect(placeRepository.findNearby).toHaveBeenCalledTimes(1);
    expect(travelTimeRepository.getTravelTimes).toHaveBeenCalledTimes(1);
    expect(latest?.state.status).toBe('ready');

    // Simulate navigating Home -> Nearby: a different consumer mounts under
    // the SAME provider (Expo Router would unmount the Home screen and
    // mount Nearby beneath the root-level provider, exactly like this).
    await act(async () => {
      renderer.update(
        <NearbyPlacesSessionProvider placeRepository={placeRepository} travelTimeRepository={travelTimeRepository}>
          <SessionProbe onValue={(v) => (latest = v)} />
          <Text>Nearby screen</Text>
        </NearbyPlacesSessionProvider>
      );
    });
    await flush();

    expect(placeRepository.findNearby).toHaveBeenCalledTimes(1);
    expect(travelTimeRepository.getTravelTimes).toHaveBeenCalledTimes(1);

    // Simulate navigating Nearby -> Place Details: same story again.
    await act(async () => {
      renderer.update(
        <NearbyPlacesSessionProvider placeRepository={placeRepository} travelTimeRepository={travelTimeRepository}>
          <SessionProbe onValue={(v) => (latest = v)} />
          <Text>Place Details screen</Text>
        </NearbyPlacesSessionProvider>
      );
    });
    await flush();

    expect(placeRepository.findNearby).toHaveBeenCalledTimes(1);
    expect(travelTimeRepository.getTravelTimes).toHaveBeenCalledTimes(1);
    // The data itself is the same object identity's worth of candidates —
    // Details is reading the exact session Home already fetched.
    expect(latest?.state.status).toBe('ready');
    if (latest?.state.status === 'ready') {
      expect(latest.state.candidates.map((c) => c.id)).toEqual(['a']);
    }
  });

  it('refetches exactly once per explicit refresh() call, not on every consumer re-render', async () => {
    grantLocation(ORIGIN_A);
    const { placeRepository, travelTimeRepository } = makeFakeRepositories();
    let latest: NearbyPlacesSessionValue | undefined;

    await act(async () => {
      TestRenderer.create(
        <NearbyPlacesSessionProvider placeRepository={placeRepository} travelTimeRepository={travelTimeRepository}>
          <SessionProbe onValue={(v) => (latest = v)} />
        </NearbyPlacesSessionProvider>
      );
    });
    await flush();
    expect(placeRepository.findNearby).toHaveBeenCalledTimes(1);

    await act(async () => {
      latest?.refresh();
    });
    await flush();

    expect(placeRepository.findNearby).toHaveBeenCalledTimes(2);
    expect(travelTimeRepository.getTravelTimes).toHaveBeenCalledTimes(2);
  });

  it('refetches when the device moves significantly, but not for an insignificant/identical fix', async () => {
    grantLocation(ORIGIN_A);
    const { placeRepository, travelTimeRepository } = makeFakeRepositories();
    let latest: NearbyPlacesSessionValue | undefined;

    await act(async () => {
      TestRenderer.create(
        <NearbyPlacesSessionProvider placeRepository={placeRepository} travelTimeRepository={travelTimeRepository}>
          <SessionProbe onValue={(v) => (latest = v)} />
        </NearbyPlacesSessionProvider>
      );
    });
    await flush();
    expect(placeRepository.findNearby).toHaveBeenCalledTimes(1);

    // Re-fetching an identical location fix must not trigger a new session fetch.
    grantLocation(ORIGIN_A);
    await act(async () => {
      await latest?.device.retry();
    });
    await flush();
    expect(placeRepository.findNearby).toHaveBeenCalledTimes(1);

    // Moving ~5.5km away must trigger a fresh session fetch.
    grantLocation(ORIGIN_B);
    await act(async () => {
      await latest?.device.retry();
    });
    await flush();
    expect(placeRepository.findNearby).toHaveBeenCalledTimes(2);
    expect(travelTimeRepository.getTravelTimes).toHaveBeenCalledTimes(2);
  });

  it('surfaces an error state without throwing when the places repository fails', async () => {
    grantLocation(ORIGIN_A);
    const placeRepository = { findNearby: jest.fn(async () => ({ status: 'error' as const, message: 'boom' })) };
    const travelTimeRepository = { getTravelTimes: jest.fn() };
    let latest: NearbyPlacesSessionValue | undefined;

    await act(async () => {
      TestRenderer.create(
        <NearbyPlacesSessionProvider placeRepository={placeRepository} travelTimeRepository={travelTimeRepository}>
          <SessionProbe onValue={(v) => (latest = v)} />
        </NearbyPlacesSessionProvider>
      );
    });
    await flush();

    expect(latest?.state).toEqual({ status: 'error', message: 'boom' });
    expect(travelTimeRepository.getTravelTimes).not.toHaveBeenCalled();
  });

  describe('refreshWithLocation — the compound "refresh location, then Places/Routes" action', () => {
    it('refreshes the device location first, then triggers exactly one more session fetch through the existing refresh() path', async () => {
      grantLocation(ORIGIN_A);
      const { placeRepository, travelTimeRepository } = makeFakeRepositories();
      let latest: NearbyPlacesSessionValue | undefined;

      await act(async () => {
        TestRenderer.create(
          <NearbyPlacesSessionProvider placeRepository={placeRepository} travelTimeRepository={travelTimeRepository}>
            <SessionProbe onValue={(v) => (latest = v)} />
          </NearbyPlacesSessionProvider>
        );
      });
      await flush();
      expect(placeRepository.findNearby).toHaveBeenCalledTimes(1);
      const getCurrentPositionCallsBefore = mockedLocation.getCurrentPositionAsync.mock.calls.length;

      grantLocation(ORIGIN_A); // same place, just a fresh fix for the pull-to-refresh
      await act(async () => {
        await latest?.refreshWithLocation();
      });
      await flush();

      // Location was actually re-requested (not skipped)...
      expect(mockedLocation.getCurrentPositionAsync.mock.calls.length).toBeGreaterThan(getCurrentPositionCallsBefore);
      // ...and exactly one more Places/Routes fetch happened — no duplicate,
      // no second fetch path, still the one shared session call site.
      expect(placeRepository.findNearby).toHaveBeenCalledTimes(2);
      expect(travelTimeRepository.getTravelTimes).toHaveBeenCalledTimes(2);
    });

    it('still refreshes Places/Routes with the last-known coordinates even when the location refresh itself fails', async () => {
      grantLocation(ORIGIN_A);
      const { placeRepository, travelTimeRepository } = makeFakeRepositories();
      let latest: NearbyPlacesSessionValue | undefined;

      await act(async () => {
        TestRenderer.create(
          <NearbyPlacesSessionProvider placeRepository={placeRepository} travelTimeRepository={travelTimeRepository}>
            <SessionProbe onValue={(v) => (latest = v)} />
          </NearbyPlacesSessionProvider>
        );
      });
      await flush();
      expect(placeRepository.findNearby).toHaveBeenCalledTimes(1);

      mockedLocation.getCurrentPositionAsync.mockRejectedValueOnce(new Error('GPS unavailable'));
      await act(async () => {
        await latest?.refreshWithLocation();
      });
      await flush();

      // Location refresh failed (preserved the last-known fix — see
      // use-device-location.test.tsx) but the session still refreshed
      // rather than silently doing nothing.
      expect(latest?.device.status).toBe('granted');
      expect(latest?.device.refreshError).toBeTruthy();
      expect(placeRepository.findNearby).toHaveBeenCalledTimes(2);
    });

    it('refresh indicator lifecycle: session state passes through "loading" during refreshWithLocation and back to "ready" once it resolves', async () => {
      grantLocation(ORIGIN_A);
      const { placeRepository, travelTimeRepository } = makeFakeRepositories();
      let latest: NearbyPlacesSessionValue | undefined;
      const statusesSeen: string[] = [];

      await act(async () => {
        TestRenderer.create(
          <NearbyPlacesSessionProvider placeRepository={placeRepository} travelTimeRepository={travelTimeRepository}>
            <SessionProbe
              onValue={(v) => {
                latest = v;
                statusesSeen.push(v.state.status);
              }}
            />
          </NearbyPlacesSessionProvider>
        );
      });
      await flush();
      expect(latest?.state.status).toBe('ready');
      statusesSeen.length = 0; // only care about what happens during the refresh itself

      grantLocation(ORIGIN_A);
      await act(async () => {
        await latest?.refreshWithLocation();
      });
      await flush();

      expect(statusesSeen).toContain('loading');
      expect(latest?.state.status).toBe('ready');
    });

    it('failed refresh handling: a Places/Routes failure during refreshWithLocation surfaces the existing error state, not a crash', async () => {
      grantLocation(ORIGIN_A);
      const placeRepository = {
        findNearby: jest
          .fn()
          .mockResolvedValueOnce({ status: 'ok', places: [place('a')] })
          .mockResolvedValueOnce({ status: 'error', message: 'network down' }),
      };
      const travelTimeRepository = {
        getTravelTimes: jest.fn(async () => ({
          status: 'ok' as const,
          results: [{ placeId: 'a', outcome: { status: 'ok' as const, durationSeconds: 300, distanceMeters: 2000, condition: 'ROUTE_EXISTS' } }],
        })),
      };
      let latest: NearbyPlacesSessionValue | undefined;

      await act(async () => {
        TestRenderer.create(
          <NearbyPlacesSessionProvider placeRepository={placeRepository} travelTimeRepository={travelTimeRepository}>
            <SessionProbe onValue={(v) => (latest = v)} />
          </NearbyPlacesSessionProvider>
        );
      });
      await flush();
      expect(latest?.state.status).toBe('ready');

      grantLocation(ORIGIN_A);
      await act(async () => {
        await latest?.refreshWithLocation();
      });
      await flush();

      expect(latest?.state).toEqual({ status: 'error', message: 'network down' });
    });
  });
});
