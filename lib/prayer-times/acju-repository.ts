import zone01 from '@/data/acju/zone-01.json';

import { LocalPrayerTimeRepository, type PrayerTimeRepository } from './prayer-time-repository';

/**
 * The only module that knows PrayerStop's ACJU data is currently a single
 * bundled zone-01.json. The engine and UI never import this file directly —
 * they depend on `PrayerTimeRepository` and `DEFAULT_ZONE_ID` only, so
 * adding Zone 02/03/etc. later is just adding another entry here.
 */
export const acjuPrayerTimeRepository: PrayerTimeRepository = new LocalPrayerTimeRepository([zone01]);

export const DEFAULT_ZONE_ID = zone01.zone;
