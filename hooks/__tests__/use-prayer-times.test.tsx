// Component-level test (same justified exception as the other hook tests in
// this project) — live per-second ticking, background/foreground interval
// lifecycle, and cleanup-on-unmount are React/timer lifecycle properties
// that need the hook actually running, not just a pure function.
import { AppState, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

import { usePrayerTimes, type PrayerTimesHookState } from '../use-prayer-times';

function Probe({ onValue }: { onValue: (value: PrayerTimesHookState) => void }) {
  const value = usePrayerTimes();
  onValue(value);
  return <Text>{value.status}</Text>;
}

function readyNow(state: PrayerTimesHookState | undefined) {
  if (!state || state.status !== 'ready') throw new Error('expected a ready PrayerTimesHookState');
  return state.now;
}

let addEventListenerSpy: jest.SpyInstance;
let renderer: TestRenderer.ReactTestRenderer | undefined;

describe('usePrayerTimes', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    addEventListenerSpy = jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
  });

  afterEach(() => {
    act(() => {
      renderer?.unmount();
    });
    renderer = undefined;
    addEventListenerSpy.mockRestore();
    jest.useRealTimers();
  });

  it('ticks every second while mounted, visibly decrementing the live NOW countdown', () => {
    // 2026-08-23T00:33:00.000Z == 06:03:00 Sri Lanka local — inside Fajr's
    // window, which ends at that day's real Sunrise (06:04:00).
    jest.setSystemTime(new Date('2026-08-23T00:33:00.000Z'));
    let latest: PrayerTimesHookState | undefined;

    act(() => {
      renderer = TestRenderer.create(<Probe onValue={(v) => (latest = v)} />);
    });

    expect(readyNow(latest).window.name).toBe('Fajr');
    expect(readyNow(latest).countdownSeconds).toBe(60);

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(readyNow(latest).countdownSeconds).toBe(59);

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(readyNow(latest).countdownSeconds).toBe(58);
  });

  it('transitions correctly the instant a prayer window boundary is crossed (Fajr ends at Sunrise)', () => {
    // 2 seconds before that day's real Sunrise (06:04:00 local).
    jest.setSystemTime(new Date('2026-08-23T00:33:58.000Z'));
    let latest: PrayerTimesHookState | undefined;

    act(() => {
      renderer = TestRenderer.create(<Probe onValue={(v) => (latest = v)} />);
    });
    expect(readyNow(latest).window.name).toBe('Fajr');
    expect(readyNow(latest).window.hasStarted).toBe(true);
    expect(readyNow(latest).countdownSeconds).toBe(2);

    act(() => {
      jest.advanceTimersByTime(1000); // 06:03:59 — 1s left
    });
    expect(readyNow(latest).window.name).toBe('Fajr');
    expect(readyNow(latest).countdownSeconds).toBe(1);

    act(() => {
      jest.advanceTimersByTime(1000); // 06:04:00 — Sunrise reached
    });
    // Fajr's window has now closed; the engine surfaces the Sunrise-to-Dhuhr
    // gap (Dhuhr as the pending target, not yet started, no countdown) —
    // this is the existing, unchanged engine behavior, just picked up
    // automatically by the next tick instead of requiring a remount.
    expect(readyNow(latest).window.name).toBe('Dhuhr');
    expect(readyNow(latest).window.hasStarted).toBe(false);
    expect(readyNow(latest).countdownSeconds).toBeNull();
  });

  it('cleanup: clears the interval on unmount', () => {
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    jest.setSystemTime(new Date('2026-08-23T00:33:00.000Z'));

    act(() => {
      renderer = TestRenderer.create(<Probe onValue={() => {}} />);
    });

    act(() => {
      renderer?.unmount();
    });
    renderer = undefined;

    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    clearIntervalSpy.mockRestore();
  });

  it('cleanup: removes the AppState subscription on unmount', () => {
    const removeMock = jest.fn();
    addEventListenerSpy.mockReturnValue({ remove: removeMock } as never);
    jest.setSystemTime(new Date('2026-08-23T00:33:00.000Z'));

    act(() => {
      renderer = TestRenderer.create(<Probe onValue={() => {}} />);
    });

    act(() => {
      renderer?.unmount();
    });
    renderer = undefined;

    expect(removeMock).toHaveBeenCalledTimes(1);
  });

  it('regression: keeps ticking every second even while AppState reports a non-"active" state, and does not freeze if no matching "active" event ever follows', () => {
    // A real, shipped bug: an earlier version stopped the interval on any
    // non-'active' AppState report and only restarted it on a transition
    // back to 'active'. RN's AppState on Android in particular can report a
    // transient non-'active' state without the app actually leaving the
    // foreground, with no guarantee a matching 'active' event follows — the
    // countdown froze permanently (reported live, between Dhuhr and Asr).
    // The interval must never depend on AppState to keep running.
    jest.setSystemTime(new Date('2026-08-23T00:33:00.000Z'));
    let latest: PrayerTimesHookState | undefined;

    act(() => {
      renderer = TestRenderer.create(<Probe onValue={(v) => (latest = v)} />);
    });
    expect(readyNow(latest).countdownSeconds).toBe(60);

    expect(addEventListenerSpy).toHaveBeenCalledWith('change', expect.any(Function));
    const onAppStateChange = addEventListenerSpy.mock.calls[0][1];

    // A spurious/transient non-'active' report, with no 'active' event ever
    // following it — e.g. exactly the flaky Android AppState behavior above.
    act(() => {
      onAppStateChange('inactive');
    });

    act(() => {
      jest.advanceTimersByTime(10000);
    });

    // Still ticking normally — not frozen at 60.
    expect(readyNow(latest).countdownSeconds).toBe(50);
  });

  it('snaps to the real current time immediately on a genuine foreground resume, on top of the always-running interval', () => {
    jest.setSystemTime(new Date('2026-08-23T00:33:00.000Z'));
    let latest: PrayerTimesHookState | undefined;

    act(() => {
      renderer = TestRenderer.create(<Probe onValue={(v) => (latest = v)} />);
    });
    expect(readyNow(latest).countdownSeconds).toBe(60);

    const onAppStateChange = addEventListenerSpy.mock.calls[0][1];

    act(() => {
      onAppStateChange('background');
    });

    // 10 real seconds pass while backgrounded (advancing fake timers also
    // advances their linked Date mock) — the interval keeps running the
    // whole time, so this is already reflected without needing to resume.
    act(() => {
      jest.advanceTimersByTime(10000);
    });
    expect(readyNow(latest).countdownSeconds).toBe(50);

    act(() => {
      onAppStateChange('active');
    });
    // The resume-triggered extra tick recomputes from the same real clock —
    // harmless and immediate, not a jump to a different value.
    expect(readyNow(latest).countdownSeconds).toBe(50);
  });

  it('does not restart or double-tick when repeatedly reporting an already-active state', () => {
    jest.setSystemTime(new Date('2026-08-23T00:33:00.000Z'));
    let latest: PrayerTimesHookState | undefined;

    act(() => {
      renderer = TestRenderer.create(<Probe onValue={(v) => (latest = v)} />);
    });
    const onAppStateChange = addEventListenerSpy.mock.calls[0][1];

    act(() => {
      onAppStateChange('active'); // already active — should be a no-op, not an extra immediate tick
    });
    expect(readyNow(latest).countdownSeconds).toBe(60);

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(readyNow(latest).countdownSeconds).toBe(59); // exactly one second's worth, not skipped/doubled
  });
});
