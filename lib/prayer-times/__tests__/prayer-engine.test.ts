import { getPrayerEngineState } from '../prayer-engine';
import { LocalPrayerTimeRepository } from '../prayer-time-repository';
import type { DailyPrayerTimes } from '../types';

const ZONE = 'TEST';

const DAY_1: DailyPrayerTimes = {
  date: '2026-01-01',
  fajr: '05:00',
  sunrise: '06:00',
  dhuhr: '12:00',
  asr: '15:00',
  maghrib: '18:00',
  isha: '19:30',
};

const DAY_2: DailyPrayerTimes = {
  date: '2026-01-02',
  fajr: '05:01',
  sunrise: '06:01',
  dhuhr: '12:00',
  asr: '15:01',
  maghrib: '18:01',
  isha: '19:31',
};

/** Builds the UTC instant corresponding to a given Sri Lanka (UTC+5:30) wall-clock time. */
function slInstant(isoDate: string, hours: number, minutes: number, seconds = 0): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds) - (5 * 60 + 30) * 60_000);
}

function repositoryWith(days: DailyPrayerTimes[]): LocalPrayerTimeRepository {
  return new LocalPrayerTimeRepository([{ zone: ZONE, regions: [], country: 'SRI LANKA', days }]);
}

describe('getPrayerEngineState', () => {
  it('identifies the active and next prayer on a normal day', () => {
    const repository = repositoryWith([DAY_1]);
    const result = getPrayerEngineState(repository, ZONE, slInstant('2026-01-01', 13, 0));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.state.active).toEqual({ name: 'Dhuhr', startTime: '12:00', endTime: '15:00', hasStarted: true });
    expect(result.state.next).toEqual({ name: 'Asr', startTime: '15:00', endTime: '18:00', hasStarted: false });
    expect(result.state.secondsUntilNextStart).toBe(2 * 3600);
    expect(result.state.secondsUntilActiveEnds).toBe(2 * 3600);
  });

  describe('Fajr uses Sunrise as its real, known end (not Dhuhr)', () => {
    it('reports Fajr active with a known countdown to Sunrise', () => {
      const repository = repositoryWith([DAY_1]);
      const result = getPrayerEngineState(repository, ZONE, slInstant('2026-01-01', 5, 30));
      expect(result.status).toBe('ok');
      if (result.status !== 'ok') return;
      expect(result.state.active).toEqual({ name: 'Fajr', startTime: '05:00', endTime: '06:00', hasStarted: true });
      // 30 minutes to Sunrise (Fajr's real deadline), not to Dhuhr.
      expect(result.state.secondsUntilActiveEnds).toBe(30 * 60);
      // "next" (Dhuhr) still correctly reports its own, much later, start.
      expect(result.state.next).toEqual({ name: 'Dhuhr', startTime: '12:00', endTime: '15:00', hasStarted: false });
      expect(result.state.secondsUntilNextStart).toBe((12 - 5.5) * 3600);
    });

    it('transitions away from Fajr exactly at Sunrise, using the real ACJU Sunrise time', () => {
      const repository = repositoryWith([DAY_1]);
      const result = getPrayerEngineState(repository, ZONE, slInstant('2026-01-01', 6, 0, 0));
      expect(result.status).toBe('ok');
      if (result.status !== 'ok') return;
      expect(result.state.active.name).not.toBe('Fajr');
      expect(result.state.active.hasStarted).toBe(false); // Dhuhr hasn't actually started
    });

    it('does not report Fajr as active one second before Sunrise', () => {
      const repository = repositoryWith([DAY_1]);
      const result = getPrayerEngineState(repository, ZONE, slInstant('2026-01-01', 5, 59, 59));
      expect(result.status).toBe('ok');
      if (result.status !== 'ok') return;
      expect(result.state.active.name).toBe('Fajr');
      expect(result.state.secondsUntilActiveEnds).toBe(1);
    });
  });

  describe('the Sunrise-to-Dhuhr gap (no prayer window is actually open)', () => {
    it('surfaces Dhuhr as the upcoming target without claiming it has started', () => {
      const repository = repositoryWith([DAY_1]);
      const result = getPrayerEngineState(repository, ZONE, slInstant('2026-01-01', 8, 0));
      expect(result.status).toBe('ok');
      if (result.status !== 'ok') return;
      expect(result.state.active).toEqual({ name: 'Dhuhr', startTime: '12:00', endTime: '15:00', hasStarted: false });
      expect(result.state.next).toEqual(result.state.active);
      // No "remaining" claim for a window that hasn't started.
      expect(result.state.secondsUntilActiveEnds).toBeNull();
      // But "starts in" is still a real, known claim.
      expect(result.state.secondsUntilNextStart).toBe(4 * 3600);
    });

    it('marks Dhuhr as started exactly at its own start time', () => {
      const repository = repositoryWith([DAY_1]);
      const result = getPrayerEngineState(repository, ZONE, slInstant('2026-01-01', 12, 0, 0));
      expect(result.status).toBe('ok');
      if (result.status !== 'ok') return;
      expect(result.state.active).toEqual({ name: 'Dhuhr', startTime: '12:00', endTime: '15:00', hasStarted: true });
      expect(result.state.secondsUntilActiveEnds).toBe(3 * 3600);
    });
  });

  it('transitions to the next prayer exactly at its start time (inclusive lower bound)', () => {
    const repository = repositoryWith([DAY_1]);
    const result = getPrayerEngineState(repository, ZONE, slInstant('2026-01-01', 15, 0, 0));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.state.active.name).toBe('Asr');
    expect(result.state.next.name).toBe('Maghrib');
  });

  describe('Isha never gets a fabricated deadline (regression coverage)', () => {
    it('reports Maghrib active with Isha as next, and Isha has no end time', () => {
      const repository = repositoryWith([DAY_1]);
      const result = getPrayerEngineState(repository, ZONE, slInstant('2026-01-01', 18, 30));
      expect(result.status).toBe('ok');
      if (result.status !== 'ok') return;
      expect(result.state.active.name).toBe('Maghrib');
      expect(result.state.next).toEqual({ name: 'Isha', startTime: '19:30', endTime: null, hasStarted: false });
    });

    it('reports Isha active with endTime null just after it starts — never the next day\'s Fajr', () => {
      const repository = repositoryWith([DAY_1, DAY_2]);
      const result = getPrayerEngineState(repository, ZONE, slInstant('2026-01-01', 20, 0));
      expect(result.status).toBe('ok');
      if (result.status !== 'ok') return;
      expect(result.state.active.name).toBe('Isha');
      expect(result.state.active.endTime).toBeNull();
      expect(result.state.active.endTime).not.toBe(DAY_2.fajr);
    });

    it('reports Isha active with endTime null just before midnight — never the next day\'s Fajr', () => {
      const repository = repositoryWith([DAY_1, DAY_2]);
      const result = getPrayerEngineState(repository, ZONE, slInstant('2026-01-01', 23, 59, 59));
      expect(result.status).toBe('ok');
      if (result.status !== 'ok') return;
      expect(result.state.active).toEqual({ name: 'Isha', startTime: '19:30', endTime: null, hasStarted: true });
      expect(result.state.next).toEqual({ name: 'Fajr', startTime: '05:01', endTime: '06:01', hasStarted: false });
      // secondsUntilNextStart (time to tomorrow's Fajr) is legitimate and
      // distinct from any claim about when Isha itself ends.
      expect(result.state.secondsUntilNextStart).toBe(1 + 5 * 3600 + 60);
      expect(result.state.secondsUntilActiveEnds).toBeNull();
    });

    it('reports Isha active with endTime null just after midnight, using the prior day\'s Isha start', () => {
      const repository = repositoryWith([DAY_1, DAY_2]);
      const result = getPrayerEngineState(repository, ZONE, slInstant('2026-01-02', 0, 0, 1));
      expect(result.status).toBe('ok');
      if (result.status !== 'ok') return;
      expect(result.state.active).toEqual({ name: 'Isha', startTime: '19:30', endTime: null, hasStarted: true });
      expect(result.state.next.name).toBe('Fajr');
      expect(result.state.secondsUntilActiveEnds).toBeNull();
      expect(result.state.secondsUntilNextStart).toBe(5 * 3600 + 60 - 1);
    });

    it('never lets next.endTime for a Fajr "next" equal Dhuhr — it must be Sunrise', () => {
      const repository = repositoryWith([DAY_1, DAY_2]);
      const result = getPrayerEngineState(repository, ZONE, slInstant('2026-01-01', 20, 0));
      expect(result.status).toBe('ok');
      if (result.status !== 'ok') return;
      expect(result.state.next.name).toBe('Fajr');
      expect(result.state.next.endTime).toBe(DAY_2.sunrise);
      expect(result.state.next.endTime).not.toBe(DAY_2.dhuhr);
    });
  });

  it('transitions into the new day\'s Fajr exactly at its start time', () => {
    const repository = repositoryWith([DAY_1, DAY_2]);
    const result = getPrayerEngineState(repository, ZONE, slInstant('2026-01-02', 5, 1, 0));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.state.active).toEqual({ name: 'Fajr', startTime: '05:01', endTime: '06:01', hasStarted: true });
    expect(result.state.today.date).toBe('2026-01-02');
  });

  it('falls back to today\'s own Isha time when yesterday is not in the dataset', () => {
    const repository = repositoryWith([DAY_1]); // no "2025-12-31"
    const result = getPrayerEngineState(repository, ZONE, slInstant('2026-01-01', 2, 0));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.state.active).toEqual({ name: 'Isha', startTime: '19:30', endTime: null, hasStarted: true });
    expect(result.state.secondsUntilNextStart).toBe(3 * 3600); // 02:00 -> 05:00 Fajr
  });

  it('reports unavailable when tonight\'s Isha needs tomorrow\'s Fajr start and that day is missing', () => {
    const repository = repositoryWith([DAY_1]); // no "2026-01-02"
    const result = getPrayerEngineState(repository, ZONE, slInstant('2026-01-01', 20, 0));
    expect(result.status).toBe('unavailable');
  });

  it('reports unavailable when the requested date itself is not in the dataset', () => {
    const repository = repositoryWith([DAY_1]);
    const result = getPrayerEngineState(repository, ZONE, slInstant('2026-02-01', 12, 0));
    expect(result.status).toBe('unavailable');
  });
});
