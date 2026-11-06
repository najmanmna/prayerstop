import Svg, { Circle, Path } from 'react-native-svg';

import type { ReachabilityTone } from '@/lib/home-display';

/** Ringed tick / cross / clock marking a reachability answer. */
export function StatusGlyph({ tone, color, size = 30 }: { tone: ReachabilityTone; color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
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
