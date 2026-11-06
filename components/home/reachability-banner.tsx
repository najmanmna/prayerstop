import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Colors, FeasibilityColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { ReachabilitySummary } from '@/lib/home-display';

/** The one-line answer above the recommendation: can I make it, in plain words. */
export function ReachabilityBanner({ summary }: { summary: ReachabilitySummary }) {
  const theme = Colors[useColorScheme() ?? 'light'];
  const colors =
    summary.tone === 'neutral'
      ? { background: theme.surface, foreground: theme.textSecondary }
      : FeasibilityColors[summary.tone];

  return (
    <View
      accessibilityRole="summary"
      style={[styles.banner, { backgroundColor: colors.background, borderColor: `${colors.foreground}33` }]}>
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
    <Svg width={40} height={40} viewBox="0 0 40 40">
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
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 22,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '800',
  },
  body: {
    fontSize: 13.5,
    lineHeight: 19,
  },
});
