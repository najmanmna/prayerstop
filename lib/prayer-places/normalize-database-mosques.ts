import { databasePlaceId } from './place-ids';
import type { PrayerPlaceCandidate } from './types';

/** One row from the `nearby_verified_mosques()` Supabase function (migration 0009). */
export interface RawDatabaseMosque {
  id?: string;
  name?: string | null;
  address?: string | null;
  district?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  google_place_id?: string | null;
}

/**
 * Normalizes verified local mosque records into the same
 * `PrayerPlaceCandidate` shape Google results use. Every row the SQL
 * function returns is already verified and unmerged — this never needs to
 * (and never does) decide verification itself. Rows without an ID or
 * coordinates are dropped rather than given placeholder values.
 */
export function normalizeDatabaseMosques(rows: RawDatabaseMosque[]): PrayerPlaceCandidate[] {
  return rows
    .filter(
      (row): row is RawDatabaseMosque & { id: string; latitude: number; longitude: number } =>
        typeof row.id === 'string' &&
        row.id.length > 0 &&
        typeof row.latitude === 'number' &&
        typeof row.longitude === 'number'
    )
    .map((row) => ({
      id: databasePlaceId(row.id),
      source: 'database' as const,
      localRecordId: row.id,
      googlePlaceId: row.google_place_id ?? null,
      name: row.name?.trim() || 'Unnamed mosque',
      area: row.address?.trim() || row.district?.trim() || '',
      coordinates: { latitude: row.latitude, longitude: row.longitude },
    }));
}
