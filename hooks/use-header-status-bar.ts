import { useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

/**
 * For screens whose dark-green header runs up under the status bar: light
 * status-bar icons while the header is in view, dark once it has scrolled
 * past `threshold`, and back to dark whenever the screen loses focus.
 * Returns the ScrollView `onScroll` handler that drives it.
 */
export function useHeaderStatusBar(threshold: number) {
  const [scrolledAway, setScrolledAway] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle(scrolledAway ? 'dark' : 'light');
      return () => setStatusBarStyle('dark');
    }, [scrolledAway])
  );
  return (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = event.nativeEvent.contentOffset.y > threshold;
    if (next !== scrolledAway) setScrolledAway(next);
  };
}
