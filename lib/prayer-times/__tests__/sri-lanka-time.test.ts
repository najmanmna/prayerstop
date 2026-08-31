import { addDaysToIsoDate, sriLankaWallClockToInstant, toSriLankaClock } from '../sri-lanka-time';

describe('toSriLankaClock', () => {
  it('converts a UTC instant to Sri Lanka wall-clock date and time', () => {
    // 2026-08-15 06:30:00 UTC == 2026-08-15 12:00:00 in UTC+5:30.
    const result = toSriLankaClock(new Date('2026-08-15T06:30:00.000Z'));
    expect(result.isoDate).toBe('2026-08-15');
    expect(result.secondsSinceMidnight).toBe(12 * 3600);
  });

  it('rolls the Sri Lanka date forward past UTC midnight', () => {
    // 2026-08-15 19:00:00 UTC == 2026-08-16 00:30:00 in UTC+5:30 — a
    // different calendar day in Sri Lanka than in UTC.
    const result = toSriLankaClock(new Date('2026-08-15T19:00:00.000Z'));
    expect(result.isoDate).toBe('2026-08-16');
    expect(result.secondsSinceMidnight).toBe(30 * 60);
  });

  it('is independent of the device/runtime timezone', () => {
    const instant = new Date('2026-08-15T06:30:00.000Z');
    const originalTz = process.env.TZ;
    try {
      process.env.TZ = 'America/Los_Angeles';
      const result = toSriLankaClock(instant);
      expect(result.isoDate).toBe('2026-08-15');
      expect(result.secondsSinceMidnight).toBe(12 * 3600);
    } finally {
      process.env.TZ = originalTz;
    }
  });
});

describe('addDaysToIsoDate', () => {
  it('adds days within the same month', () => {
    expect(addDaysToIsoDate('2026-08-15', 1)).toBe('2026-08-16');
  });

  it('subtracts a day across a month boundary', () => {
    expect(addDaysToIsoDate('2026-09-01', -1)).toBe('2026-08-31');
  });

  it('rolls forward across a month boundary', () => {
    expect(addDaysToIsoDate('2026-08-31', 1)).toBe('2026-09-01');
  });

  it('rolls forward across a year boundary', () => {
    expect(addDaysToIsoDate('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('sriLankaWallClockToInstant', () => {
  it('is the exact inverse of toSriLankaClock', () => {
    const instant = new Date('2026-08-15T06:30:00.000Z');
    const clock = toSriLankaClock(instant);
    const hhmm = `${String(Math.floor(clock.secondsSinceMidnight / 3600)).padStart(2, '0')}:${String(
      Math.floor((clock.secondsSinceMidnight % 3600) / 60)
    ).padStart(2, '0')}`;

    expect(sriLankaWallClockToInstant(clock.isoDate, hhmm)).toEqual(instant);
  });

  it('converts a Sri Lanka wall-clock time to the correct UTC instant', () => {
    // 2026-08-15 05:00 in UTC+5:30 == 2026-08-14 23:30:00 UTC.
    const instant = sriLankaWallClockToInstant('2026-08-15', '05:00');
    expect(instant.toISOString()).toBe('2026-08-14T23:30:00.000Z');
  });

  it('is independent of the device/runtime timezone', () => {
    const originalTz = process.env.TZ;
    try {
      process.env.TZ = 'America/Los_Angeles';
      const instant = sriLankaWallClockToInstant('2026-08-15', '05:00');
      expect(instant.toISOString()).toBe('2026-08-14T23:30:00.000Z');
    } finally {
      process.env.TZ = originalTz;
    }
  });
});
