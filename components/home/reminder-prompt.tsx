import { useState } from 'react';
import { Modal, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { usePrayerNotifications } from '@/hooks/prayer-notifications';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * One-time bottom sheet on Home after install, inviting the user to turn on
 * prayer reminders. "Turn on reminders" triggers the OS notification prompt;
 * on Android 12+, if exact alarms aren't allowed, a second step offers a
 * single button to the "Alarms & reminders" screen, so reminders aren't
 * delayed. Shown once (see lib/notifications/reminder-prompt.ts).
 */
export function ReminderPrompt({ visible, onDone }: { visible: boolean; onDone: () => void }) {
  const theme = Colors[useColorScheme() ?? 'light'];
  const insets = useSafeAreaInsets();
  const notifications = usePrayerNotifications();
  const [step, setStep] = useState<'intro' | 'exact'>('intro');
  const [busy, setBusy] = useState(false);

  const turnOn = async () => {
    setBusy(true);
    const enabled = await notifications.setEnabled(true);
    setBusy(false);
    if (enabled && Platform.OS === 'android' && notifications.exactAlarmAvailable === false) {
      setStep('exact');
    } else {
      onDone();
    }
  };

  const allowExact = async () => {
    await notifications.openExactAlarmSettings();
    onDone();
  };

  const isExactStep = step === 'exact';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDone} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: theme.surfaceElevated, paddingBottom: insets.bottom + 20 }]}>
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
          <View style={[styles.iconCircle, { backgroundColor: theme.accentSoft }]}>
            <IconSymbol name={isExactStep ? 'clock.fill' : 'bell.fill'} size={30} color={theme.tint} />
          </View>

          <ThemedText style={styles.title}>{isExactStep ? 'One more step' : 'Never miss a prayer'}</ThemedText>
          <ThemedText style={[styles.body, { color: theme.textSecondary }]}>
            {isExactStep
              ? 'Allow on-time reminders so Android doesn’t delay them. Turn on “Allow setting alarms and reminders” on the next screen.'
              : 'Get a reminder before each prayer, using ACJU prayer times for your area.'}
          </ThemedText>

          {!isExactStep && (
            <View style={[styles.features, { backgroundColor: theme.surface }]}>
              <FeatureRow text="10 minutes before each prayer" />
              <FeatureRow text="At the start of each prayer time" />
            </View>
          )}

          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.85}
            disabled={busy}
            onPress={isExactStep ? allowExact : turnOn}
            style={[styles.primary, { backgroundColor: theme.tint, opacity: busy ? 0.7 : 1 }]}>
            <ThemedText type="defaultSemiBold" style={styles.primaryLabel}>
              {isExactStep ? 'Allow on-time reminders' : 'Turn on reminders'}
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={onDone} style={styles.secondary}>
            <ThemedText style={[styles.secondaryLabel, { color: theme.textSecondary }]}>
              {isExactStep ? 'Skip' : 'Not now'}
            </ThemedText>
          </TouchableOpacity>
          {!isExactStep && (
            <ThemedText style={[styles.footnote, { color: theme.textMuted }]}>
              You can change this anytime in Settings.
            </ThemedText>
          )}
        </View>
      </View>
    </Modal>
  );
}

function FeatureRow({ text }: { text: string }) {
  const theme = Colors[useColorScheme() ?? 'light'];
  return (
    <View style={styles.featureRow}>
      <IconSymbol name="checkmark.circle.fill" size={18} color={theme.tint} />
      <ThemedText style={styles.featureText}>{text}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(6, 26, 18, 0.45)',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 10,
    alignItems: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 20,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '800',
    textAlign: 'center',
  },
  body: {
    fontSize: 14.5,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 6,
  },
  features: {
    alignSelf: 'stretch',
    borderRadius: 16,
    padding: 14,
    gap: 10,
    marginTop: 18,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureText: {
    fontSize: 14,
    fontWeight: '600',
  },
  primary: {
    alignSelf: 'stretch',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 20,
  },
  primaryLabel: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  secondary: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  secondaryLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  footnote: {
    fontSize: 12,
  },
});
