import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { PlanningContext } from '@/types/home';

const OPTIONS: { value: PlanningContext; title: string; hint: string }[] = [
  { value: 'now', title: 'Now', hint: 'Plan for the current prayer' },
  { value: 'next', title: 'Next', hint: 'Plan for the upcoming prayer' },
];

/** Compact pill toggle for the dark prayer card. */
export function NowNextToggle({
  value,
  onChange,
}: {
  value: PlanningContext;
  onChange: (value: PlanningContext) => void;
}) {
  return (
    <View style={styles.row}>
      {OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <TouchableOpacity
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityHint={option.hint}
            onPress={() => onChange(option.value)}
            activeOpacity={0.85}
            style={[styles.segment, selected && styles.segmentSelected]}>
            <ThemedText type="defaultSemiBold" style={[styles.title, { color: selected ? '#0B3B28' : '#FFFFFF' }]}>
              {option.title}
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
    padding: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  segment: {
    minWidth: 64,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  segmentSelected: {
    backgroundColor: '#A8EBBE',
  },
  title: {
    fontSize: 13,
  },
});
