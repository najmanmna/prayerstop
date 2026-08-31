import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { formatAddress } from '@/lib/location';

export type DeviceLocationStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'error';

// expo-location's getCurrentPositionAsync has no built-in timeout option (no
// `timeout` field on LocationOptions) — without one, a stuck GPS fix (weak
// signal, indoors, a simulator with no location set) leaves the promise
// pending forever and `isRefreshing` stuck true. ~15-20s is enough for a
// real fix on typical hardware without leaving the spinner up too long.
const GPS_TIMEOUT_MS = 18_000;
// Reverse geocoding is non-critical (falls back to raw coordinates elsewhere
// — see lib/location.ts), so it gets a much shorter timeout of its own
// rather than risking the same indefinite-hang class of bug for something
// that isn't worth waiting long for.
const REVERSE_GEOCODE_TIMEOUT_MS = 8_000;

/** Races `promise` against a timeout, clearing the timer whichever settles first — never leaves a dangling timer behind. */
function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export interface DeviceLocationState {
  status: DeviceLocationStatus;
  coords: { latitude: number; longitude: number } | null;
  /** A short "neighborhood, city" label from reverse geocoding, when available. */
  address: string | null;
  /** Whether the OS permission prompt can be shown again, vs. requiring a trip to Settings. */
  canAskAgain: boolean;
  errorMessage: string | null;
  /** When `coords` was fetched (device clock, ms since epoch) — lets callers detect a stale fix. Null until a fix succeeds. */
  timestamp: number | null;
  /**
   * True while a *refresh* of an already-granted fix is in flight (manual
   * "Refresh location" tap, or an automatic refresh on foreground resume).
   * Distinct from `status: 'requesting'`, which is only for the initial
   * permission/fetch flow — a refresh keeps `status: 'granted'` and the
   * last-known `coords`/`address` visible throughout, so the UI never
   * collapses back to a bare "Locating…" state for what should be a quick,
   * unobtrusive update.
   */
  isRefreshing: boolean;
  /**
   * Set when a *refresh* of an already-granted fix times out or fails —
   * `status` stays 'granted' and the last-known `coords`/`address`/session
   * are deliberately left untouched (see the "preserve last-known fix" rule
   * in CLAUDE.md's location-freshness notes). Distinct from `errorMessage`,
   * which is only for the no-fix-at-all case (`status: 'error'`). Cleared
   * as soon as the next refresh attempt starts.
   */
  refreshError: string | null;
}

const initialState: DeviceLocationState = {
  status: 'idle',
  coords: null,
  address: null,
  canAskAgain: true,
  errorMessage: null,
  timestamp: null,
  isRefreshing: false,
  refreshError: null,
};

/**
 * Requests foreground location permission and fetches the device's current
 * coordinates. Automatically refreshes when the app returns to the
 * foreground (see the `AppState` effect below) — improves location
 * freshness without needing any continuous background GPS watching, which
 * this app deliberately does not do.
 */
export function useDeviceLocation() {
  const [state, setState] = useState<DeviceLocationState>(initialState);
  const statusRef = useRef(state.status);
  statusRef.current = state.status;
  // Guards every setState below against firing after unmount — the GPS/geocode
  // timeouts race a promise that can still settle after the component using
  // this hook is gone (see the "clean up on unmount" requirement).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  // Re-entrancy guard: without this, a second overlapping call (most
  // commonly triggered by the OS permission/location dialog itself briefly
  // sending this app to 'inactive' then 'active', which fires the
  // foreground-resume effect below mid-request) starts a second native GPS
  // fetch while the first is still in flight. The two independently flip
  // `isRefreshing`/`refreshError`/`coords` as they resolve out of order,
  // which is what actually produced the spinner-never-settles / "couldn't
  // refresh" flicker — not the timeout itself. Only one request may be in
  // flight at a time; anything else just awaits the same one.
  const inFlightRef = useRef<Promise<void> | null>(null);

  const requestLocation = useCallback((): Promise<void> => {
    if (inFlightRef.current) return inFlightRef.current;

    const run = async () => {
      // A refresh of an already-granted fix stays on `status: 'granted'`
      // (last-known coords/address still shown) and only flags `isRefreshing`
      // — only the very first fetch (or a retry after denied/error) flips
      // `status` to 'requesting'. Either way, a new attempt clears any
      // `refreshError` left over from a previous failed refresh.
      if (statusRef.current === 'granted') {
        setState((prev) => ({ ...prev, isRefreshing: true, refreshError: null }));
      } else {
        setState((prev) => ({
          ...prev,
          status: 'requesting',
          errorMessage: null,
          isRefreshing: false,
          refreshError: null,
        }));
      }

      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== Location.PermissionStatus.GRANTED) {
          if (!mountedRef.current) return;
          setState({
            status: 'denied',
            coords: null,
            address: null,
            canAskAgain: permission.canAskAgain,
            errorMessage: null,
            timestamp: null,
            isRefreshing: false,
            refreshError: null,
          });
          return;
        }

        const position = await withTimeout(
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          GPS_TIMEOUT_MS,
          'Getting your location is taking longer than expected.'
        );
        const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };

        // Reverse geocoding uses the OS's own geocoder (no Google API) and can
        // fail (or hang) independently of the GPS fix — coordinates are still
        // shown either way, so this never blocks the fix itself for long.
        let address: string | null = null;
        try {
          const [result] = await withTimeout(
            Location.reverseGeocodeAsync(coords),
            REVERSE_GEOCODE_TIMEOUT_MS,
            'Reverse geocoding timed out.'
          );
          address = result ? formatAddress(result) : null;
        } catch {
          address = null;
        }

        if (!mountedRef.current) return;
        setState({
          status: 'granted',
          coords,
          address,
          canAskAgain: true,
          errorMessage: null,
          timestamp: position.timestamp,
          isRefreshing: false,
          refreshError: null,
        });
      } catch (error) {
        if (!mountedRef.current) return;
        const message = error instanceof Error ? error.message : 'Could not get your location.';
        // A refresh that fails or times out (e.g. a brief GPS hiccup, no fix
        // available indoors, a simulator with no location set) keeps the
        // last-known-good fix — and the nearby-places session built on it —
        // visible rather than wiping either out. `refreshError` surfaces a
        // compact, retryable notice for this case; only the initial
        // fetch/retry-after-denied path (no last-known fix to fall back to)
        // uses the terminal `status: 'error'` + `errorMessage` instead.
        setState((prev) =>
          prev.status === 'granted'
            ? { ...prev, isRefreshing: false, refreshError: message }
            : {
                status: 'error',
                coords: null,
                address: null,
                canAskAgain: true,
                errorMessage: message,
                timestamp: null,
                isRefreshing: false,
                refreshError: null,
              }
        );
      }
    };

    const promise = run().finally(() => {
      inFlightRef.current = null;
    });
    inFlightRef.current = promise;
    return promise;
  }, []);

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  useEffect(() => {
    // Plain equality, not a regex `.match` — `AppState.currentState` isn't
    // guaranteed to be a string in every environment (e.g. it's unset in
    // some test/non-native runtimes), and equality checks stay safe either way.
    let appState: AppStateStatus = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasBackgrounded = appState === 'inactive' || appState === 'background';
      if (wasBackgrounded && nextState === 'active') {
        requestLocation();
      }
      appState = nextState;
    });
    return () => subscription.remove();
  }, [requestLocation]);

  return { ...state, retry: requestLocation };
}
