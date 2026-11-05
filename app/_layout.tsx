import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { NearbyPlacesSessionProvider } from '@/hooks/nearby-places-session';
import { PrayerNotificationsProvider } from '@/hooks/prayer-notifications';
import { PrayerZoneProvider } from '@/hooks/prayer-zone';

// Forced light mode for now — see hooks/use-color-scheme.ts.
export default function RootLayout() {
  return (
    <ThemeProvider value={DefaultTheme}>
      {/* Mounted once, above the router stack, so Home/Nearby/Place Details
          all read the same fetched session instead of each fetching their
          own — see hooks/nearby-places-session.tsx. Same reasoning for
          prayer-reminder scheduling — it must keep running regardless of
          which screen is active, not just while Settings is open. */}
      <NearbyPlacesSessionProvider>
        {/* Inside the session provider: the prayer zone comes from the same
            device location, and every screen's prayer times plus the
            reminders below must all use that one zone. */}
        <PrayerZoneProvider>
          <PrayerNotificationsProvider>
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="place/[id]" options={{ title: 'Prayer Place', headerBackTitle: 'Back' }} />
            </Stack>
          </PrayerNotificationsProvider>
        </PrayerZoneProvider>
      </NearbyPlacesSessionProvider>
      <StatusBar style="dark" />
    </ThemeProvider>
  );
}
