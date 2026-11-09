import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { PLACE_ICON_SIZE } from '@/components/home/place-list-card';
import { PlaceThumbnail } from '@/components/home/place-thumbnail';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * The one layout every place list row uses (Home and Nearby), so rows are
 * spaced identically whatever their data:
 *
 *   [icon]  Name (≤2 lines)                 value
 *           subtitle (1 line)             caption
 *
 * Everything is vertically centred; the trailing column is right-aligned so
 * drive times line up down the list.
 */
export function PlaceRow({
  name,
  subtitle,
  value,
  valueColor,
  caption,
  captionColor,
  isDriveTime = false,
  onPress,
}: {
  name: string;
  subtitle: string;
  value: string;
  valueColor?: string;
  caption?: string | null;
  captionColor?: string;
  /** Marks `value` as a drive time, shown with the car icon. */
  isDriveTime?: boolean;
  /** Opens the place's Details screen. Omit to render the row inert. */
  onPress?: () => void;
}) {
  const theme = Colors[useColorScheme() ?? 'light'];

  return (
    <TouchableOpacity
      disabled={!onPress}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      accessibilityRole={onPress ? 'button' : undefined}
      style={styles.row}>
      <View style={styles.iconColumn}>
        <PlaceThumbnail size={40} />
      </View>
      <View style={styles.info}>
        <ThemedText type="defaultSemiBold" style={styles.name} numberOfLines={2}>
          {name}
        </ThemedText>
        <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]} numberOfLines={1}>
          {subtitle}
        </ThemedText>
      </View>
      <View style={styles.trailing}>
        <View style={styles.valueRow}>
          {isDriveTime && <IconSymbol name="car.fill" size={14} color={valueColor ?? theme.text} />}
          <ThemedText style={[styles.value, { color: valueColor ?? theme.text }]} numberOfLines={1}>
            {value}
          </ThemedText>
        </View>
        {caption ? (
          <ThemedText style={[styles.caption, { color: captionColor ?? theme.textMuted }]} numberOfLines={2}>
            {caption}
          </ThemedText>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
  },
  // Same 48px column as the best-match card, so text starts on one line.
  iconColumn: {
    width: PLACE_ICON_SIZE,
    alignItems: 'center',
  },
  info: {
    flex: 1,
    gap: 3,
  },
  name: {
    fontSize: 14.5,
    lineHeight: 19,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12.5,
    lineHeight: 16,
  },
  // Fixed width so every row's value and caption end on the same edge
  // ("4 min" and "14 min" line up); wide enough for "Too late to reach".
  trailing: {
    width: 92,
    alignItems: 'flex-end',
    gap: 3,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  value: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  // Up to two lines so "Too late to reach" is never cut short.
  caption: {
    textAlign: 'right',
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: '700',
  },
});
