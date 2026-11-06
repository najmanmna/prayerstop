import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Colors, FeasibilityColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { ReachabilitySummary } from '@/lib/home-display';

/**
 * The plain-words answer ("You can make it in time.") shown as the tinted
 * top band of the recommendation card, so the answer and the place it's
 * about read as one unit and fit in the first screen together.
 */
export function ReachabilityStrip({ summary }: { summary: ReachabilitySummary }) {
  const theme = Colors[useColorScheme() ?? 'light'];
  const colors =
    summary.tone === 'neutral'
      ? { background: theme.surface, foreground: theme.textSecondary }
      : FeasibilityColors[summary.tone];

  return (
    <View accessibilityRole="summary" style={[styles.strip, { backgroundColor: colors.background }]}>
      <StatusGlyph tone={summary.tone} color={colors.foreground} />
      <View style={styles.text}>
        <ThemedText style={[styles.title, { color: summary.tone === 'neutral' ? theme.text : colors.foreground }]}>
          {summary.title}
        </ThemedText>
        <ThemedText style={[styles.body, { color: theme.textSecondary }]}>{summary.body}</ThemedText>
      </View>
    </View>
  );
}

function StatusGlyph({ tone, color }: { tone: ReachabilitySummary['tone']; color: string }) {
  return (
    <Svg width={30} height={30} viewBox="0 0 40 40">
      <Circle cx="20" cy="20" r="17" stroke={color} strokeWidth="3.5" fill="none" />
      {tone === 'comfortable' || tone === 'tight' ? (
        <Path d="M12.5 20.5 L18 26 L28 15" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      ) : tone === 'tooLate' ? (
        <Path d="M14 14 L26 26 M26 14 L14 26" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
      ) : (
        <Path d="M20 11 V21 L26 25" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      )}
    </Svg>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  text: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  body: {
    fontSize: 12.5,
    lineHeight: 17,
  },
});
