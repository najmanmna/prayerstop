import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const SIZE = 108;
const STROKE = 8;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Surfaces the recommendation's headline number — how much prayer time is
 * left after arriving — as a glanceable ring, ahead of the full place card.
 */
export function RingGauge({
  fraction,
  color,
  children,
  trackColor,
  iconColor,
  showIcon = true,
}: {
  fraction: number;
  color: string;
  children: React.ReactNode;
  trackColor?: string;
  iconColor?: string;
  showIcon?: boolean;
}) {
  const theme = Colors[useColorScheme() ?? 'light'];
  const clamped = Math.min(Math.max(fraction, 0), 1);
  const offset = CIRCUMFERENCE * (1 - clamped);

  return (
    <View style={styles.container}>
      <Svg width={SIZE} height={SIZE}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={trackColor ?? theme.surface}
          strokeWidth={STROKE}
          fill="none"
        />
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          fill="none"
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </Svg>
      <View style={styles.content}>
        {showIcon && <IconSymbol name="clock.fill" size={13} color={iconColor ?? theme.textMuted} />}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    position: 'absolute',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
  },
});
