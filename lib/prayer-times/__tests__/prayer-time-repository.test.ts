import { LocalPrayerTimeRepository, PermanentPrayerTimeRepository } from '../prayer-time-repository';
import type { DailyPrayerTimes } from '../types';

const SAMPLE_DAY: DailyPrayerTimes = {
  date: '2026-08-01',
  fajr: '04:43',
  sunrise: '06:04',
  dhuhr: '12:18',
  asr: '15:39',
  maghrib: '18:31',
  isha: '19:44',
};

describe('LocalPrayerTimeRepository', () => {
  it('returns the day for a known zone and date', () => {
    const repository = new LocalPrayerTimeRepository([
      { zone: '01', regions: ['COLOMBO DISTRICT'], country: 'SRI LANKA', days: [SAMPLE_DAY] },
    ]);
    expect(repository.getDailyTimes('01', '2026-08-01')).toEqual(SAMPLE_DAY);
  });

  it('returns null for a date outside the dataset', () => {
    const repository = new LocalPrayerTimeRepository([
      { zone: '01', regions: [], country: 'SRI LANKA', days: [SAMPLE_DAY] },
    ]);
    expect(repository.getDailyTimes('01', '2026-08-02')).toBeNull();
  });

  it('returns null for an unknown zone', () => {
    const repository = new LocalPrayerTimeRepository([
      { zone: '01', regions: [], country: 'SRI LANKA', days: [SAMPLE_DAY] },
    ]);
    expect(repository.getDailyTimes('02', '2026-08-01')).toBeNull();
  });

  it('keeps multiple zones independent', () => {
    const zone2Day: DailyPrayerTimes = { ...SAMPLE_DAY, fajr: '04:50' };
    const repository = new LocalPrayerTimeRepository([
      { zone: '01', regions: [], country: 'SRI LANKA', days: [SAMPLE_DAY] },
      { zone: '02', regions: [], country: 'SRI LANKA', days: [zone2Day] },
    ]);
    expect(repository.getDailyTimes('01', '2026-08-01')?.fajr).toBe('04:43');
    expect(repository.getDailyTimes('02', '2026-08-01')?.fajr).toBe('04:50');
  });
});

describe('PermanentPrayerTimeRepository', () => {
  const day = { fajr: '04:43', sunrise: '06:04', dhuhr: '12:18', asr: '15:39', maghrib: '18:31', isha: '19:44' };
  const repository = new PermanentPrayerTimeRepository([
    {
      zone: '01',
      regions: [],
      country: 'SRI LANKA',
      days: [
        { monthDay: '08-01', ...day },
        { monthDay: '02-29', ...day, fajr: '05:07' },
      ],
    },
  ]);

  it('returns the calendar day\'s times for any year, stamped with the requested date', () => {
    expect(repository.getDailyTimes('01', '2026-08-01')).toEqual({ date: '2026-08-01', ...day });
    expect(repository.getDailyTimes('01', '2031-08-01')).toEqual({ date: '2031-08-01', ...day });
  });

  it('serves 29 February when asked for it', () => {
    expect(repository.getDailyTimes('01', '2028-02-29')?.fajr).toBe('05:07');
  });

  it('returns null for an unknown zone, a missing day, or a malformed date', () => {
    expect(repository.getDailyTimes('02', '2026-08-01')).toBeNull();
    expect(repository.getDailyTimes('01', '2026-08-02')).toBeNull();
    expect(repository.getDailyTimes('01', '08-01')).toBeNull();
  });
});
