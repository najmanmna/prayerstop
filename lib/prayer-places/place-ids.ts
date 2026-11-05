/**
 * The app's own stable, source-aware place IDs. Prefixed so a database
 * record and a Google place can never collide, and so nothing downstream
 * can mistake an internal ID for a Google Place ID (see `PlaceIdentity`).
 */
export function databasePlaceId(recordId: string): string {
  return `db:${recordId}`;
}

export function googlePlaceIdToAppId(googlePlaceId: string): string {
  return `google:${googlePlaceId}`;
}
