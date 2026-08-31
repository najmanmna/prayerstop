// Component-level tests (same justified exception as
// hooks/__tests__/nearby-places-session.test.tsx) — foreground-resume
// behavior and the "keep the last-known fix visible during a refresh"
// state machine are hook lifecycle properties that need the hook actually
// running, not just a pure function.
import * as Location from 'expo-location';
import { AppState, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

import { useDeviceLocation, type DeviceLocationState } from '../use-device-location';

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied' },
}));

const mockedLocation = Location as jest.Mocked<typeof Location>;
let mockedAddEventListener: jest.SpyInstance;

function mockFix(latitude: number, timestamp: number) {
  mockedLocation.requestForegroundPermissionsAsync.mockResolvedValue({
    status: 'granted',
    canAskAgain: true,
  } as never);
  mockedLocation.getCurrentPositionAsync.mockResolvedValueOnce({
    coords: { latitude, longitude: 79.8612, altitude: null, accuracy: null, altitudeAccuracy: null, heading: null, speed: null },
    timestamp,
  } as never);
  mockedLocation.reverseGeocodeAsync.mockResolvedValue([] as never);
}

function Probe({ onValue }: { onValue: (value: DeviceLocationState & { retry: () => Promise<void> }) => void }) {
  const location = useDeviceLocation();
  onValue(location);
  return <Text>{location.status}</Text>;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useDeviceLocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAddEventListener = jest
      .spyOn(AppState, 'addEventListener')
      .mockReturnValue({ remove: jest.fn() } as never);
  });

  afterEach(() => {
    mockedAddEventListener.mockRestore();
  });

  it('fetches the initial fix on mount', async () => {
    mockFix(6.9271, 1000);
    let latest: (DeviceLocationState & { retry: () => void }) | undefined;

    await act(async () => {
      TestRenderer.create(<Probe onValue={(v) => (latest = v)} />);
    });
    await flush();

    expect(latest?.status).toBe('granted');
    expect(latest?.coords?.latitude).toBe(6.9271);
    expect(latest?.isRefreshing).toBe(false);
  });

  it('manual refresh (unchanged location): stays "granted" throughout, never flickers to "requesting", and isRefreshing toggles', async () => {
    mockFix(6.9271, 1000);
    let latest: (DeviceLocationState & { retry: () => void }) | undefined;
    const statusesSeen: string[] = [];

    await act(async () => {
      TestRenderer.create(
        <Probe
          onValue={(v) => {
            latest = v;
            statusesSeen.push(v.status);
          }}
        />
      );
    });
    await flush();
    statusesSeen.length = 0; // only care about statuses seen during the refresh itself, not the initial fetch

    mockFix(6.9271, 2000); // same coordinates, a newer fix
    await act(async () => {
      latest?.retry();
    });
    await flush();

    expect(latest?.status).toBe('granted');
    expect(latest?.timestamp).toBe(2000);
    expect(latest?.isRefreshing).toBe(false);
    // At no point during the manual refresh did status regress to
    // 'requesting' — the last-known fix must stay visible throughout.
    expect(statusesSeen).not.toContain('requesting');
  });

  it('significant movement: a refresh returning very different coordinates still just updates the fix (the session layer decides what "significant" means)', async () => {
    mockFix(6.9271, 1000);
    let latest: (DeviceLocationState & { retry: () => void }) | undefined;

    await act(async () => {
      TestRenderer.create(<Probe onValue={(v) => (latest = v)} />);
    });
    await flush();

    mockFix(7.5, 2000); // a large jump
    await act(async () => {
      latest?.retry();
    });
    await flush();

    expect(latest?.coords?.latitude).toBe(7.5);
    expect(latest?.timestamp).toBe(2000);
  });

  it('a failed refresh preserves the last-known-good fix and surfaces a compact, retryable refreshError instead of the terminal error state', async () => {
    mockFix(6.9271, 1000);
    let latest: (DeviceLocationState & { retry: () => void }) | undefined;

    await act(async () => {
      TestRenderer.create(<Probe onValue={(v) => (latest = v)} />);
    });
    await flush();
    expect(latest?.refreshError).toBeNull();

    mockedLocation.getCurrentPositionAsync.mockRejectedValueOnce(new Error('GPS unavailable'));
    await act(async () => {
      latest?.retry();
    });
    await flush();

    expect(latest?.status).toBe('granted');
    expect(latest?.coords?.latitude).toBe(6.9271);
    expect(latest?.timestamp).toBe(1000);
    expect(latest?.isRefreshing).toBe(false);
    expect(latest?.refreshError).toBe('GPS unavailable');
  });

  it('a subsequent successful refresh clears a previous refreshError', async () => {
    mockFix(6.9271, 1000);
    let latest: (DeviceLocationState & { retry: () => void }) | undefined;

    await act(async () => {
      TestRenderer.create(<Probe onValue={(v) => (latest = v)} />);
    });
    await flush();

    mockedLocation.getCurrentPositionAsync.mockRejectedValueOnce(new Error('GPS unavailable'));
    await act(async () => {
      latest?.retry();
    });
    await flush();
    expect(latest?.refreshError).toBe('GPS unavailable');

    mockFix(6.93, 2000);
    await act(async () => {
      latest?.retry();
    });
    await flush();

    expect(latest?.refreshError).toBeNull();
    expect(latest?.coords?.latitude).toBe(6.93);
  });

  it('an initial fetch failure (not a refresh of an existing fix) still surfaces status "error"', async () => {
    mockedLocation.requestForegroundPermissionsAsync.mockResolvedValue({
      status: 'granted',
      canAskAgain: true,
    } as never);
    mockedLocation.getCurrentPositionAsync.mockRejectedValue(new Error('No GPS'));
    let latest: (DeviceLocationState & { retry: () => void }) | undefined;

    await act(async () => {
      TestRenderer.create(<Probe onValue={(v) => (latest = v)} />);
    });
    await flush();

    expect(latest?.status).toBe('error');
    expect(latest?.errorMessage).toBe('No GPS');
  });

  it('automatically refreshes when the app returns to the foreground', async () => {
    mockFix(6.9271, 1000);

    await act(async () => {
      TestRenderer.create(<Probe onValue={() => {}} />);
    });
    await flush();

    expect(mockedLocation.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
    expect(mockedAddEventListener).toHaveBeenCalledWith('change', expect.any(Function));

    const onAppStateChange = mockedAddEventListener.mock.calls[0][1];
    mockFix(6.93, 2000);

    await act(async () => {
      onAppStateChange('background');
      onAppStateChange('active');
      await Promise.resolve();
    });
    await flush();

    expect(mockedLocation.getCurrentPositionAsync).toHaveBeenCalledTimes(2);
  });

  it('does not refetch on an inactive/background transition alone (only on the return to active)', async () => {
    mockFix(6.9271, 1000);

    await act(async () => {
      TestRenderer.create(<Probe onValue={() => {}} />);
    });
    await flush();

    const onAppStateChange = mockedAddEventListener.mock.calls[0][1];
    await act(async () => {
      onAppStateChange('inactive');
      onAppStateChange('background');
    });
    await flush();

    expect(mockedLocation.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
  });

  it('re-entrancy: an overlapping call while one is already in flight awaits the same request instead of starting a second native fetch (this is what actually caused the spinner/notice to flicker — see e.g. the OS permission dialog itself briefly toggling AppState and re-triggering foreground-resume mid-request)', async () => {
    mockFix(6.9271, 1000);
    let latest: (DeviceLocationState & { retry: () => Promise<void> }) | undefined;

    await act(async () => {
      TestRenderer.create(<Probe onValue={(v) => (latest = v)} />);
    });
    await flush();
    const callsAfterMount = mockedLocation.getCurrentPositionAsync.mock.calls.length;

    let resolveFix: (value: unknown) => void = () => {};
    mockedLocation.getCurrentPositionAsync.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFix = resolve as (value: unknown) => void;
      }) as never
    );

    let firstPromise: Promise<void> | undefined;
    let secondPromise: Promise<void> | undefined;
    await act(async () => {
      firstPromise = latest?.retry();
      secondPromise = latest?.retry(); // fires before the first has settled
      await Promise.resolve();
    });

    // Only one native call was actually made for both overlapping requests.
    expect(mockedLocation.getCurrentPositionAsync.mock.calls.length).toBe(callsAfterMount + 1);
    expect(firstPromise).toBe(secondPromise);

    await act(async () => {
      resolveFix({
        coords: {
          latitude: 6.93,
          longitude: 79.8612,
          altitude: null,
          accuracy: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: 5000,
      });
      await firstPromise;
      await secondPromise;
    });
    await flush();

    // Settles once, cleanly, to a single consistent final state — no
    // flicker between two independently-resolving overlapping requests.
    expect(latest?.status).toBe('granted');
    expect(latest?.coords?.latitude).toBe(6.93);
    expect(latest?.isRefreshing).toBe(false);
    expect(latest?.refreshError).toBeNull();
  });

  describe('GPS timeout', () => {
    // expo-location's getCurrentPositionAsync has no built-in timeout, so
    // these specifically exercise the ~18s Promise.race timeout wrapper in
    // use-device-location.ts — needs fake timers to advance past it without
    // an 18-real-second test.
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('stops the spinner and exposes a retryable refreshError after ~18s with no fix, preserving the last-known coordinates and status', async () => {
      mockFix(6.9271, 1000);
      let latest: (DeviceLocationState & { retry: () => void }) | undefined;

      await act(async () => {
        TestRenderer.create(<Probe onValue={(v) => (latest = v)} />);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(latest?.status).toBe('granted');
      expect(latest?.coords?.latitude).toBe(6.9271);

      // A refresh whose GPS fix never arrives.
      mockedLocation.getCurrentPositionAsync.mockReturnValue(new Promise(() => {}));
      await act(async () => {
        latest?.retry();
        await Promise.resolve();
      });
      expect(latest?.isRefreshing).toBe(true);

      await act(async () => {
        jest.advanceTimersByTime(18_000);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(latest?.isRefreshing).toBe(false);
      expect(latest?.status).toBe('granted'); // not wiped out / not a terminal error
      expect(latest?.coords?.latitude).toBe(6.9271); // last-known fix preserved
      expect(latest?.timestamp).toBe(1000); // still the old fix's timestamp, not a fabricated new one
      expect(latest?.refreshError).toMatch(/taking longer than expected/i);
    });

    it('a manual retry after a timeout can still succeed, clearing refreshError and adopting the fresh fix', async () => {
      mockFix(6.9271, 1000);
      let latest: (DeviceLocationState & { retry: () => void }) | undefined;

      await act(async () => {
        TestRenderer.create(<Probe onValue={(v) => (latest = v)} />);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      mockedLocation.getCurrentPositionAsync.mockReturnValue(new Promise(() => {}));
      await act(async () => {
        latest?.retry();
        await Promise.resolve();
      });
      await act(async () => {
        jest.advanceTimersByTime(18_000);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(latest?.refreshError).toBeTruthy();

      mockFix(6.93, 2000);
      await act(async () => {
        latest?.retry();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(latest?.refreshError).toBeNull();
      expect(latest?.status).toBe('granted');
      expect(latest?.coords?.latitude).toBe(6.93);
      expect(latest?.timestamp).toBe(2000);
    });

    it('cleans up the timeout timer without warning if the component unmounts while a fix is still pending', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockFix(6.9271, 1000);
      let renderer: TestRenderer.ReactTestRenderer | undefined;
      let latest: (DeviceLocationState & { retry: () => void }) | undefined;

      await act(async () => {
        renderer = TestRenderer.create(<Probe onValue={(v) => (latest = v)} />);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      mockedLocation.getCurrentPositionAsync.mockReturnValue(new Promise(() => {}));
      await act(async () => {
        latest?.retry();
        await Promise.resolve();
      });
      expect(latest?.isRefreshing).toBe(true);

      act(() => {
        renderer?.unmount();
      });

      // The timeout still fires on schedule (nothing to cancel it early —
      // see withTimeout), but the mountedRef guard must stop it from ever
      // calling setState on the now-unmounted component.
      await act(async () => {
        jest.advanceTimersByTime(18_000);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(consoleErrorSpy).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });
});
