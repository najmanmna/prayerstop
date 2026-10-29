import zone01 from '@/data/acju/zone-01.json';
import zone02 from '@/data/acju/zone-02.json';
import zone03 from '@/data/acju/zone-03.json';
import zone04 from '@/data/acju/zone-04.json';
import zone05 from '@/data/acju/zone-05.json';
import zone06 from '@/data/acju/zone-06.json';
import zone07 from '@/data/acju/zone-07.json';
import zone08 from '@/data/acju/zone-08.json';
import zone09 from '@/data/acju/zone-09.json';
import zone10 from '@/data/acju/zone-10.json';
import zone11 from '@/data/acju/zone-11.json';
import zone12 from '@/data/acju/zone-12.json';
import zone13 from '@/data/acju/zone-13.json';

import { LocalPrayerTimeRepository, type PrayerTimeRepository } from './prayer-time-repository';

const ZONE_DATASETS = [zone01, zone02, zone03, zone04, zone05, zone06, zone07, zone08, zone09, zone10, zone11, zone12, zone13];

/**
 * The only module that knows PrayerStop's ACJU data is the bundled
 * data/acju/zone-NN.json files (all 13 ACJU zones, built by
 * scripts/acju/build-zone-dataset.js). The engine and UI never import this
 * file's data directly — they depend on `PrayerTimeRepository` and a zone
 * ID resolved from the user's location (`prayer-zones.ts`). There is
 * deliberately no default zone: a location we can't place gets no times
 * rather than another zone's.
 */
export const acjuPrayerTimeRepository: PrayerTimeRepository = new LocalPrayerTimeRepository(ZONE_DATASETS);

/** The regions each zone covers, as ACJU prints them — for display (e.g. "Kandy, Matale, Nuwara Eliya"). */
export const ACJU_ZONE_REGIONS: Record<string, string[]> = Object.fromEntries(
  ZONE_DATASETS.map((dataset) => [dataset.zone, dataset.regions])
);
