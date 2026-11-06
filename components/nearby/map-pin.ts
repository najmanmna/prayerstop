import type { GeoCoordinates } from '@/lib/prayer-places/types';

/** One mosque on the Nearby map — platform-neutral, built by the Nearby screen from session data. */
export interface NearbyMapPin {
  id: string;
  name: string;
  coordinates: GeoCoordinates;
  /** Shown under the name when tapped: "8 min · arrive 12:30" for routed places, "1.8 km away" for distance-only ones. */
  detail: string;
  /** True when `detail` starts with a real drive time (routed places), shown with the car icon. */
  isDriveTime?: boolean;
}

export interface NearbyMapProps {
  pins: NearbyMapPin[];
  userCoords: GeoCoordinates | null;
  selectedPinId: string | null;
  onSelectPin: (id: string) => void;
}
