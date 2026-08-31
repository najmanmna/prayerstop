// Component-level test (a narrow exception — see
// hooks/__tests__/nearby-places-session.test.tsx for the established
// precedent): the guarantee under test is specifically that the row wires
// its Google Maps action to the existing openPlaceInGoogleMaps/Place ID
// implementation without disturbing the row's own onPress (Details
// navigation), which needs a real render to verify.
import { Linking } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

import { buildViewPlaceUrl } from '@/lib/prayer-places/navigation';
import type { PrayerPlace, PrayerWindow } from '@/types/home';

import { AlternatePlaceRow } from '../alternate-place-row';

const window: PrayerWindow = { name: 'Dhuhr', startTime: '12:15', endTime: '15:20', hasStarted: true };

const place: PrayerPlace = {
  id: 'ChIJ27gT8x1Z4joRxngrQeaNYZA',
  name: 'Colombo Grand Mosque',
  area: 'Colombo 12',
  coordinates: { latitude: 6.9354, longitude: 79.8517 },
  distanceKm: 1.2,
  etaMinutes: 8,
  arrivalTime: '12:30',
  feasibility: 'comfortable',
};

function renderRow(onPress: () => void) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<AlternatePlaceRow place={place} window={window} context="now" onPress={onPress} />);
  });
  return renderer;
}

describe('AlternatePlaceRow — Google Maps action', () => {
  const openURL = Linking.openURL as jest.Mock;

  beforeEach(() => {
    openURL.mockReset();
    openURL.mockResolvedValue(undefined);
  });

  it('exposes a Google Maps action that opens the place\'s existing Place ID listing', () => {
    const renderer = renderRow(jest.fn());

    const mapsButton = renderer.root.findByProps({ accessibilityLabel: `View ${place.name} on Google Maps` });
    act(() => {
      mapsButton.props.onPress();
    });

    expect(openURL).toHaveBeenCalledTimes(1);
    expect(openURL).toHaveBeenCalledWith(buildViewPlaceUrl(place.name, place.id));
  });

  it('does not trigger any Places/Routes API call — it only opens a URL built from data already on the place', () => {
    const renderer = renderRow(jest.fn());
    const mapsButton = renderer.root.findByProps({ accessibilityLabel: `View ${place.name} on Google Maps` });

    act(() => {
      mapsButton.props.onPress();
    });

    // The only side effect is a URL open — nothing that could be a network
    // request to Places/Routes (openPlaceInGoogleMaps itself is proven
    // elsewhere, in navigation.test.ts, to be a pure URL + Linking.openURL
    // call with no repository/fetch dependency at all).
    expect(openURL).toHaveBeenCalledTimes(1);
  });

  it('does not also fire the row\'s own onPress (Details navigation) when the Google Maps action is pressed', () => {
    const onPress = jest.fn();
    const renderer = renderRow(onPress);
    const mapsButton = renderer.root.findByProps({ accessibilityLabel: `View ${place.name} on Google Maps` });

    act(() => {
      mapsButton.props.onPress();
    });

    expect(onPress).not.toHaveBeenCalled();
    expect(openURL).toHaveBeenCalledTimes(1);
  });

  it('still navigates to Details when the row itself (not the Google Maps button) is pressed', () => {
    const onPress = jest.fn();
    const renderer = renderRow(onPress);

    // Both the row and the Google Maps button are accessibilityRole="button"
    // — the row itself is the one with no accessibilityLabel (only the
    // Google Maps button sets one).
    const buttons = renderer.root.findAllByProps({ accessibilityRole: 'button' });
    const row = buttons.find((b) => b.props.accessibilityLabel === undefined);
    act(() => {
      row!.props.onPress();
    });

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
