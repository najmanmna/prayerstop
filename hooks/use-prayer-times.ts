import { useEffect, useMemo, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { acjuPrayerTimeRepository, DEFAULT_ZONE_ID } from '@/lib/prayer-times/acju-repository';
import { getPrayerEngineState } from '@/lib/prayer-times/prayer-engine';
import type { PlanningContext, PrayerWindow, ScheduleEntry } from '@/types/home';

export interface PrayerTimesForContext {
  window: PrayerWindow;
  /**
   * NOW: seconds until the active prayer's window closes — null when that
   * deadline isn't reliably known (Isha). NEXT: seconds until the next
   * prayer starts — always known, since every prayer's start time is real
   * ACJU data. Never backfill a null NOW value from the NEXT value; that
   * was the "Fajr = Isha end" bug this type exists to prevent.
   */
  countdownSeconds: number | null;
}

export type PrayerTimesHookState =
  | { status: 'unavailable'; reason: string }
  | {
      status: 'ready';
      now: PrayerTimesForContext;
      next: PrayerTimesForContext;
      schedule: ScheduleEntry[];
      /** ACJU-published Sunrise, "HH:MM" — display-only (today's schedule row); Fajr's real endTime already uses this internally, unchanged. */
      sunriseTime: string;
    };

/**
 * Live, per-second view of the current/next prayer for Zone 01, backed by
 * the real ACJU-based prayer engine. Recomputes from a fresh `Date` every
 * tick rather than simulating elapsed time client-side, so it stays correct
 * across app backgrounding and can't drift.
 *
 * The 1-second interval runs continuously for as long as this hook is
 * mounted, cleaned up only on unmount (the actual leak to avoid — a stray
 * interval still firing into an unmounted tree). An earlier version also
 * stopped the interval whenever `AppState` reported anything other than
 * 'active' and only restarted it on a transition back to 'active' — this
 * was a real, shipped bug: RN's `AppState` on Android in particular can
 * report a transient non-'active' state without the app actually leaving
 * the foreground, with no guarantee a matching 'active' event follows. When
 * it didn't, the interval stayed stopped forever, freezing the visible
 * countdown at whatever number it last showed (reported live, between
 * Dhuhr and Asr) — do not reintroduce stop/start logic keyed off AppState
 * here. The one AppState-driven behavior kept is harmless by construction:
 * an extra immediate tick on foreground-resume, on top of the
 * always-running interval, so the display snaps to the real time right
 * away instead of waiting up to a second for the next tick.
 */
export function usePrayerTimes(): PrayerTimesHookState {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((value) => value + 1), 1000);

    let appState: AppStateStatus = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      const returnedToForeground = nextState === 'active' && appState !== 'active';
      appState = nextState;
      if (returnedToForeground) {
        setTick((value) => value + 1);
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, []);

  return useMemo<PrayerTimesHookState>(() => {
    const result = getPrayerEngineState(acjuPrayerTimeRepository, DEFAULT_ZONE_ID, new Date());
    if (result.status === 'unavailable') {
      return { status: 'unavailable', reason: result.reason };
    }

    const { active, next, secondsUntilActiveEnds, secondsUntilNextStart, today } = result.state;
    const schedule: ScheduleEntry[] = [
      { name: 'Fajr', time: today.fajr },
      { name: 'Dhuhr', time: today.dhuhr },
      { name: 'Asr', time: today.asr },
      { name: 'Maghrib', time: today.maghrib },
      { name: 'Isha', time: today.isha },
    ];

    return {
      status: 'ready',
      now: {
        window: {
          name: active.name,
          startTime: active.startTime,
          endTime: active.endTime,
          hasStarted: active.hasStarted,
        },
        countdownSeconds: secondsUntilActiveEnds,
      },
      next: {
        window: { name: next.name, startTime: next.startTime, endTime: next.endTime, hasStarted: next.hasStarted },
        countdownSeconds: secondsUntilNextStart,
      },
      schedule,
      sunriseTime: today.sunrise,
    };
  }, [tick]);
}

export function selectPrayerTimesForContext(
  state: PrayerTimesHookState,
  context: PlanningContext
): PrayerTimesForContext | null {
  if (state.status !== 'ready') return null;
  return context === 'now' ? state.now : state.next;
}
