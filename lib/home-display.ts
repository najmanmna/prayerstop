import { formatClock12, formatDuration, offsetClock, parseClock } from '@/lib/time';
import type { PlanningContext, PrayerPlace, PrayerWindow } from '@/types/home';

/**
 * Share of the active prayer's window still left, 0–1, for the countdown
 * card's progress bar. Null (no bar) whenever that can't be stated honestly:
 * planning ahead (NEXT), a window that hasn't started, or a deadline we
 * don't know (Isha). NOW windows never cross midnight while active, so a
 * same-day start/end difference is safe here.
 */
export function windowRemainingFraction(
  context: PlanningContext,
  window: PrayerWindow,
  countdownSeconds: number | null
): number | null {
  if (context !== 'now' || !window.hasStarted || window.endTime === null || countdownSeconds === null) return null;
  const lengthSeconds = (parseClock(window.endTime) - parseClock(window.startTime)) * 60;
  if (lengthSeconds <= 0) return null;
  return Math.min(1, Math.max(0, countdownSeconds / lengthSeconds));
}

/**
 * Whether a prayer's start time is earlier today than `now`. Purely a
 * clock fact for dimming the schedule row: it says nothing about whether
 * the user prayed it (the app never tracks that).
 */
export function hasPrayerTimePassed(time: string, now: Date): boolean {
  return parseClock(time) <= now.getHours() * 60 + now.getMinutes();
}

export type ReachabilityTone = 'comfortable' | 'tight' | 'tooLate' | 'neutral';

export interface ReachabilitySummary {
  tone: ReachabilityTone;
  title: string;
}

/**
 * The one-glance answer on the recommendation card ("You can make it in
 * time."). Built only from facts we have: the place's already-computed
 * feasibility (never recomputed here; see build-place-scenario.ts) and the
 * window's known/unknown deadline. Unknown deadlines stay unknown.
 */
export function summarizeReachability(context: PlanningContext, window: PrayerWindow, place: PrayerPlace): ReachabilitySummary {
  if (context === 'next') {
    if (place.feasibility === 'tooLate') {
      return { tone: 'tooLate', title: `Can’t arrive before ${window.name} starts` };
    }
    return { tone: place.feasibility, title: `Leave by ${formatClock12(offsetClock(window.startTime, -place.etaMinutes))}` };
  }
  if (!window.hasStarted) {
    return { tone: 'neutral', title: `${window.name} hasn’t started yet` };
  }
  if (window.endTime === null) {
    // Isha: ACJU lists no end time, so we make no in-time/too-late claim.
    return { tone: 'neutral', title: `${window.name} end time not listed` };
  }
  if (place.feasibility === 'tooLate') {
    // "Too late to reach" is preserved verbatim (see CLAUDE.md).
    return { tone: 'tooLate', title: 'Too late to reach' };
  }
  return {
    tone: place.feasibility,
    title: place.feasibility === 'tight' ? 'It’s tight, but you can make it' : 'You can make it in time',
  };
}

/**
 * The one line under the verdict: how long the prayer has left (or until it
 * starts) and how far the mosque is, e.g. "Asr ends in 1h 45m · mosque 3 min
 * away". Uses the prayer engine's countdown (already correct across
 * midnight) and the place's real ETA; never invents an end for Isha.
 */
export function reachabilityDetail(
  context: PlanningContext,
  window: PrayerWindow,
  countdownSeconds: number | null,
  place: PrayerPlace
): string {
  const away = `mosque ${place.etaMinutes} min away`;
  const countdown = countdownSeconds === null ? null : formatDuration(Math.max(0, Math.round(countdownSeconds / 60)));

  if (context === 'next') {
    return countdown
      ? `${window.name} starts in ${countdown} · ${away}`
      : `${window.name} starts at ${formatClock12(window.startTime)} · ${away}`;
  }
  if (!window.hasStarted) return `Starts at ${formatClock12(window.startTime)} · ${away}`;
  if (window.endTime === null || countdown === null) return `Mosque is ${place.etaMinutes} min away`;
  return `${window.name} ends in ${countdown} · ${away}`;
}
