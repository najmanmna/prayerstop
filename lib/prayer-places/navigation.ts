import { Linking, Platform } from 'react-native';

import type { GeoCoordinates } from './types';

/**
 * Google Maps' universal cross-platform directions URL. Includes the real
 * Google Place ID (`destination_place_id`) when available, so navigation
 * opens directly to the actual named mosque listing rather than an
 * anonymous coordinate pin. Works as a browser fallback everywhere, and on
 * mobile hands off to the Google Maps app via universal link if installed.
 */
export function buildWebNavigationUrl(coordinates: GeoCoordinates, placeId?: string): string {
  const params = new URLSearchParams({
    api: '1',
    destination: `${coordinates.latitude},${coordinates.longitude}`,
    travelmode: 'driving',
  });
  if (placeId) {
    params.set('destination_place_id', placeId);
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Builds the URL used to open Google Maps specifically (not the platform's
 * default/Apple Maps) for a destination. Takes `platform` as a parameter
 * rather than reading `Platform.OS` internally, so this stays a pure,
 * framework-free function that's trivial to unit test — the actual OS
 * platform is threaded through by the caller (`openExternalNavigation`).
 *
 * No origin/source is included in either URL — omitting it tells Google
 * Maps to route from the device's current location.
 */
export function buildNavigationUrl(coordinates: GeoCoordinates, placeId: string, platform: string): string {
  if (platform === 'android') {
    // Google Maps' own Android navigation intent — launches turn-by-turn
    // driving directions directly in the Google Maps app.
    return `google.navigation:q=${coordinates.latitude},${coordinates.longitude}&mode=d`;
  }
  // iOS and web: Google Maps' universal directions URL — deliberately not
  // an Apple Maps deep link, since the destination place ID and richer
  // listing data (reviews, hours) come from Google Places, not Apple Maps.
  // On iOS this hands off to the Google Maps app via universal link if
  // installed, otherwise opens Google Maps in the browser.
  return buildWebNavigationUrl(coordinates, placeId);
}

/**
 * Opens Google Maps navigation to a prayer place — the Google Maps app on
 * Android (turn-by-turn) or via universal link handoff on iOS, falling back
 * to Google Maps in the browser if the platform-specific scheme can't be
 * opened (e.g. no maps app installed) or on any other platform (web).
 * Returns whether navigation was successfully launched.
 */
export async function openExternalNavigation(coordinates: GeoCoordinates, placeId: string): Promise<boolean> {
  const primaryUrl = buildNavigationUrl(coordinates, placeId, Platform.OS);
  const fallbackUrl = buildWebNavigationUrl(coordinates, placeId);

  try {
    if (primaryUrl !== fallbackUrl && (await Linking.canOpenURL(primaryUrl))) {
      await Linking.openURL(primaryUrl);
      return true;
    }
  } catch {
    // canOpenURL/openURL can throw for an unregistered custom scheme on some
    // platforms/configs — fall through to the universal web URL below.
  }

  try {
    await Linking.openURL(fallbackUrl);
    return true;
  } catch {
    return false;
  }
}

/**
 * Google Maps' universal cross-platform "view place" URL — shows the
 * place's own listing (name, and reviews/photos/hours if Google has them),
 * not directions. Uses the real Google Place ID via `query_place_id` (the
 * documented way to open an exact place rather than a generic text search)
 * — verified against Google's current Maps URLs documentation. Unlike the
 * directions URL, this needs no platform-specific scheme: it hands off to
 * the Google Maps app via universal/app link on iOS and Android alike if
 * installed, or opens Google Maps in the browser otherwise.
 */
export function buildViewPlaceUrl(name: string, placeId: string): string {
  const params = new URLSearchParams({
    api: '1',
    query: name,
    query_place_id: placeId,
  });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

/**
 * Opens a prayer place's own Google Maps listing — the recommendation
 * card's secondary "Google Maps" action, alongside `openExternalNavigation`'s
 * primary "Navigate". Uses only the place's existing Google Place ID
 * (already present in the current shared nearby-places session) — this
 * makes no additional Places API call of any kind.
 */
export async function openPlaceInGoogleMaps(name: string, placeId: string): Promise<boolean> {
  try {
    await Linking.openURL(buildViewPlaceUrl(name, placeId));
    return true;
  } catch {
    return false;
  }
}
