import { Linking, Platform } from 'react-native';

import type { GeoCoordinates, PrayerPlaceCandidate } from './types';

/** What the Google Maps links need from any place, local or Google-sourced. */
export type MapsLinkPlace = Pick<PrayerPlaceCandidate, 'name' | 'coordinates' | 'googlePlaceId'>;

/**
 * Google Maps' universal cross-platform directions URL. Includes the real
 * Google Place ID (`destination_place_id`) when the place has one, so
 * navigation opens directly to the actual named mosque listing rather than
 * an anonymous coordinate pin. Local database records without a confirmed
 * Place ID navigate by their verified coordinates alone. Works as a browser
 * fallback everywhere, and on mobile hands off to the Google Maps app via
 * universal link if installed.
 */
export function buildWebNavigationUrl(coordinates: GeoCoordinates, placeId?: string | null): string {
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
export function buildNavigationUrl(coordinates: GeoCoordinates, placeId: string | null, platform: string): string {
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
export async function openExternalNavigation(coordinates: GeoCoordinates, placeId: string | null): Promise<boolean> {
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
 * not directions. Verified against Google's current Maps URLs
 * documentation (2026-10-29):
 *
 * - With a Google Place ID: `query_place_id` opens that exact listing
 *   (`query` is only used if Google can't resolve the ID).
 * - Without one (a local database record not yet matched to Google): a
 *   pin at the record's own verified coordinates. Deliberately NOT a
 *   name search — Google could resolve a common name like "Jumma Masjid"
 *   to a different mosque entirely; the coordinates are what we know.
 *
 * Needs no platform-specific scheme: it hands off to the Google Maps app
 * via universal/app link on iOS and Android alike if installed, or opens
 * Google Maps in the browser otherwise.
 */
export function buildViewPlaceUrl(place: MapsLinkPlace): string {
  const coordinates = `${place.coordinates.latitude},${place.coordinates.longitude}`;
  const params = place.googlePlaceId
    ? new URLSearchParams({ api: '1', query: place.name, query_place_id: place.googlePlaceId })
    : new URLSearchParams({ api: '1', query: coordinates });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

/**
 * Opens a prayer place in Google Maps — the recommendation card's secondary
 * "Google Maps" action, alongside `openExternalNavigation`'s primary
 * "Navigate". Uses only data already in the current shared nearby-places
 * session — this makes no additional Places API call of any kind.
 */
export async function openPlaceInGoogleMaps(place: MapsLinkPlace): Promise<boolean> {
  try {
    await Linking.openURL(buildViewPlaceUrl(place));
    return true;
  } catch {
    return false;
  }
}
