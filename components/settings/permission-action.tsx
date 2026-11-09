import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, FeasibilityColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * A compact "something needs your OK" row: a short title and reason on the
 * left and one clear button on the right, instead of a paragraph to read.
 */
export function PermissionAction({
  title,
  detail,
  actionLabel,
  onPress,
}: {
  title: string;
  detail: string;
  actionLabel: string;
  onPress: () => void;
}) {
  const theme = Colors[useColorScheme() ?? 'light'];
  const warning = FeasibilityColors.tight;

  return (
    <View style={[styles.row, { backgroundColor: warning.background }]}>
      <IconSymbol name="exclamationmark.circle.fill" size={20} color={warning.foreground} />
      <View style={styles.text}>
        <ThemedText type="defaultSemiBold" style={styles.title}>
          {title}
        </ThemedText>
        <ThemedText style={[styles.detail, { color: theme.textSecondary }]}>{detail}</ThemedText>
      </View>
      <TouchableOpacity
        accessibilityRole="button"
        activeOpacity={0.85}
        onPress={onPress}
        style={[styles.button, { backgroundColor: theme.tint }]}>
        <ThemedText type="defaultSemiBold" style={styles.buttonLabel}>
          {actionLabel}
        </ThemedText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 10,
  },
  text: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontSize: 14,
    lineHeight: 19,
  },
  detail: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  button: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  buttonLabel: {
    color: '#FFFFFF',
    fontSize: 13,
  },
});
