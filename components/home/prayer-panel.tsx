import { LinearGradient } from 'expo-linear-gradient';
import { Platform, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';

import { NowNextToggle } from '@/components/home/now-next-toggle';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { windowRemainingFraction } from '@/lib/home-display';
import { formatClock12 } from '@/lib/time';
import type { PlanningContext, PrayerWindow } from '@/types/home';

/**
 * The hero timing card: NOW/NEXT toggle, the selected prayer's name, one big
 * live countdown and its key time (ends-at for NOW, starts-at for NEXT),
 * plus a bar showing how much of the window is left when that's known.
 * Deliberately carries no ETA/arrival information — that belongs to the
 * recommendation card below.
 */
export function PrayerPanel({
  context,
  onChangeContext,
  window,
  countdownSeconds,
}: {
  context: PlanningContext;
  onChangeContext: (value: PlanningContext) => void;
  window: PrayerWindow;
  /**
   * NOW: seconds until the active prayer's window closes — null when that
   * deadline isn't reliably known (Isha). NEXT: seconds until the next
   * prayer starts — always known. See hooks/use-prayer-times.ts.
   */
  countdownSeconds: number | null;
}) {
  const isNow = context === 'now';
  // No live "remaining" countdown is possible either when the deadline
  // isn't known (Isha) or when the window hasn't started yet (Dhuhr during
  // the Sunrise-to-Dhuhr gap) — countdownSeconds is null in both cases.
  const noCountdown = isNow && countdownSeconds === null;
  const remainingFraction = windowRemainingFraction(context, window, countdownSeconds);
  const countdownText = noCountdown ? '—' : formatLiveCountdown(countdownSeconds ?? 0);

  let caption: string;
  let keyTime: string;
  if (noCountdown) {
    caption = window.hasStarted ? 'No fixed end time in our data' : 'Hasn’t started yet';
    keyTime = `${window.hasStarted ? 'Started at' : 'Starts at'} ${formatClock12(window.startTime)}`;
  } else {
    caption = isNow ? 'Time remaining' : 'Starts in';
    keyTime = isNow
      ? `Ends at ${formatClock12(window.endTime ?? window.startTime)}`
      : `Starts at ${formatClock12(window.startTime)}`;
  }

  return (
    <LinearGradient
      colors={['#145C3F', '#0A4430', '#06321F']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, cardShadow()]}>
      <View pointerEvents="none" style={styles.arch}>
        <ArchWindow />
      </View>

      <View style={styles.topRow}>
        <NowNextToggle value={context} onChange={onChangeContext} />
        <View style={styles.liveStatus}>
          <View style={[styles.liveDot, !isNow && styles.planDot]} />
          <ThemedText style={styles.liveLabel}>{isNow ? 'LIVE' : 'PLAN'}</ThemedText>
        </View>
      </View>

      <View style={styles.body}>
        <ThemedText style={styles.overline}>{isNow ? 'CURRENT PRAYER' : 'NEXT PRAYER'}</ThemedText>
        <ThemedText style={styles.prayerName}>{window.name}</ThemedText>
        <View style={styles.captionRow}>
          <IconSymbol name="clock.fill" size={14} color="rgba(255,255,255,0.75)" />
          <ThemedText style={styles.caption}>{caption}</ThemedText>
        </View>
        {/* Hour-long countdowns ("2:32:15") step down a size so they fit
            beside the arch on narrow phones (adjustsFontSizeToFit is iOS-only). */}
        <ThemedText style={[styles.countdown, countdownText.length > 5 && styles.countdownLong]} numberOfLines={1}>
          {countdownText}
        </ThemedText>
        <ThemedText style={styles.keyTime}>{keyTime}</ThemedText>
      </View>

      {remainingFraction !== null && (
        <View
          style={styles.track}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(remainingFraction * 100) }}>
          <View style={[styles.fill, { width: `${Math.max(2, remainingFraction * 100)}%` }]} />
        </View>
      )}
    </LinearGradient>
  );
}

/** Decorative arched window with a minaret seen through it. */
function ArchWindow() {
  return (
    <Svg width={132} height={190} viewBox="0 0 132 190">
      <Defs>
        <SvgGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#CFEBDD" stopOpacity="0.55" />
          <Stop offset="1" stopColor="#2E7A57" stopOpacity="0.25" />
        </SvgGradient>
      </Defs>
      {/* Frame */}
      <Path d="M8 190 V86 C8 42 40 18 66 4 C92 18 124 42 124 86 V190 Z" fill="#FFFFFF" opacity={0.1} />
      {/* Opening */}
      <Path d="M24 190 V90 C24 56 46 36 66 24 C86 36 108 56 108 90 V190 Z" fill="url(#sky)" />
      {/* Minaret through the window */}
      <Path d="M78 60 L82 50 L86 60 Z" fill="#FFFFFF" opacity={0.5} />
      <Rect x="79" y="60" width="6" height="130" fill="#FFFFFF" opacity={0.45} />
      <Rect x="76.5" y="88" width="11" height="3" rx="1" fill="#FFFFFF" opacity={0.5} />
      <Rect x="77" y="118" width="10" height="3" rx="1" fill="#FFFFFF" opacity={0.5} />
    </Svg>
  );
}

function cardShadow() {
  return Platform.select({
    ios: {
      shadowColor: '#062F20',
      shadowOpacity: 0.28,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
    },
    android: { elevation: 8 },
    default: {},
  });
}

/**
 * Always shows seconds, ticking every real second regardless of scale, so
 * the countdown visibly counts down live rather than appearing frozen for
 * up to a minute at a time: "42:07" under an hour, "8:59:42" at an hour or
 * more. Clamped at zero so a fleeting boundary-crossing render (the instant
 * a prayer window ends, before the next tick recomputes a fresh context)
 * can never show a negative number.
 */
export function formatLiveCountdown(seconds: number) {
  const clamped = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  const paddedSeconds = secs.toString().padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${paddedSeconds}`;
  }
  return `${minutes}:${paddedSeconds}`;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    padding: 18,
    gap: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  arch: {
    position: 'absolute',
    right: 10,
    bottom: 0,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#75E78C',
  },
  planDot: {
    backgroundColor: '#FFD98A',
  },
  liveLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  body: {
    gap: 2,
  },
  overline: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.9,
  },
  prayerName: {
    color: '#FFFFFF',
    fontSize: 40,
    lineHeight: 46,
    fontWeight: '800',
  },
  captionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  caption: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 14,
  },
  countdown: {
    color: '#A8EBBE',
    fontSize: 58,
    lineHeight: 64,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  countdownLong: {
    fontSize: 46,
    lineHeight: 56,
  },
  keyTime: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 15,
    fontWeight: '600',
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#A8EBBE',
  },
});
