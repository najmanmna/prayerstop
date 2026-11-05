import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { formatClock12 } from '@/lib/time';
import type { PrayerName, ScheduleEntry } from '@/types/home';

/** A day-at-a-glance strip; the active prayer is the one you need a spot for. */
export function PrayerScheduleStrip({
  schedule,
  activeName,
  inverted = false,
}: {
  schedule: ScheduleEntry[];
  activeName: PrayerName;
  inverted?: boolean;
}) {
  const theme = Colors[useColorScheme() ?? 'light'];

  return (
    <View style={styles.row}>
      {schedule.map((entry) => {
        const active = entry.name === activeName;
        return (
          <View
            key={entry.name}
            style={[styles.column, active && { backgroundColor: inverted ? 'rgba(255,255,255,0.16)' : theme.accentSoft }]}>
            {/* One line each, shrinking to fit rather than wrapping: with a
                large system font size, "Maghrib" fills its fifth of the row and
                its time used to wrap onto a second line (seen on a real device). */}
            <ThemedText
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              style={[styles.name, { color: inverted ? '#FFFFFF' : active ? theme.text : theme.textSecondary }]}>
              {entry.name}
            </ThemedText>
            <ThemedText
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              style={[styles.time, { color: inverted ? (active ? '#9AEEA6' : 'rgba(255,255,255,0.65)') : active ? theme.tint : theme.textMuted }]}>
              {formatClock12(entry.time)}
            </ThemedText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 3,
  },
  column: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 2,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 7,
    borderRadius: 10,
  },
  name: {
    fontSize: 11,
    fontWeight: '600',
  },
  time: {
    fontSize: 10,
    fontWeight: '600',
  },
});
