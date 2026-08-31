import { LocalPrayerTimeRepository } from '../prayer-time-repository';
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
