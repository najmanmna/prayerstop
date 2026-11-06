import { PlaceRow } from '@/components/home/place-row';
import { displayPlaceText } from '@/lib/display-text';
import type { DistanceRankedCandidate } from '@/lib/prayer-places/select-candidates';

/**
 * A place discovery found but that was never sent to Google Routes (only
 * the nearest few are — see the cost rule in CLAUDE.md). Shows straight-line
 * distance only: no ETA, no arrival time, no feasibility colour, because we
 * have no real travel data for it and must not imply any.
 */
export function DistancePlaceRow({ place, onPress }: { place: DistanceRankedCandidate; onPress: () => void }) {
  return (
    <PlaceRow
      name={displayPlaceText(place.name)}
      subtitle={place.area ? displayPlaceText(place.area) : 'Address not listed'}
      value={formatShortDistance(place.distanceKm)}
      caption="away"
      onPress={onPress}
    />
  );
}

/** "850 m", "1.8 km" — for the trailing column. */
function formatShortDistance(distanceKm: number): string {
  return distanceKm < 1 ? `${Math.max(10, Math.round((distanceKm * 1000) / 10) * 10)} m` : `${distanceKm.toFixed(1)} km`;
}

/** "850 m", "1.8 km" — straight-line, so labelled "away" rather than as a route distance. */
export function formatStraightLineDistance(distanceKm: number): string {
  return distanceKm < 1 ? `${Math.max(10, Math.round((distanceKm * 1000) / 10) * 10)} m away` : `${distanceKm.toFixed(1)} km away`;
}
