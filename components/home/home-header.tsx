import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MosqueLogo } from '@/components/home/mosque-logo';
import { MosqueSkyline } from '@/components/home/mosque-skyline';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, HeaderGradient } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** How far the prayer card below is pulled up over the header's lower edge. */
export const HEADER_CARD_OVERLAP = 60;

/**
 * Full-bleed green header that runs up under the status bar: greeting,
 * brand, the current location line (tappable when location needs fixing),
 * and the refresh controls. The bottom fades into the page background so
 * the prayer card can overlap it.
 */
export function HomeHeader({
  locationText,
  locationInteractive,
  onLocationPress,
  notice,
  onNoticePress,
  showRefresh,
  isRefreshing,
  onRefresh,
}: {
  locationText: string;
  locationInteractive: boolean;
  onLocationPress: () => void;
  notice: string | null;
  onNoticePress: () => void;
  showRefresh: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  const theme = Colors[useColorScheme() ?? 'light'];
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const skylineWidth = Math.min(width * 0.42, 190);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8, paddingBottom: HEADER_CARD_OVERLAP + 4 }]}>
      <LinearGradient
        colors={HeaderGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={styles.skyline}>
        <MosqueSkyline width={skylineWidth} />
      </View>
      {/* Fade into the page so the overlapping card sits on a soft edge. */}
      <LinearGradient
        pointerEvents="none"
        colors={[`${theme.background}00`, theme.background]}
        style={[styles.fade, { height: HEADER_CARD_OVERLAP + 10 }]}
      />

      <View style={styles.topRow}>
        <View style={styles.brand}>
          <MosqueLogo size={34} />
          <View>
            <ThemedText style={styles.greeting}>Assalamu Alaikum</ThemedText>
            <ThemedText style={styles.appName}>PrayerStop</ThemedText>
          </View>
        </View>
        {showRefresh && (
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
        )}
      </View>

      <TouchableOpacity
        style={styles.locationRow}
        disabled={!locationInteractive}
        onPress={onLocationPress}
        activeOpacity={0.7}>
        <IconSymbol name="mappin.circle.fill" size={16} color="#9BE3B5" />
        <ThemedText type="defaultSemiBold" style={styles.locationText} numberOfLines={1}>
          {locationText}
        </ThemedText>
      </TouchableOpacity>
      <View style={styles.noticeSlot}>
        {notice && (
          <TouchableOpacity onPress={onNoticePress} disabled={isRefreshing} activeOpacity={0.7} style={styles.noticePill}>
            <IconSymbol name="arrow.clockwise" size={11} color="rgba(255,255,255,0.85)" />
            {/* Always one line: wrapping used to spill up over the location. */}
            <ThemedText style={styles.notice} numberOfLines={1}>
              {notice}
            </ThemedText>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  skyline: {
    position: 'absolute',
    right: -10,
    // Base tucks behind the overlapping card, as if the card sits in front of the mosque.
    bottom: HEADER_CARD_OVERLAP - 38,
    opacity: 0.9,
  },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  greeting: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
    lineHeight: 15,
  },
  appName: {
    color: '#FFFFFF',
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    maxWidth: '62%',
  },
  locationText: {
    color: '#FFFFFF',
    fontSize: 14,
    flexShrink: 1,
  },
  // Fixed height so the card below never jumps when a notice appears.
  noticeSlot: {
    height: 30,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  noticePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  notice: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
    lineHeight: 14,
    flexShrink: 1,
  },
});
