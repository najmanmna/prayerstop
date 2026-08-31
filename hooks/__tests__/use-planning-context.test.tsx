// Component-level test (same justified exception as the other two hook
// tests in this project) — "a manual override survives until the prayer
// context genuinely changes" is a React effect/state lifecycle property
// that a pure function alone can't express.
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

import { usePlanningContext } from '../use-planning-context';
import type { ActivePrayerIdentity } from '@/lib/prayer-times/default-planning-context';
import type { PlanningContext } from '@/types/home';

function Probe({
  active,
  onValue,
}: {
  active: ActivePrayerIdentity | null;
  onValue: (value: { context: PlanningContext; setContext: (c: PlanningContext) => void }) => void;
}) {
  const [context, setContext] = usePlanningContext(active);
  onValue({ context, setContext });
  return <Text>{context}</Text>;
}

describe('usePlanningContext', () => {
  it('defaults to NEXT/Dhuhr during the Sunrise-to-Dhuhr gap', () => {
    let latest: { context: PlanningContext; setContext: (c: PlanningContext) => void } | undefined;
    act(() => {
      TestRenderer.create(<Probe active={{ name: 'Dhuhr', hasStarted: false }} onValue={(v) => (latest = v)} />);
    });
    expect(latest?.context).toBe('next');
  });

  it('defaults to NEXT/Fajr during Isha', () => {
    let latest: { context: PlanningContext; setContext: (c: PlanningContext) => void } | undefined;
    act(() => {
      TestRenderer.create(<Probe active={{ name: 'Isha', hasStarted: true }} onValue={(v) => (latest = v)} />);
    });
    expect(latest?.context).toBe('next');
  });

  it('does not repeatedly force NEXT back after a manual NOW override, while the prayer context is unchanged', () => {
    let latest: { context: PlanningContext; setContext: (c: PlanningContext) => void } | undefined;
    let renderer: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<Probe active={{ name: 'Isha', hasStarted: true }} onValue={(v) => (latest = v)} />);
    });
    expect(latest?.context).toBe('next');

    // User manually selects NOW.
    act(() => {
      latest?.setContext('now');
    });
    expect(latest?.context).toBe('now');

    // Simulate several per-second ticks with the SAME active identity (a
    // new object each time, as usePrayerTimes produces every tick, but the
    // same name/hasStarted) — the manual choice must survive all of them.
    for (let i = 0; i < 5; i++) {
      act(() => {
        renderer.update(<Probe active={{ name: 'Isha', hasStarted: true }} onValue={(v) => (latest = v)} />);
      });
      expect(latest?.context).toBe('now');
    }
  });

  it('resets to the new default once the prayer context actually changes (Isha -> Fajr)', () => {
    let latest: { context: PlanningContext; setContext: (c: PlanningContext) => void } | undefined;
    let renderer: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<Probe active={{ name: 'Isha', hasStarted: true }} onValue={(v) => (latest = v)} />);
    });
    act(() => {
      latest?.setContext('now'); // manual override, as above
    });
    expect(latest?.context).toBe('now');

    // A genuine prayer-context change: Isha ends, Fajr begins.
    act(() => {
      renderer.update(<Probe active={{ name: 'Fajr', hasStarted: true }} onValue={(v) => (latest = v)} />);
    });

    expect(latest?.context).toBe('now'); // Fajr's own sensible default, recomputed fresh
  });

  it('resets to NOW once the Sunrise-to-Dhuhr gap ends and Dhuhr actually starts', () => {
    let latest: { context: PlanningContext; setContext: (c: PlanningContext) => void } | undefined;
    let renderer: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<Probe active={{ name: 'Dhuhr', hasStarted: false }} onValue={(v) => (latest = v)} />);
    });
    expect(latest?.context).toBe('next');

    act(() => {
      renderer.update(<Probe active={{ name: 'Dhuhr', hasStarted: true }} onValue={(v) => (latest = v)} />);
    });

    expect(latest?.context).toBe('now');
  });
});
