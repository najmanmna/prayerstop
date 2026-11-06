import { Platform, StyleSheet, View } from 'react-native';

import { MosqueLogo } from '@/components/home/mosque-logo';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { hasPrayerTimePassed } from '@/lib/home-display';
import { formatClock12 } from '@/lib/time';
import type { PrayerName, ScheduleEntry } from '@/types/home';

/**
 * Today's five prayer times in one row. The selected prayer is highlighted
 * with the place marker; times already behind the clock are dimmed. Dimming
 * is a clock fact only — never a "prayed" mark (the app doesn't track that).
 * Sunrise sits in the header line, never interleaved into the row.
 */
export function PrayerDayCard({
  schedule,
  activeName,
  sunriseTime,
  now,
}: {
  schedule: ScheduleEntry[];
  activeName: PrayerName;
  sunriseTime?: string;
  now: Date;
}) {
  const theme = Colors[useColorScheme() ?? 'light'];

  return (
    <View style={[styles.card, { backgroundColor: theme.surfaceElevated }, cardShadow()]}>
      <View style={styles.headerRow}>
        <ThemedText style={[styles.label, { color: theme.textSecondary }]}>TODAY&apos;S PRAYER TIMES</ThemedText>
        {sunriseTime && (
          <ThemedText style={styles.sunrise}>Sunrise {formatClock12(sunriseTime)}</ThemedText>
        )}
      </View>
      <View style={styles.row}>
        {schedule.map((entry) => {
          const active = entry.name === activeName;
          const passed = !active && hasPrayerTimePassed(entry.time, now);
          const tone = active ? theme.tint : passed ? theme.textMuted : theme.text;
          return (
            <View key={entry.name} style={[styles.column, active && { backgroundColor: theme.accentSoft }]}>
              <View style={styles.icon}>
                {active ? (
                  <MosqueLogo size={18} color={theme.tint} />
                ) : (
                  <IconSymbol name="clock.fill" size={15} color={passed ? theme.border : theme.textMuted} />
                )}
              </View>
              {/* One line each, shrinking to fit rather than wrapping, so a
                  large system font can't push "Maghrib"'s time to two lines. */}
              <ThemedText
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                style={[styles.name, { color: tone }]}>
                {entry.name}
              </ThemedText>
              <ThemedText
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                style={[styles.time, { color: active ? theme.tint : theme.textMuted }]}>
                {formatClock12(entry.time)}
              </ThemedText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function cardShadow() {
  return Platform.select({
    ios: { shadowColor: '#14171A', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
    android: { elevation: 2 },
    default: {},
  });
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  // Warm, non-brand tone: Sunrise is a reference marker (Fajr's end), not a prayer.
  sunrise: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#B8741A',
  },
  row: {
    flexDirection: 'row',
    gap: 4,
  },
  column: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderRadius: 14,
  },
  icon: {
    height: 19,
    justifyContent: 'center',
  },
  name: {
    fontSize: 13,
    fontWeight: '700',
  },
  time: {
    fontSize: 11,
    fontWeight: '500',
  },
});
