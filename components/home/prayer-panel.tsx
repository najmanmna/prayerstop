import { LinearGradient } from 'expo-linear-gradient';
import { Platform, StyleSheet, View } from 'react-native';

import { NowNextToggle } from '@/components/home/now-next-toggle';
import { PrayerScheduleStrip } from '@/components/home/prayer-schedule-strip';
import { ThemedText } from '@/components/themed-text';
import { formatClock12 } from '@/lib/time';
import type { PlanningContext, PrayerWindow, ScheduleEntry } from '@/types/home';

/**
 * Shows only the selected prayer's own timing — name, one primary
 * countdown, and its key time (ends-at for NOW, starts-at for NEXT).
 * Deliberately carries no ETA/arrival/recommendation information — that
 * belongs to the recommendation card below (`RecommendationHero`), which
 * already shows it for the specific recommended place.
 */
export function PrayerPanel({
  context,
  onChangeContext,
  window,
  countdownSeconds,
  schedule,
  sunriseTime,
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
  schedule: ScheduleEntry[];
  sunriseTime?: string;
}) {
  const isNow = context === 'now';
  // No live "remaining" countdown is possible either when the deadline
  // isn't known (Isha) or when the window hasn't started yet (Dhuhr during
  // the Sunrise-to-Dhuhr gap) — countdownSeconds is null in both cases.
  const noCountdown = isNow && countdownSeconds === null;

  return (
    <LinearGradient
      colors={['#164C38', '#063A29']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, cardShadow('#000')]}>
      <View style={styles.titleRow}>
        <ThemedText style={[styles.cardLabel, { color: 'rgba(255,255,255,0.72)' }]}>
          {context === 'now' ? 'CURRENT PRAYER' : 'NEXT PRAYER'}
        </ThemedText>
        <View style={styles.liveStatus}>
          <View style={styles.liveDot} />
          <ThemedText style={styles.liveLabel}>{context === 'now' ? 'LIVE' : 'PLAN'}</ThemedText>
        </View>
      </View>
      <NowNextToggle value={context} onChange={onChangeContext} inverted />

      <View style={styles.windowSummary}>
        <ThemedText style={[styles.prayerName, { color: '#FFFFFF' }]}>{window.name}</ThemedText>
        {noCountdown ? (
          <>
            <ThemedText style={styles.countdownNumber}>—</ThemedText>
            <ThemedText style={styles.countdownCaption}>
              {window.hasStarted ? 'No fixed deadline in our data' : 'Hasn’t started yet'}
            </ThemedText>
            <ThemedText style={[styles.keyTime, { color: 'rgba(255,255,255,0.72)' }]}>
              {window.hasStarted ? 'Started at' : 'Starts at'} {formatClock12(window.startTime)}
            </ThemedText>
          </>
        ) : (
          <>
            <ThemedText style={styles.countdownNumber}>{formatLiveCountdown(countdownSeconds ?? 0)}</ThemedText>
            <ThemedText style={styles.countdownCaption}>{isNow ? 'remaining' : 'until start'}</ThemedText>
            <ThemedText style={[styles.keyTime, { color: 'rgba(255,255,255,0.72)' }]}>
              {isNow ? 'Ends' : 'Starts'} {formatClock12(isNow ? (window.endTime ?? window.startTime) : window.startTime)}
            </ThemedText>
          </>
        )}
      </View>

      <View style={styles.divider} />

      <View style={styles.scheduleHeaderRow}>
        <ThemedText style={styles.scheduleLabel}>TODAY&apos;S PRAYER TIMES</ThemedText>
        {sunriseTime && (
          <ThemedText style={styles.sunriseNote}>Sunrise {formatClock12(sunriseTime)}</ThemedText>
        )}
      </View>
      <PrayerScheduleStrip schedule={schedule} activeName={window.name} inverted />
    </LinearGradient>
  );
}

function cardShadow(color: string) {
  return Platform.select({
    ios: {
      shadowColor: color,
      shadowOpacity: 0.08,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 3 },
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
    borderRadius: 24,
    padding: 16,
    gap: 10,
    overflow: 'hidden',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#75E78C',
  },
  liveStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  liveLabel: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  prayerName: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '700',
  },
  windowSummary: {
    alignItems: 'center',
    paddingVertical: 4,
    gap: 1,
  },
  countdownNumber: {
    fontSize: 40,
    lineHeight: 46,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    color: '#91ED9D',
    marginTop: 2,
  },
  countdownCaption: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 12,
  },
  keyTime: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  scheduleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 1,
  },
  scheduleLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
    color: 'rgba(255,255,255,0.58)',
  },
  // A warm, distinctly non-brand tone — Sunrise is a reference marker
  // (Fajr's real end, see prayer-engine.ts), never an active/selectable
  // prayer, so it must read as clearly separate from the schedule strip.
  sunriseNote: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255, 202, 130, 0.9)',
  },
});
