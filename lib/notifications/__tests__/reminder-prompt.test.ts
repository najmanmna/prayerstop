import { shouldShowReminderPrompt } from '../reminder-prompt';

const ready = {
  seen: false as const,
  remindersLoaded: true,
  remindersEnabled: false,
  permissionStatus: 'undetermined' as const,
  prayerTimesShown: true,
  locationSettled: true,
};

describe('shouldShowReminderPrompt', () => {
  it('shows on a fresh install once Home is ready', () => {
    expect(shouldShowReminderPrompt(ready)).toBe(true);
  });

  it('also shows when notifications are already allowed but reminders are off', () => {
    expect(shouldShowReminderPrompt({ ...ready, permissionStatus: 'granted' })).toBe(true);
  });

  it.each([
    ['already answered', { seen: true }],
    ['seen flag still loading', { seen: 'unknown' }],
    ['reminders already on', { remindersEnabled: true }],
    ['settings still loading', { remindersLoaded: false }],
    ['notifications denied in the OS', { permissionStatus: 'denied' }],
    ['permission still loading', { permissionStatus: 'unknown' }],
    ['no prayer times on screen', { prayerTimesShown: false }],
    ['location prompt still open', { locationSettled: false }],
  ])('stays hidden when %s', (_label, overrides) => {
    expect(shouldShowReminderPrompt({ ...ready, ...(overrides as object) })).toBe(false);
  });
});
