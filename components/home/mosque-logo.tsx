import Svg, { Circle, Path, Rect } from 'react-native-svg';

/** A compact, neutral mosque silhouette used to identify prayer-place tiles. */
export function MosqueLogo({ size, color = '#FFFFFF' }: { size: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Rect x="8" y="27" width="8" height="26" rx="2" fill={color} />
      <Rect x="48" y="27" width="8" height="26" rx="2" fill={color} />
      <Path d="M7 25L12 18L17 25H7Z" fill={color} />
      <Path d="M47 25L52 18L57 25H47Z" fill={color} />
      <Path d="M17 52V36C17 27.163 23.716 20 32 20C40.284 20 47 27.163 47 36V52H17Z" fill={color} />
      <Path d="M22 31C24.743 25.518 28.023 23 32 23C35.977 23 39.257 25.518 42 31H22Z" fill="rgba(0,0,0,0.16)" />
      <Path d="M28 52V45C28 42.791 29.791 41 32 41C34.209 41 36 42.791 36 45V52H28Z" fill="rgba(0,0,0,0.2)" />
      <Rect x="5" y="52" width="54" height="5" rx="2.5" fill={color} />
      <Rect x="30.5" y="12" width="3" height="9" rx="1.5" fill={color} />
      <Circle cx="32" cy="10" r="3" fill={color} />
    </Svg>
  );
}
