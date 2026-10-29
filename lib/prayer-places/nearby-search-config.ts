import { NEARBY_PLACES_MAX_RESULT_COUNT } from './build-nearby-places-request';

/**
 * Every tunable for the database-first nearby search, in one place. Adjust
 * these after real-world testing — nothing else in the codebase hardcodes
 * these numbers. Used server-side by `app/api/nearby-places+api.ts` (via
 * `find-nearby-places.ts`/`merge-nearby-places.ts`) and for the client's
 * default request.
 *
 * The SQL function `nearby_verified_mosques()` (Supabase migration 0009)
 * independently enforces the same radius (100–20,000 m) and limit (≤ 50)
 * bounds, since it's callable directly with the publishable key — keep the
 * two in step if these bounds ever change.
 */
export const NEARBY_SEARCH_CONFIG = {
  /** Radius the client asks for by default. */
  defaultRadiusMeters: 5000,
  /** Requests outside this range are rejected (400), not clamped. */
  minRadiusMeters: 100,
  maxRadiusMeters: 20_000,

  /** Max places returned to the client per search — capped at Google's own Nearby Search maximum. */
  maxResults: NEARBY_PLACES_MAX_RESULT_COUNT,

  /**
   * Fallback threshold: Google Places is called only when fewer than
   * `minLocalResults` verified local mosques lie within
   * `localSufficiencyRadiusMeters` of the user. The sufficiency radius is
   * deliberately smaller than the search radius — having 3 verified
   * mosques 4–5 km away isn't "enough" if a closer, not-yet-verified
   * mosque might exist that only Google knows about.
   */
  minLocalResults: 3,
  localSufficiencyRadiusMeters: 2000,

  /** A Google result within this distance of a local record, with a similar name, is the same mosque. */
  matchDistanceMeters: 50,
  /** Minimum normalized name similarity (0–1, see `name-similarity.ts`) for a proximity match. */
  minNameSimilarity: 0.6,
  /**
   * A Google result this close to a local record is treated as the same
   * building for de-duplication even if the names don't match (transliteration
   * differences are common) — but never confident enough to save a Place ID
   * mapping without a name match too.
   */
  sameBuildingDistanceMeters: 15,
  /**
   * Google's pin is often on the road or at the entrance rather than where
   * our reviewers placed the building, so a Google result up to this far
   * from a local record is still the same mosque when the names match
   * strongly (≥ `strongNameSimilarity`). Display de-duplication only: Place
   * ID mappings are still saved only within `matchDistanceMeters`. Not used
   * between two local records — both of those pins are human-verified.
   */
  strongNameMatchDistanceMeters: 100,
  strongNameSimilarity: 0.8,

  /**
   * Requests are only served inside this box (Sri Lanka, with a small
   * margin). PrayerStop's prayer times and mosque data are Sri Lanka-only,
   * and refusing elsewhere stops the endpoint being used to run up Google
   * Places charges for arbitrary locations.
   */
  serviceArea: { minLatitude: 5.7, maxLatitude: 10.0, minLongitude: 79.4, maxLongitude: 82.1 },

  /** Per-upstream timeouts, so one slow dependency can't hang the whole request. */
  databaseTimeoutMs: 4000,
  googleTimeoutMs: 8000,
};

export type NearbySearchConfig = Readonly<typeof NEARBY_SEARCH_CONFIG>;
