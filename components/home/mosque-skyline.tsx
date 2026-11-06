import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

/**
 * Home header backdrop: a generic, drawn mosque silhouette (dome, minaret,
 * trees) — an illustration, not a photo of any real mosque. Vector, so it's
 * crisp at any screen density and adds nothing to the bundle.
 */
export function MosqueSkyline({ width }: { width: number }) {
  return (
    <Svg width={width} height={width * (190 / 240)} viewBox="0 0 240 190">
      <Defs>
        <LinearGradient id="dome" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.96" />
          <Stop offset="1" stopColor="#C9D8CE" stopOpacity="0.9" />
        </LinearGradient>
        <LinearGradient id="stone" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#F1F1EA" stopOpacity="0.92" />
          <Stop offset="1" stopColor="#B9CBBF" stopOpacity="0.85" />
        </LinearGradient>
        <LinearGradient id="glow" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFD98A" stopOpacity="0.95" />
          <Stop offset="1" stopColor="#E8A93F" stopOpacity="0.9" />
        </LinearGradient>
      </Defs>

      {/* Soft halo behind the dome */}
      <Ellipse cx="100" cy="112" rx="92" ry="70" fill="#FFFFFF" opacity={0.06} />

      {/* Minaret */}
      <Path d="M178 12 L184 0 L190 12 Z" fill="url(#stone)" />
      <Rect x="179" y="12" width="10" height="168" fill="url(#stone)" />
      <Rect x="175" y="50" width="18" height="5" rx="1.5" fill="url(#stone)" />
      <Rect x="176" y="92" width="16" height="5" rx="1.5" fill="url(#stone)" />
      <Path d="M182 30 Q182 24 184 22 Q186 24 186 30 V40 H182 Z" fill="#0E4A33" opacity={0.35} />
      <Path d="M182 66 Q182 60 184 58 Q186 60 186 66 V78 H182 Z" fill="url(#glow)" opacity={0.85} />

      {/* Main dome with finial and crescent */}
      <Rect x="99" y="34" width="2" height="16" fill="#E7C46A" />
      <Path d="M104 30 A6 6 0 1 1 100 22 A4.5 4.5 0 1 0 104 30 Z" fill="#E7C46A" />
      <Path d="M44 128 C44 88 70 66 100 52 C130 66 156 88 156 128 Z" fill="url(#dome)" />
      <Path d="M58 120 C62 94 78 78 100 66" stroke="#FFFFFF" strokeOpacity={0.55} strokeWidth="2" fill="none" />

      {/* Drum with lit arched windows */}
      <Rect x="38" y="126" width="124" height="18" rx="2" fill="url(#stone)" />
      {[50, 66, 82, 98, 114, 130, 146].map((x) => (
        <Path key={x} d={`M${x - 3} 141 V134 Q${x} 129 ${x + 3} 134 V141 Z`} fill="url(#glow)" />
      ))}

      {/* Prayer hall */}
      <Rect x="20" y="144" width="166" height="46" fill="url(#stone)" />
      {[38, 66, 94, 122, 150].map((x) => (
        <Path key={x} d={`M${x - 8} 190 V166 Q${x} 152 ${x + 8} 166 V190 Z`} fill="#0E4A33" opacity={0.45} />
      ))}

      {/* Trees */}
      <Circle cx="214" cy="150" r="20" fill="#0B3B28" opacity={0.85} />
      <Circle cx="230" cy="138" r="16" fill="#0E4A33" opacity={0.85} />
      <Circle cx="200" cy="170" r="16" fill="#0B3B28" opacity={0.9} />
      <Circle cx="236" cy="168" r="18" fill="#0A3524" opacity={0.95} />
      <Circle cx="10" cy="174" r="16" fill="#0B3B28" opacity={0.75} />
    </Svg>
  );
}
