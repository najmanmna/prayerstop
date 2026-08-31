/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

// A deep, grounded forest green inspired by the approved Home reference.
// It is used with neutral surfaces and route-oriented UI to retain the feel
// of a modern location utility.
const tintColorLight = '#126B46';
const tintColorDark = '#6BC69A';

export const Colors = {
  light: {
    text: '#14171A',
    textSecondary: '#666E78',
    textMuted: '#9BA2AC',
    background: '#FBFCFB',
    surface: '#F1F5F2',
    surfaceElevated: '#FFFFFF',
    accentSoft: '#E1F0E8',
    border: '#E2E9E4',
    tint: tintColorLight,
    icon: '#666E78',
  },
  dark: {
    text: '#F4F5F7',
    textSecondary: '#9AA1AC',
    textMuted: '#666E78',
    background: '#0D0F14',
    surface: '#171A21',
    surfaceElevated: '#1D212A',
    accentSoft: '#173829',
    border: '#272C36',
    tint: tintColorDark,
    icon: '#9AA1AC',
  },
};

// Gradient for the abstract place-thumbnail visual — presentational only,
// standing in for a real photo/map until Places integration lands.
export const RouteGradient = {
  light: ['#2C8A62', '#07563A'] as const,
  dark: ['#4BAE81', '#0B422E'] as const,
};

// Feasibility palette — communicates reachability status, not brand identity.
export const FeasibilityColors = {
  comfortable: { background: '#E1F0E8', foreground: '#126B46' },
  tight: { background: '#FCEEDB', foreground: '#C2760A' },
  tooLate: { background: '#FBE8E7', foreground: '#C93A32' },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
