import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { PLACE_ICON_SIZE } from '@/components/home/place-list-card';
import { PlaceThumbnail } from '@/components/home/place-thumbnail';
import { ThemedText } from '@/components/themed-text';
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
  onPress,
}: {
  name: string;
  subtitle: string;
  value: string;
  valueColor?: string;
  caption?: string | null;
  captionColor?: string;
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
        <ThemedText style={[styles.value, { color: valueColor ?? theme.text }]}>{value}</ThemedText>
        {caption ? (
          <ThemedText style={[styles.caption, { color: captionColor ?? theme.textMuted }]} numberOfLines={1}>
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
  trailing: {
    alignItems: 'flex-end',
    gap: 3,
    maxWidth: 110,
  },
  value: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  caption: {
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: '700',
  },
});
