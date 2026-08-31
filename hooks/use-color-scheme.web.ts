/**
 * PrayerStop forces light mode for now (Phase 1 product decision — consistent
 * branding regardless of device setting, common for premium utility apps).
 * The `dark` palette in constants/theme.ts is kept for a possible future
 * dark-mode pass; flipping this hook back to `react-native`'s real
 * `useColorScheme` is the only change needed to re-enable it.
 */
export function useColorScheme(): 'light' | 'dark' {
  return 'light';
}
