import { useCallback, useEffect, useState } from 'react';

import { usePrayerNotifications } from '@/hooks/prayer-notifications';
import { loadReminderPromptSeen, markReminderPromptSeen, shouldShowReminderPrompt } from '@/lib/notifications/reminder-prompt';

/** Drives the one-time reminders card on Home; see `shouldShowReminderPrompt` for when it appears. */
export function useReminderPrompt({ prayerTimesShown, locationSettled }: { prayerTimesShown: boolean; locationSettled: boolean }) {
  const notifications = usePrayerNotifications();
  const [seen, setSeen] = useState<boolean | 'unknown'>('unknown');

  useEffect(() => {
    let cancelled = false;
    loadReminderPromptSeen().then((value) => {
      if (!cancelled) setSeen(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const shouldShow = shouldShowReminderPrompt({
    seen,
    remindersLoaded: notifications.isLoaded,
    remindersEnabled: notifications.settings.enabled,
    permissionStatus: notifications.permissionStatus,
    prayerTimesShown,
    locationSettled,
  });

  // Latched open: turning reminders on makes `shouldShow` false, but the card
  // must stay up for its second (on-time reminders) step until answered.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (shouldShow) setOpen(true);
  }, [shouldShow]);

  // Hidden for good once answered, whether "Turn on", "Not now" or "Skip".
  const dismiss = useCallback(() => {
    setOpen(false);
    setSeen(true);
    void markReminderPromptSeen();
  }, []);

  return { visible: open, dismiss };
}
