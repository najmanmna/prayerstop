import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet } from 'react-native';

import { MosqueLogo } from '@/components/home/mosque-logo';
import { RouteGradient } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Stands in for a real place photo (Google Places imagery isn't integrated
 * yet — see docs/06-data-and-api-plan.md). Abstract gradient + icon, not a
 * fabricated photo of a specific real place.
 */
export function PlaceThumbnail({ size = 72 }: { size?: number }) {
  const gradient = RouteGradient[useColorScheme() ?? 'light'];

  return (
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.tile, { width: size, height: size, borderRadius: size * 0.27 }]}>
      <MosqueLogo size={size * 0.56} color="rgba(255,255,255,0.94)" />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
