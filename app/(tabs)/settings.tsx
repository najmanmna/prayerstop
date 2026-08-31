import Constants from 'expo-constants';
import { Alert, Linking, Platform, ScrollView, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePrayerNotifications } from '@/hooks/prayer-notifications';

/**
 * Deliberately minimal for now — no user accounts (see the "no complex
 * auth" / MVP scope rules in CLAUDE.md). Prayer reminders (Phase 7) are the
 * one real preference so far; exists as a real tab per Phase 6, not a
 * placeholder route.
 */
export default function SettingsScreen() {
  const theme = Colors[useColorScheme() ?? 'light'];
  const version = Constants.expoConfig?.version ?? '—';
  const notifications = usePrayerNotifications();
  const remindersOn = notifications.settings.enabled;

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText style={styles.title}>Settings</ThemedText>

          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            <View style={styles.row}>
              <ThemedText style={{ color: theme.textSecondary }}>App version</ThemedText>
              <ThemedText type="defaultSemiBold">{version}</ThemedText>
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            <View style={styles.sectionHeader}>
              <IconSymbol name="bell.fill" size={17} color={theme.tint} />
              <ThemedText type="defaultSemiBold">Prayer reminders</ThemedText>
            </View>
            <ThemedText style={[styles.sectionCaption, { color: theme.textSecondary }]}>
              Local reminders for Fajr, Dhuhr, Asr, Maghrib, and Isha — 10 minutes before and at the start of each.
              Scheduled on this device only; no account and no internet connection required.
            </ThemedText>

            <View style={styles.row}>
              <ThemedText type="defaultSemiBold">Enable reminders</ThemedText>
              <Switch
                value={remindersOn}
                onValueChange={notifications.setEnabled}
                trackColor={{ false: theme.border, true: theme.tint }}
                disabled={!notifications.isLoaded}
              />
            </View>

            {notifications.permissionStatus === 'denied' && (
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => Linking.openSettings()}
                style={[styles.permissionNotice, { backgroundColor: theme.accentSoft }]}>
                <ThemedText style={[styles.permissionNoticeText, { color: theme.tint }]}>
                  Notifications are turned off in system settings. Tap to open Settings and allow them.
                </ThemedText>
              </TouchableOpacity>
            )}

            {Platform.OS === 'android' && remindersOn && notifications.exactAlarmAvailable === false && (
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => notifications.openExactAlarmSettings()}
                style={[styles.permissionNotice, { backgroundColor: theme.accentSoft }]}>
                <ThemedText style={[styles.permissionNoticeText, { color: theme.tint }]}>
                  Exact alarm access isn&apos;t granted, so reminders may arrive several minutes late or out of
                  order. Tap to open Alarms &amp; reminders settings and allow it.
                </ThemedText>
              </TouchableOpacity>
            )}

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            <View style={styles.row}>
              <ThemedText style={{ color: remindersOn ? theme.text : theme.textMuted }}>10 minutes before</ThemedText>
              <Switch
                value={notifications.settings.tenMinutesBefore}
                onValueChange={notifications.setTenMinutesBefore}
                trackColor={{ false: theme.border, true: theme.tint }}
                disabled={!remindersOn}
              />
            </View>
            <View style={styles.row}>
              <ThemedText style={{ color: remindersOn ? theme.text : theme.textMuted }}>At prayer time</ThemedText>
              <Switch
                value={notifications.settings.atPrayerTime}
                onValueChange={notifications.setAtPrayerTime}
                trackColor={{ false: theme.border, true: theme.tint }}
                disabled={!remindersOn}
              />
            </View>
          </View>

          {__DEV__ && (
            <View style={[styles.card, { backgroundColor: theme.surface }]}>
              <View style={styles.sectionHeader}>
                <IconSymbol name="bell.fill" size={17} color={theme.textSecondary} />
                <ThemedText type="defaultSemiBold">Developer</ThemedText>
              </View>
              <ThemedText style={[styles.sectionCaption, { color: theme.textSecondary }]}>
                Fires a one-off local notification in 5 seconds, bypassing real prayer times — for checking
                permissions/scheduling/display only. Not shown in production builds.
              </ThemedText>
              <TouchableOpacity
                accessibilityRole="button"
                activeOpacity={0.85}
                onPress={async () => {
                  const result = await notifications.sendTestNotification();
                  Alert.alert(
                    result === 'sent' ? 'Test notification scheduled' : 'Permission denied',
                    result === 'sent'
                      ? 'It should appear in about 5 seconds.'
                      : 'Notifications are turned off in system settings.'
                  );
                }}
                style={[styles.testButton, { backgroundColor: theme.tint }]}>
                <ThemedText type="defaultSemiBold" style={styles.testButtonLabel}>
                  Send test notification (5s)
                </ThemedText>
              </TouchableOpacity>
            </View>
          )}

          <ThemedText style={[styles.footnote, { color: theme.textMuted }]}>
            PrayerStop doesn&apos;t track whether you&apos;ve prayed, and doesn&apos;t require an account. More
            settings will appear here as the app grows.
          </ThemedText>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 28,
    gap: 18,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
  },
  card: {
    borderRadius: 22,
    padding: 16,
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionCaption: {
    fontSize: 13,
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  permissionNotice: {
    borderRadius: 12,
    padding: 10,
  },
  permissionNoticeText: {
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '600',
  },
  footnote: {
    fontSize: 13,
    lineHeight: 18,
  },
  testButton: {
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  testButtonLabel: {
    color: '#FFFFFF',
  },
});
