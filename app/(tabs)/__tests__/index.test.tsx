// Component-level tests for Home's conditional rendering (a narrow
// exception — see hooks/__tests__/nearby-places-session.test.tsx for the
// established precedent). The guarantee under test is specifically about
// what actually renders in the JSX tree when location/places fail, which a
// pure function can't express on its own: the prayer card must be visible
// independently of GPS/Places/Routes state (Phase 8C).
import TestRenderer, { act } from 'react-test-renderer';

import { useNearbyPlacesSession } from '@/hooks/nearby-places-session';
import { usePrayerTimes, type PrayerTimesHookState } from '@/hooks/use-prayer-times';
import { buildPlaceScenario } from '@/lib/prayer-places/build-place-scenario';
import type { DeviceLocationState } from '@/hooks/use-device-location';
import type { PlaceScenario } from '@/types/home';

import HomeScreen from '../index';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

jest.mock('@/hooks/nearby-places-session', () => ({
  useNearbyPlacesSession: jest.fn(),
}));

jest.mock('@/hooks/use-prayer-times', () => {
  const actual = jest.requireActual('@/hooks/use-prayer-times');
  return { ...actual, usePrayerTimes: jest.fn() };
});

jest.mock('@/lib/prayer-places/build-place-scenario', () => ({
  buildPlaceScenario: jest.fn(),
}));

const mockedUseNearbyPlacesSession = useNearbyPlacesSession as jest.Mock;
const mockedUsePrayerTimes = usePrayerTimes as jest.Mock;
const mockedBuildPlaceScenario = buildPlaceScenario as jest.Mock;

const READY_PRAYER_TIMES: PrayerTimesHookState = {
  status: 'ready',
  now: {
    window: { name: 'Dhuhr', startTime: '12:15', endTime: '15:20', hasStarted: true },
    countdownSeconds: 3600,
  },
  next: {
    window: { name: 'Asr', startTime: '15:20', endTime: null, hasStarted: false },
    countdownSeconds: 7200,
  },
  schedule: [
    { name: 'Fajr', time: '04:50' },
    { name: 'Dhuhr', time: '12:15' },
    { name: 'Asr', time: '15:20' },
    { name: 'Maghrib', time: '18:10' },
    { name: 'Isha', time: '19:25' },
  ],
  sunriseTime: '06:04',
};

function baseDevice(overrides: Partial<DeviceLocationState> = {}): DeviceLocationState & { retry: jest.Mock } {
  return {
    status: 'granted',
    coords: { latitude: 6.9271, longitude: 79.8612 },
    address: 'Colombo',
    canAskAgain: true,
    errorMessage: null,
    timestamp: Date.now(),
    isRefreshing: false,
    refreshError: null,
    retry: jest.fn(),
    ...overrides,
  };
}

function mockSession(overrides: {
  device?: Partial<DeviceLocationState>;
  state?: any;
  isStale?: boolean;
} = {}) {
  const refresh = jest.fn();
  const refreshWithLocation = jest.fn(async () => {});
  mockedUseNearbyPlacesSession.mockReturnValue({
    device: baseDevice(overrides.device),
    state: overrides.state ?? { status: 'loading' },
    isStale: overrides.isStale ?? false,
    refresh,
    refreshWithLocation,
  });
  return { refresh, refreshWithLocation };
}

function renderHome() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<HomeScreen />);
  });
  return renderer;
}

/** Flattens the rendered tree to a single searchable string of all text content. */
function allText(renderer: TestRenderer.ReactTestRenderer): string {
  function collect(node: unknown): string[] {
    if (node === null || node === undefined || typeof node === 'boolean') return [];
    if (typeof node === 'string' || typeof node === 'number') return [String(node)];
    if (Array.isArray(node)) return node.flatMap(collect);
    if (typeof node === 'object' && 'children' in (node as any)) return collect((node as any).children);
    return [];
  }
  return collect(renderer.toJSON()).join(' | ');
}

const PLACE_SCENARIO: PlaceScenario = {
  recommendation: {
    id: 'place-rec',
    name: 'Colombo Grand Mosque',
    area: 'Colombo 12',
    coordinates: { latitude: 6.9354, longitude: 79.8517 },
    distanceKm: 1.2,
    etaMinutes: 8,
    arrivalTime: '12:30',
    feasibility: 'comfortable',
  },
  alternates: [
    {
      id: 'place-alt-1',
      name: 'Jami Ul-Alfar Mosque',
      area: 'Pettah',
      coordinates: { latitude: 6.937, longitude: 79.849 },
      distanceKm: 2.1,
      etaMinutes: 12,
      arrivalTime: '12:35',
      feasibility: 'tight',
    },
  ],
};

describe('Home — prayer card renders independently of location/places state (Phase 8C)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUsePrayerTimes.mockReturnValue(READY_PRAYER_TIMES);
    mockedBuildPlaceScenario.mockReturnValue(PLACE_SCENARIO);
  });

  it('renders the prayer card when GPS/location is unavailable (denied)', () => {
    mockSession({ device: { status: 'denied', coords: null, timestamp: null } });

    const renderer = renderHome();
    const text = allText(renderer);

    expect(text).toContain('CURRENT PRAYER');
    expect(text).toContain('Dhuhr');
  });

  it('renders the prayer card when GPS/location errored out', () => {
    mockSession({ device: { status: 'error', coords: null, timestamp: null, errorMessage: 'GPS timed out' } });

    const renderer = renderHome();
    const text = allText(renderer);

    expect(text).toContain('CURRENT PRAYER');
    expect(text).toContain('Dhuhr');
  });

  it('renders the prayer card when there are no nearby places', () => {
    mockSession({ state: { status: 'empty', fetchedAt: Date.now() } });

    const renderer = renderHome();
    const text = allText(renderer);

    expect(text).toContain('CURRENT PRAYER');
    expect(text).toContain('Dhuhr');
    // The location/recommendation section shows its own honest notice —
    // it doesn't get to erase the prayer card above it.
    expect(text).toContain('No prayer places found nearby');
  });

  it('renders the prayer card when Places/Routes failed', () => {
    mockSession({ state: { status: 'error', message: 'network down' } });

    const renderer = renderHome();
    const text = allText(renderer);

    expect(text).toContain('CURRENT PRAYER');
    expect(text).toContain('Dhuhr');
    expect(text).toContain('Nearby places unavailable');
  });

  it('renders the prayer card when Places succeeded but Routes found no reachable candidates', () => {
    mockSession({ state: { status: 'unreachable', fetchedAt: Date.now() } });

    const renderer = renderHome();
    const text = allText(renderer);

    expect(text).toContain('CURRENT PRAYER');
    expect(text).toContain('No reachable prayer places found');
  });

  it('shows the recommendation normally when everything is ready (sanity check the fix did not break the happy path)', () => {
    mockSession({ state: { status: 'ready', candidates: [], fetchedAt: Date.now() } });

    const renderer = renderHome();
    const text = allText(renderer);

    expect(text).toContain('CURRENT PRAYER');
    expect(text).toContain('Colombo Grand Mosque');
    expect(text).toContain('Jami Ul-Alfar Mosque');
  });
});

describe('Home — explicit prayer-data-unavailable state (Phase 8C)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows a distinct prayer-data-unavailable state when the prayer engine has no data, never a places notice and never a silent fallback', () => {
    mockedUsePrayerTimes.mockReturnValue({ status: 'unavailable', reason: 'No ACJU schedule published for this date.' });
    mockSession({ device: { status: 'granted' }, state: { status: 'ready', candidates: [], fetchedAt: Date.now() } });

    const renderer = renderHome();
    const text = allText(renderer);

    expect(text).toContain("Prayer times aren't available for today");
    expect(text).toContain('No ACJU schedule published for this date.');
    // Never conflated with a location/places message, and never silently
    // showing some other zone's schedule instead.
    expect(text).not.toContain('CURRENT PRAYER');
    expect(text).not.toContain('NEXT PRAYER');
    expect(mockedBuildPlaceScenario).not.toHaveBeenCalled();
  });
});

describe('Home — Google Maps action on alternates does not trigger another API call (Phase 8C)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUsePrayerTimes.mockReturnValue(READY_PRAYER_TIMES);
    mockedBuildPlaceScenario.mockReturnValue(PLACE_SCENARIO);
  });

  it('pressing an alternate\'s Google Maps action never calls refresh/refreshWithLocation (no extra Places/Routes fetch)', () => {
    const { refresh, refreshWithLocation } = mockSession({ state: { status: 'ready', candidates: [], fetchedAt: Date.now() } });

    const renderer = renderHome();
    const mapsButton = renderer.root.findByProps({
      accessibilityLabel: `View ${PLACE_SCENARIO.alternates[0].name} on Google Maps`,
    });

    act(() => {
      mapsButton.props.onPress();
    });

    expect(refresh).not.toHaveBeenCalled();
    expect(refreshWithLocation).not.toHaveBeenCalled();
    expect(mockedBuildPlaceScenario).toHaveBeenCalledTimes(1); // only the initial render's call — pressing Maps didn't trigger another
  });
});
