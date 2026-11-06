// Component-level test (a narrow exception — see
// hooks/__tests__/nearby-places-session.test.tsx for the established
// precedent): what the row actually renders (drive time + an honest status)
// and that pressing it opens Details, which needs a real render to verify.
// Google Maps lives on Place Details now, not on each row.
import TestRenderer, { act } from 'react-test-renderer';

import type { PrayerPlace, PrayerWindow } from '@/types/home';

import { AlternatePlaceRow } from '../alternate-place-row';

const window: PrayerWindow = { name: 'Dhuhr', startTime: '12:15', endTime: '15:20', hasStarted: true };

const place: PrayerPlace = {
  id: 'google:ChIJ27gT8x1Z4joRxngrQeaNYZA',
  source: 'google',
  localRecordId: null,
  googlePlaceId: 'ChIJ27gT8x1Z4joRxngrQeaNYZA',
  name: 'Colombo Grand Mosque',
  area: 'Colombo 12',
  coordinates: { latitude: 6.9354, longitude: 79.8517 },
  distanceKm: 1.2,
  etaMinutes: 8,
  arrivalTime: '12:30',
  feasibility: 'comfortable',
};

function renderRow(onPress: () => void, overrides: Partial<PrayerPlace> = {}, rowWindow: PrayerWindow = window) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <AlternatePlaceRow place={{ ...place, ...overrides }} window={rowWindow} context="now" onPress={onPress} />
    );
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
  return collect(renderer.toJSON()).join('');
}

describe('AlternatePlaceRow', () => {
  it('shows the drive time and a short status', () => {
    const text = allText(renderRow(jest.fn()));
    expect(text).toContain('Colombo Grand Mosque');
    expect(text).toContain('1.2 km · Colombo 12');
    expect(text).toContain('8 min');
    expect(text).toContain('In time');
  });

  it('keeps the factual "Too late to reach" wording', () => {
    const text = allText(renderRow(jest.fn(), { arrivalTime: '15:40', feasibility: 'tooLate' }));
    expect(text).toContain('Too late to reach');
  });

  it('makes no in-time claim when the end time is unknown (Isha)', () => {
    const isha: PrayerWindow = { name: 'Isha', startTime: '19:05', endTime: null, hasStarted: true };
    const text = allText(renderRow(jest.fn(), { arrivalTime: '19:30' }, isha));
    expect(text).not.toContain('In time');
    expect(text).not.toContain('Too late');
  });

  it('opens Details when pressed', () => {
    const onPress = jest.fn();
    const renderer = renderRow(onPress);
    const row = renderer.root.findAllByProps({ accessibilityRole: 'button' })[0];
    act(() => {
      row.props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
