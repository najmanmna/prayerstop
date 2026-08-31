import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { fetchNearbySession } from '@/lib/prayer-places/fetch-nearby-session';
import { googlePlacesRepository } from '@/lib/prayer-places/google-places-repository';
import { googleRouteMatrixRepository } from '@/lib/prayer-places/google-route-matrix-repository';
import type { PrayerPlaceRepository } from '@/lib/prayer-places/prayer-place-repository';
import { hasMovedSignificantly, isSessionTimeStale } from '@/lib/prayer-places/session-staleness';
import type { TravelTimeRepository } from '@/lib/prayer-places/travel-time-repository';
import type { GeoCoordinates, RankedPrayerPlaceCandidate } from '@/lib/prayer-places/types';

import { useDeviceLocation } from './use-device-location';

export type NearbyPlacesSessionState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; candidates: RankedPrayerPlaceCandidate[]; fetchedAt: number }
  // Places were found nearby, but Google Routes couldn't compute a route to
  // any of them — a distinct, honest state from 'empty' (no places exist).
  | { status: 'unreachable'; fetchedAt: number }
  | { status: 'empty'; fetchedAt: number }
  | { status: 'error'; message: string };

export interface NearbyPlacesSessionValue {
  device: ReturnType<typeof useDeviceLocation>;
  state: NearbyPlacesSessionState;
  /** True once the session's data is old enough to be worth refreshing — a display/prompt signal only, never an automatic refetch trigger (see docs/05). */
  isStale: boolean;
  /** Forces a new Places + Route Matrix fetch regardless of staleness. */
  refresh: () => void;
  /**
   * The full "pull to refresh" action: refreshes the device location first,
   * then triggers the same explicit session refresh `refresh()` does —
   * still exactly one Places/Routes call site (`fetchNearbySession`, inside
   * this Provider's own effect), never a second fetch path. Refreshes the
   * session regardless of whether the location refresh itself succeeded —
   * a failed/timed-out GPS refresh preserves the last-known coordinates
   * (see hooks/use-device-location.ts), and those are still worth an
   * explicit Places/Routes refresh rather than doing nothing at all.
   */
  refreshWithLocation: () => Promise<void>;
}

const NearbyPlacesSessionContext = createContext<NearbyPlacesSessionValue | null>(null);

/**
 * The one place in the app that fetches a nearby-places session. Mounted
 * once at the root (`app/_layout.tsx`), above the router stack, so it
 * survives navigation between Home, Nearby, and Place Details — those
 * screens are thin consumers via `useNearbyPlacesSession()`, never
 * independent fetchers. This is what makes "one Places + one Route Matrix
 * request per session" an architectural guarantee rather than a convention
 * that duplicate hooks could quietly violate (see the non-negotiable rule
 * in CLAUDE.md and "Shared nearby-places session" in docs/05).
 *
 * Refetches only when: this is the first fetch, the device has moved
 * significantly from where the current session was fetched, or `refresh()`
 * was called explicitly. Never on a timer — see `session-staleness.ts` for
 * the "reuse while fresh" thresholds, and `isStale` for the display-only
 * time-based signal.
 */
export function NearbyPlacesSessionProvider({
  children,
  placeRepository = googlePlacesRepository,
  travelTimeRepository = googleRouteMatrixRepository,
}: {
  children: ReactNode;
  placeRepository?: PrayerPlaceRepository;
  travelTimeRepository?: TravelTimeRepository;
}) {
  const device = useDeviceLocation();
  const [state, setState] = useState<NearbyPlacesSessionState>({ status: 'idle' });
  const [refreshToken, setRefreshToken] = useState(0);
  const sessionOriginRef = useRef<GeoCoordinates | null>(null);
  const previousRefreshTokenRef = useRef(refreshToken);

  const refresh = useCallback(() => setRefreshToken((value) => value + 1), []);

  const deviceRetry = device.retry;
  const refreshWithLocation = useCallback(async () => {
    // Awaited even though it never throws (use-device-location.ts catches
    // its own errors and always resolves) — the point is sequencing: don't
    // fire the session refresh until the location attempt has settled,
    // whether it succeeded or preserved the last-known fix.
    await deviceRetry();
    refresh();
  }, [deviceRetry, refresh]);

  useEffect(() => {
    const coords = device.status === 'granted' ? device.coords : null;

    // A refresh is "requested" only on the specific run where refreshToken
    // actually changed — comparing against a ref (not `refreshToken > 0`)
    // so a refresh from five renders ago doesn't keep forcing every later,
    // unrelated re-run (e.g. a tiny non-significant coordinate jitter) to
    // refetch too.
    const refreshRequested = refreshToken !== previousRefreshTokenRef.current;
    previousRefreshTokenRef.current = refreshToken;

    if (!coords) {
      setState({ status: 'idle' });
      sessionOriginRef.current = null;
      return;
    }

    const origin = sessionOriginRef.current;
    const shouldRefetch = !origin || refreshRequested || hasMovedSignificantly(origin, coords);
    if (!shouldRefetch) return;

    let cancelled = false;
    setState({ status: 'loading' });

    fetchNearbySession(coords, placeRepository, travelTimeRepository).then((result) => {
      if (cancelled) return;
      sessionOriginRef.current = coords;
      const fetchedAt = Date.now();

      if (result.status === 'error') {
        setState({ status: 'error', message: result.message });
      } else if (result.status === 'empty') {
        setState({ status: 'empty', fetchedAt });
      } else if (result.status === 'unreachable') {
        setState({ status: 'unreachable', fetchedAt });
      } else {
        setState({ status: 'ready', candidates: result.candidates, fetchedAt });
      }
    });

    return () => {
      cancelled = true;
    };
    // coords is destructured to lat/lng, and timestamp is deliberately
    // excluded, so a fresh GPS fix with materially the same coordinates
    // does not by itself force a refetch — only a significant move does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device.status, device.coords?.latitude, device.coords?.longitude, refreshToken, placeRepository, travelTimeRepository]);

  const isStale =
    (state.status === 'ready' || state.status === 'empty' || state.status === 'unreachable') &&
    isSessionTimeStale(state.fetchedAt, Date.now());

  return (
    <NearbyPlacesSessionContext.Provider value={{ device, state, isStale, refresh, refreshWithLocation }}>
      {children}
    </NearbyPlacesSessionContext.Provider>
  );
}

/** Reads the shared nearby-places session. Must be used within `NearbyPlacesSessionProvider` (mounted once in `app/_layout.tsx`). */
export function useNearbyPlacesSession(): NearbyPlacesSessionValue {
  const value = useContext(NearbyPlacesSessionContext);
  if (!value) {
    throw new Error('useNearbyPlacesSession must be used within a NearbyPlacesSessionProvider');
  }
  return value;
}
