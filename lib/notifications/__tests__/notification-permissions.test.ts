import { toNotificationPermissionStatus } from '../notification-permissions';

jest.mock('expo-notifications', () => ({}));

describe('toNotificationPermissionStatus', () => {
  it('keeps granted', () => {
    expect(toNotificationPermissionStatus({ status: 'granted', canAskAgain: true })).toBe('granted');
  });

  it('treats a never-asked Android 13+ permission (reported as denied) as undetermined', () => {
    // Regression: this hid the reminders card on every fresh install.
    expect(toNotificationPermissionStatus({ status: 'denied', canAskAgain: true })).toBe('undetermined');
  });

  it('keeps a refusal we cannot ask about again as denied', () => {
    expect(toNotificationPermissionStatus({ status: 'denied', canAskAgain: false })).toBe('denied');
    expect(toNotificationPermissionStatus({ status: 'denied' })).toBe('denied');
  });

  it('keeps undetermined', () => {
    expect(toNotificationPermissionStatus({ status: 'undetermined', canAskAgain: true })).toBe('undetermined');
  });
});
