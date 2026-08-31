/** Formats raw GPS coordinates for display, e.g. (6.9271, 79.8612) -> "6.9271° N, 79.8612° E". */
export function formatCoordinates(latitude: number, longitude: number): string {
  const latDirection = latitude >= 0 ? 'N' : 'S';
  const lonDirection = longitude >= 0 ? 'E' : 'W';
  return `${Math.abs(latitude).toFixed(4)}° ${latDirection}, ${Math.abs(longitude).toFixed(4)}° ${lonDirection}`;
}

interface GeocodedAddressLike {
  district?: string | null;
  city?: string | null;
  region?: string | null;
}

/** Formats a reverse-geocoded address into a short "neighborhood, city" label, e.g. "Kollupitiya, Colombo". */
export function formatAddress(address: GeocodedAddressLike): string | null {
  const parts = [address.district, address.city ?? address.region].filter(
    (part): part is string => Boolean(part)
  );
  return parts.length > 0 ? parts.join(', ') : null;
}
