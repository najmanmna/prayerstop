import { Children, Fragment, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** Width of the icon/thumbnail column every place card shares, so all text starts on one line. */
export const PLACE_ICON_SIZE = 48;
const ICON_GAP = 12;

/**
 * A titled white card holding place rows, used on Home and Nearby. The title
 * lives inside the card (never floating above it), and dividers start where
 * the row text starts, so every card shares one left edge.
 */
export function PlaceListCard({
  title,
  caption,
  note,
  children,
}: {
  title: string;
  caption?: string;
  note?: string;
  children: ReactNode;
}) {
  const theme = Colors[useColorScheme() ?? 'light'];
  const rows = Children.toArray(children);

  return (
    <View style={[styles.card, { backgroundColor: theme.surfaceElevated }, cardShadow()]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <ThemedText style={styles.title}>{title}</ThemedText>
          {caption && <ThemedText style={[styles.caption, { color: theme.textMuted }]}>{caption}</ThemedText>}
        </View>
        {note && <ThemedText style={[styles.note, { color: theme.textMuted }]}>{note}</ThemedText>}
      </View>
      {rows.map((row, index) => (
        <Fragment key={index}>
          {index > 0 && <View style={[styles.divider, { backgroundColor: theme.border }]} />}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

export function cardShadow() {
  return Platform.select({
    ios: { shadowColor: '#14171A', shadowOpacity: 0.07, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
    android: { elevation: 2 },
    default: {},
  });
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    padding: 14,
  },
  header: {
    gap: 2,
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 15.5,
    fontWeight: '700',
  },
  caption: {
    fontSize: 12,
    fontWeight: '500',
  },
  note: {
    fontSize: 12,
    lineHeight: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 11,
    marginLeft: PLACE_ICON_SIZE + ICON_GAP,
  },
});
