import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { PlanningContext } from '@/types/home';

const OPTIONS: { value: PlanningContext; title: string; subtitle: string }[] = [
  { value: 'now', title: 'NOW', subtitle: 'Current prayer' },
  { value: 'next', title: 'NEXT', subtitle: 'Upcoming prayer' },
];

export function NowNextToggle({
  value,
  onChange,
  inverted = false,
}: {
  value: PlanningContext;
  onChange: (value: PlanningContext) => void;
  inverted?: boolean;
}) {
  const theme = Colors[useColorScheme() ?? 'light'];

  return (
    <View style={[styles.row, { backgroundColor: inverted ? 'rgba(255,255,255,0.12)' : theme.surface }]}>
      {OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <TouchableOpacity
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            activeOpacity={0.85}
            style={[
              styles.segment,
              { backgroundColor: selected ? (inverted ? 'rgba(255,255,255,0.2)' : theme.tint) : 'transparent' },
            ]}>
            <ThemedText
              type="defaultSemiBold"
              style={[styles.title, { color: inverted ? '#FFFFFF' : selected ? '#FFFFFF' : theme.text }]}> 
              {option.title}
            </ThemedText>
            <ThemedText
              style={[
                styles.subtitle,
                { color: inverted ? 'rgba(255,255,255,0.72)' : selected ? 'rgba(255,255,255,0.8)' : theme.textSecondary },
              ]}>
              {option.subtitle}
            </ThemedText>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 16,
  },
  segment: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 9,
    alignItems: 'center',
  },
  title: {
    fontSize: 14,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 11,
    marginTop: 1,
  },
});
