import type { NearbySearchConfig } from './nearby-search-config';
import type { GeoCoordinates } from './types';

export interface NearbySearchRequest {
  origin: GeoCoordinates;
  radiusMeters: number;
  maxResults: number;
}

export type ValidateNearbyRequestResult =
  | { ok: true; request: NearbySearchRequest }
  | { ok: false; error: string };

type ValidationConfig = Pick<
  NearbySearchConfig,
  'defaultRadiusMeters' | 'minRadiusMeters' | 'maxRadiusMeters' | 'maxResults' | 'serviceArea'
>;

function parseNumber(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

/**
 * Validates `/api/nearby-places` query parameters before anything metered
 * runs. Out-of-range values are rejected, not silently clamped, so a
 * broken or abusive caller gets a clear 400 instead of a quietly different
 * (and possibly billable) search. Radius/result count are optional and
 * default from config.
 */
export function validateNearbyRequest(params: URLSearchParams, config: ValidationConfig): ValidateNearbyRequestResult {
  const latitude = parseNumber(params.get('latitude'));
  const longitude = parseNumber(params.get('longitude'));
  if (latitude === null || longitude === null || Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return { ok: false, error: 'latitude and longitude query parameters are required and must be numbers.' };
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return { ok: false, error: 'latitude/longitude are out of range.' };
  }
  const area = config.serviceArea;
  if (
    latitude < area.minLatitude ||
    latitude > area.maxLatitude ||
    longitude < area.minLongitude ||
    longitude > area.maxLongitude
  ) {
    return { ok: false, error: 'PrayerStop currently only serves locations in Sri Lanka.' };
  }

  const radius = parseNumber(params.get('radius'));
  if (Number.isNaN(radius)) {
    return { ok: false, error: 'radius must be a number.' };
  }
  const radiusMeters = radius ?? config.defaultRadiusMeters;
  if (radiusMeters < config.minRadiusMeters || radiusMeters > config.maxRadiusMeters) {
    return {
      ok: false,
      error: `radius must be between ${config.minRadiusMeters} and ${config.maxRadiusMeters} metres.`,
    };
  }

  const maxResultsParam = parseNumber(params.get('maxResults'));
  if (Number.isNaN(maxResultsParam)) {
    return { ok: false, error: 'maxResults must be a number.' };
  }
  const maxResults = maxResultsParam ?? config.maxResults;
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > config.maxResults) {
    return { ok: false, error: `maxResults must be a whole number between 1 and ${config.maxResults}.` };
  }

  return {
    ok: true,
    request: { origin: { latitude, longitude }, radiusMeters: Math.round(radiusMeters), maxResults },
  };
}
