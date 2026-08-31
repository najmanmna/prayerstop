import { syncPrayerNotifications, type PrayerNotificationScheduler } from '../sync-prayer-notifications';
import type { DesiredPrayerNotification } from '../types';

const PREFIX = 'prayerstop-reminder';

function notification(identifier: string, isoDate = '2026-08-20'): DesiredPrayerNotification {
  return {
    identifier,
    isoDate,
    prayerName: 'Fajr',
    kind: 'at-time',
    fireDate: new Date(`${isoDate}T05:00:00.000Z`),
    title: 'Fajr time',
    body: "It's time for Fajr.",
  };
}

function fakeScheduler(initiallyScheduled: string[]): PrayerNotificationScheduler & { scheduled: Set<string> } {
  const scheduled = new Set(initiallyScheduled);
  return {
    scheduled,
    getScheduledIdentifiers: jest.fn(async () => Array.from(scheduled)),
    schedule: jest.fn(async (n: DesiredPrayerNotification) => {
      scheduled.add(n.identifier);
    }),
    cancel: jest.fn(async (id: string) => {
      scheduled.delete(id);
    }),
  };
}

describe('syncPrayerNotifications', () => {
  it('scheduling: schedules every desired notification when nothing is scheduled yet', async () => {
    const scheduler = fakeScheduler([]);
    const desired = [notification(`${PREFIX}:2026-08-20:Fajr:at-time`), notification(`${PREFIX}:2026-08-20:Dhuhr:at-time`)];

    const result = await syncPrayerNotifications(scheduler, desired, PREFIX);

    expect(scheduler.schedule).toHaveBeenCalledTimes(2);
    expect(result.scheduled.sort()).toEqual(desired.map((d) => d.identifier).sort());
    expect(result.cancelled).toEqual([]);
    expect(Array.from(scheduler.scheduled).sort()).toEqual(desired.map((d) => d.identifier).sort());
  });

  it('duplicate prevention: never re-schedules an identifier that is already scheduled', async () => {
    const id = `${PREFIX}:2026-08-20:Fajr:at-time`;
    const scheduler = fakeScheduler([id]);
    const desired = [notification(id)];

    const result = await syncPrayerNotifications(scheduler, desired, PREFIX);

    expect(scheduler.schedule).not.toHaveBeenCalled();
    expect(scheduler.cancel).not.toHaveBeenCalled();
    expect(result).toEqual({ scheduled: [], cancelled: [] });
  });

  it('duplicate prevention: calling sync twice in a row with the same desired set only schedules once', async () => {
    const scheduler = fakeScheduler([]);
    const desired = [notification(`${PREFIX}:2026-08-20:Fajr:at-time`)];

    await syncPrayerNotifications(scheduler, desired, PREFIX);
    await syncPrayerNotifications(scheduler, desired, PREFIX);

    expect(scheduler.schedule).toHaveBeenCalledTimes(1);
  });

  it('rescheduling / date rollover: cancels yesterday-dated identifiers and schedules today-dated ones when the desired set moves forward a day', async () => {
    const yesterdayId = `${PREFIX}:2026-08-20:Fajr:at-time`;
    const todayId = `${PREFIX}:2026-08-21:Fajr:at-time`;
    const scheduler = fakeScheduler([yesterdayId]);
    const desired = [notification(todayId, '2026-08-21')];

    const result = await syncPrayerNotifications(scheduler, desired, PREFIX);

    expect(result.cancelled).toEqual([yesterdayId]);
    expect(result.scheduled).toEqual([todayId]);
    expect(Array.from(scheduler.scheduled)).toEqual([todayId]);
  });

  it('rescheduling: partially overlapping desired sets only touch what actually changed', async () => {
    const keep = `${PREFIX}:2026-08-20:Dhuhr:at-time`;
    const stale = `${PREFIX}:2026-08-20:Fajr:at-time`;
    const fresh = `${PREFIX}:2026-08-20:Asr:at-time`;
    const scheduler = fakeScheduler([keep, stale]);
    const desired = [notification(keep), notification(fresh)];

    const result = await syncPrayerNotifications(scheduler, desired, PREFIX);

    expect(result.cancelled).toEqual([stale]);
    expect(result.scheduled).toEqual([fresh]);
    expect(scheduler.schedule).toHaveBeenCalledTimes(1); // `keep` was left alone, not re-scheduled
  });

  it('disabled notifications: an empty desired list cancels everything under our prefix and schedules nothing', async () => {
    const idA = `${PREFIX}:2026-08-20:Fajr:at-time`;
    const idB = `${PREFIX}:2026-08-20:Dhuhr:at-time`;
    const scheduler = fakeScheduler([idA, idB]);

    const result = await syncPrayerNotifications(scheduler, [], PREFIX);

    expect(result.cancelled.sort()).toEqual([idA, idB].sort());
    expect(result.scheduled).toEqual([]);
    expect(scheduler.scheduled.size).toBe(0);
  });

  it('never touches a scheduled identifier outside our prefix (some other feature\'s notification)', async () => {
    const ours = `${PREFIX}:2026-08-20:Fajr:at-time`;
    const someoneElses = 'other-feature:reminder:1';
    const scheduler = fakeScheduler([ours, someoneElses]);

    const result = await syncPrayerNotifications(scheduler, [], PREFIX);

    expect(result.cancelled).toEqual([ours]);
    expect(scheduler.cancel).toHaveBeenCalledTimes(1);
    expect(scheduler.scheduled.has(someoneElses)).toBe(true);
  });
});
