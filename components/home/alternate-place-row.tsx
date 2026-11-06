import { PlaceRow } from '@/components/home/place-row';
import { Colors, FeasibilityColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { displayPlaceText } from '@/lib/display-text';
import { formatClock12, getArrivalOutcome, offsetClock } from '@/lib/time';
import type { PlanningContext, PrayerPlace, PrayerWindow } from '@/types/home';

/** A routed place: real drive time on the right, with a short status under it. */
export function AlternatePlaceRow({
  place,
  window,
  context,
  onPress,
}: {
  place: PrayerPlace;
  window: PrayerWindow;
  context: PlanningContext;
  /** Opens the place's Details screen. Omit to render the row inert. */
  onPress?: () => void;
}) {
  const theme = Colors[useColorScheme() ?? 'light'];
  const isNow = context === 'now';
  // NOW-only: see the identical comment in recommendation-hero.tsx — this
  // comparison is only safe when `window` and "now" are the same effective
  // calendar day, which doesn't hold for NEXT (e.g. tonight vs. tomorrow's
  // Fajr). `place.feasibility` (used for the colour below) is already
  // correctly computed per-context by build-place-scenario.ts.
  const outcome = isNow ? getArrivalOutcome(window, place.arrivalTime) : { status: 'unknown' as const };
  const statusColor = FeasibilityColors[place.feasibility].foreground;

  // One short status label instead of a sentence — the exact minutes live on
  // the Home card and in Place Details.
  let statusLabel: string;
  let statusColorUsed = statusColor;
  if (context === 'next') {
    statusLabel = `Leave ${formatClock12(offsetClock(window.startTime, -place.etaMinutes))}`;
  } else if (outcome.status === 'unknown') {
    statusLabel = 'drive'; // no listed end time (Isha) — nothing factual to label
    statusColorUsed = theme.textMuted;
  } else if (outcome.overflow) {
    statusLabel = 'Too late to reach';
  } else {
    statusLabel = place.feasibility === 'tight' ? 'Just in time' : 'In time';
  }

  const area = place.area ? ` · ${displayPlaceText(place.area)}` : '';

  return (
    <PlaceRow
      name={displayPlaceText(place.name)}
      subtitle={`${place.distanceKm.toFixed(1)} km${area}`}
      value={`${place.etaMinutes} min`}
      valueColor={statusColor}
      caption={statusLabel}
      captionColor={statusColorUsed}
      isDriveTime
      onPress={onPress}
    />
  );
}
