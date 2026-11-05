import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { decidePrayerZone, type PrayerZoneState, type StoredPrayerZone } from '@/lib/prayer-times/prayer-zones';

import { useNearbyPlacesSession } from './nearby-places-session';

const STORAGE_KEY = 'prayerstop.lastPrayerZone.v1';

async function loadStoredZone(): Promise<StoredPrayerZone | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed.zoneId === 'string' && typeof parsed.district === 'string'
      ? { zoneId: parsed.zoneId, district: parsed.district }
      : null;
  } catch {
    return null;
  }
}

const PrayerZoneContext = createContext<PrayerZoneState | null>(null);

/**
 * Resolves which ACJU prayer zone applies to the user, from the device
 * location the shared nearby-places session already tracks (so this adds no
 * second location request). Mounted once in `app/_layout.tsx`, inside
 * `NearbyPlacesSessionProvider`, so the prayer times on every screen and the
 * scheduled reminders all use the same zone.
 *
 * The last successfully resolved zone is remembered, so prayer times show
 * instantly on later launches while a fresh fix is still being taken. See
 * `decidePrayerZone` for the full rules — there is no default zone.
 */
export function PrayerZoneProvider({ children }: { children: ReactNode }) {
  const { device } = useNearbyPlacesSession();
  const [stored, setStored] = useState<StoredPrayerZone | null>(null);
  const [storageLoaded, setStorageLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadStoredZone().then((zone) => {
      if (cancelled) return;
      setStored(zone);
      setStorageLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const latitude = device.coords?.latitude;
  const longitude = device.coords?.longitude;
  const state = useMemo(
    () =>
      decidePrayerZone({
        deviceStatus: device.status,
        coords: latitude !== undefined && longitude !== undefined ? { latitude, longitude } : null,
        stored,
        storageLoaded,
      }),
    [device.status, latitude, longitude, stored, storageLoaded]
  );

  const resolvedZoneId = state.status === 'ok' && state.basis === 'current-location' ? state.zoneId : null;
  const resolvedDistrict = state.status === 'ok' && state.basis === 'current-location' ? state.district : null;
  useEffect(() => {
    if (!resolvedZoneId || !resolvedDistrict) return;
    if (stored?.zoneId === resolvedZoneId && stored.district === resolvedDistrict) return;
    const zone = { zoneId: resolvedZoneId, district: resolvedDistrict };
    setStored(zone);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(zone)).catch(() => {
      // Non-critical: the next launch just waits for a fresh fix instead.
    });
  }, [resolvedZoneId, resolvedDistrict, stored]);

  return <PrayerZoneContext.Provider value={state}>{children}</PrayerZoneContext.Provider>;
}

/** The ACJU prayer zone for the user. Must be used within `PrayerZoneProvider` (mounted once in `app/_layout.tsx`). */
export function usePrayerZone(): PrayerZoneState {
  const value = useContext(PrayerZoneContext);
  if (!value) {
    throw new Error('usePrayerZone must be used within a PrayerZoneProvider');
  }
  return value;
}
