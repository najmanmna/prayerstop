import { Linking } from 'react-native';

import {
  buildNavigationUrl,
  buildViewPlaceUrl,
  buildWebNavigationUrl,
  openExternalNavigation,
  openPlaceInGoogleMaps,
} from '../navigation';

const coordinates = { latitude: 6.9271, longitude: 79.8612 };
const placeId = 'ChIJ27gT8x1Z4joRxngrQeaNYZA';
const placeName = 'Colombo Grand Mosque';
const googlePlace = { name: placeName, coordinates, googlePlaceId: placeId };
// A verified local database record that hasn't been matched to a Google listing yet.
const localPlace = { name: 'Masjidun Noor Jumma Mosque', coordinates: { latitude: 7.0912, longitude: 79.9998 }, googlePlaceId: null };

describe('buildNavigationUrl', () => {
  it('opens Google Maps (not Apple Maps) via the universal directions URL on iOS', () => {
    const url = buildNavigationUrl(coordinates, placeId, 'ios');
    expect(url).toBe(buildWebNavigationUrl(coordinates, placeId));
    expect(url).not.toMatch(/^maps:\/\//);
    expect(url).toContain('google.com/maps');
  });

  it('opens the Google Maps app directly via its Android navigation intent', () => {
    const url = buildNavigationUrl(coordinates, placeId, 'android');
    expect(url).toBe('google.navigation:q=6.9271,79.8612&mode=d');
  });

  it('falls back to the universal Google Maps web URL on any other platform', () => {
    const url = buildNavigationUrl(coordinates, placeId, 'web');
    expect(url).toBe(buildWebNavigationUrl(coordinates, placeId));
  });
});

describe('buildWebNavigationUrl', () => {
  it('builds a Google Maps directions URL with the destination coordinates and place ID', () => {
    const url = buildWebNavigationUrl(coordinates, placeId);
    expect(url).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=6.9271%2C79.8612&travelmode=driving&destination_place_id=ChIJ27gT8x1Z4joRxngrQeaNYZA'
    );
  });

  it('navigates a local record without a Google Place ID by coordinates on every platform', () => {
    expect(buildNavigationUrl(localPlace.coordinates, null, 'android')).toBe(
      'google.navigation:q=7.0912,79.9998&mode=d'
    );
    const iosUrl = buildNavigationUrl(localPlace.coordinates, null, 'ios');
    expect(iosUrl).toContain('destination=7.0912%2C79.9998');
    expect(iosUrl).not.toContain('destination_place_id');
  });

  it('omits destination_place_id when no place ID is given', () => {
    const url = buildWebNavigationUrl(coordinates);
    expect(url).not.toContain('destination_place_id');
  });
});

describe('openExternalNavigation', () => {
  const canOpenURL = Linking.canOpenURL as jest.Mock;
  const openURL = Linking.openURL as jest.Mock;

  beforeEach(() => {
    canOpenURL.mockReset();
    openURL.mockReset();
  });

  it('opens the platform-specific URL when the device can handle it', async () => {
    canOpenURL.mockResolvedValue(true);
    openURL.mockResolvedValue(undefined);

    const opened = await openExternalNavigation(coordinates, placeId);

    expect(opened).toBe(true);
    expect(openURL).toHaveBeenCalledTimes(1);
  });

  it('falls back to the web URL when the platform-specific scheme cannot be opened', async () => {
    canOpenURL.mockResolvedValue(false);
    openURL.mockResolvedValue(undefined);

    const opened = await openExternalNavigation(coordinates, placeId);

    expect(opened).toBe(true);
    expect(openURL).toHaveBeenCalledWith(buildWebNavigationUrl(coordinates, placeId));
  });

  it('falls back to the web URL when canOpenURL itself throws', async () => {
    canOpenURL.mockRejectedValue(new Error('unsupported scheme'));
    openURL.mockResolvedValue(undefined);

    const opened = await openExternalNavigation(coordinates, placeId);

    expect(opened).toBe(true);
    expect(openURL).toHaveBeenCalledWith(buildWebNavigationUrl(coordinates, placeId));
  });

  it('returns false when even the web URL fails to open', async () => {
    canOpenURL.mockResolvedValue(false);
    openURL.mockRejectedValue(new Error('could not open'));

    const opened = await openExternalNavigation(coordinates, placeId);

    expect(opened).toBe(false);
  });
});

describe('buildViewPlaceUrl', () => {
  it('builds the universal "view place" Search URL using the real Place ID, not directions', () => {
    const url = buildViewPlaceUrl(googlePlace);

    expect(url).toBe(
      'https://www.google.com/maps/search/?api=1&query=Colombo+Grand+Mosque&query_place_id=ChIJ27gT8x1Z4joRxngrQeaNYZA'
    );
    expect(url).toContain('/maps/search/');
    expect(url).not.toContain('/maps/dir/');
  });

  it('opens a pin at the verified coordinates for a local record without a Google Place ID', () => {
    const url = buildViewPlaceUrl(localPlace);

    expect(url).toBe('https://www.google.com/maps/search/?api=1&query=7.0912%2C79.9998');
    expect(url).not.toContain('query_place_id');
    // Never a bare name search — a common mosque name could resolve to a different mosque.
    expect(url).not.toContain('Masjidun');
  });

  it('is the same URL regardless of platform (no platform-specific scheme needed)', () => {
    // Unlike buildNavigationUrl, this has no platform parameter at all —
    // the universal Search URL works identically everywhere.
    const url1 = buildViewPlaceUrl(googlePlace);
    const url2 = buildViewPlaceUrl(googlePlace);
    expect(url1).toBe(url2);
  });
});

describe('openPlaceInGoogleMaps', () => {
  const openURL = Linking.openURL as jest.Mock;

  beforeEach(() => {
    openURL.mockReset();
  });

  it('opens the place\'s Google Maps listing using only the existing Place ID (no Places API call)', async () => {
    openURL.mockResolvedValue(undefined);

    const opened = await openPlaceInGoogleMaps(googlePlace);

    expect(opened).toBe(true);
    expect(openURL).toHaveBeenCalledTimes(1);
    expect(openURL).toHaveBeenCalledWith(buildViewPlaceUrl(googlePlace));
  });

  it('opens a local record without a Place ID at its coordinates', async () => {
    openURL.mockResolvedValue(undefined);

    const opened = await openPlaceInGoogleMaps(localPlace);

    expect(opened).toBe(true);
    expect(openURL).toHaveBeenCalledWith('https://www.google.com/maps/search/?api=1&query=7.0912%2C79.9998');
  });

  it('returns false if opening the URL fails', async () => {
    openURL.mockRejectedValue(new Error('could not open'));

    const opened = await openPlaceInGoogleMaps(googlePlace);

    expect(opened).toBe(false);
  });
});
