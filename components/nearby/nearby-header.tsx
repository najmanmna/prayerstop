import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, HeaderGradient } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** How far the first card below is pulled up over the header's lower edge. */
export const NEARBY_HEADER_OVERLAP = 48;

/** Full-bleed green header for Nearby, matching Home's: title, summary lines, refresh. */
export function NearbyHeader({
  summary,
  detail,
  isRefreshing,
  onRefresh,
}: {
  summary: string;
  detail: string | null;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  const theme = Colors[useColorScheme() ?? 'light'];
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 10, paddingBottom: NEARBY_HEADER_OVERLAP + 14 }]}>
      <LinearGradient colors={HeaderGradient} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} style={StyleSheet.absoluteFill} />
      <LinearGradient
        pointerEvents="none"
        colors={[`${theme.background}00`, theme.background]}
        style={[styles.fade, { height: NEARBY_HEADER_OVERLAP + 6 }]}
      />
      <View style={styles.row}>
        <View style={styles.text}>
          <ThemedText style={styles.title}>Nearby mosques</ThemedText>
          <ThemedText style={styles.summary} numberOfLines={1}>
            {summary}
          </ThemedText>
          {detail && (
            <View style={styles.detailRow}>
              <IconSymbol name="clock.fill" size={12} color="#9BE3B5" />
              <ThemedText style={styles.detail} numberOfLines={1}>
                {detail}
              </ThemedText>
            </View>
          )}
        </View>
        <TouchableOpacity
          onPress={onRefresh}
          disabled={isRefreshing}
          accessibilityRole="button"
          accessibilityLabel="Refresh location and nearby places"
          style={styles.iconButton}>
          {isRefreshing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <IconSymbol name="arrow.clockwise" size={18} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  text: {
    flex: 1,
    gap: 3,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
  },
  summary: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13.5,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  detail: {
    color: '#9BE3B5',
    fontSize: 12.5,
    fontWeight: '600',
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
});
