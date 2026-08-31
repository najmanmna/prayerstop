#!/usr/bin/env node

/**
 * Merges the per-month ACJU extraction outputs (produced by
 * parse-acju-pdf.js) into one consolidated per-zone dataset consumed by the
 * app's PrayerTimeRepository (lib/prayer-times/). Every date in the merged
 * dataset traces back to a parsed PDF — nothing here is hardcoded.
 *
 * Usage: node scripts/acju/build-zone-dataset.js
 */

const fs = require('fs');
const path = require('path');

const SOURCE_DIR = path.resolve(__dirname, '../../assets/images/prayer-times-acju-pdfs');
const OUTPUT_DIR = path.resolve(__dirname, '../../data/acju');

function main() {
  const files = fs.readdirSync(SOURCE_DIR).filter((file) => file.endsWith('.json'));
  if (files.length === 0) {
    throw new Error(`No extracted JSON files found in ${SOURCE_DIR}.`);
  }

  const byZone = new Map();
  for (const file of files) {
    const parsed = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, file), 'utf8'));
    const zone = parsed.source.zone;
    if (!byZone.has(zone)) {
      byZone.set(zone, {
        zone,
        regions: parsed.source.regions,
        country: parsed.source.country,
        days: [],
      });
    }
    byZone.get(zone).days.push(...parsed.days);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const [zone, dataset] of byZone) {
    dataset.days.sort((a, b) => a.date.localeCompare(b.date));

    const seenDates = new Set();
    const gaps = [];
    let previousDate = null;
    for (const day of dataset.days) {
      if (seenDates.has(day.date)) {
        throw new Error(`Zone ${zone}: duplicate date ${day.date} across source files.`);
      }
      seenDates.add(day.date);
      if (previousDate) {
        const expected = new Date(`${previousDate}T00:00:00Z`);
        expected.setUTCDate(expected.getUTCDate() + 1);
        const expectedIso = expected.toISOString().slice(0, 10);
        if (expectedIso !== day.date) {
          gaps.push(`${previousDate} -> ${day.date}`);
        }
      }
      previousDate = day.date;
    }

    if (gaps.length > 0) {
      throw new Error(`Zone ${zone}: date gap(s) found — ${gaps.join(', ')}. Add the missing month's PDF before building this dataset.`);
    }

    const outPath = path.join(OUTPUT_DIR, `zone-${zone}.json`);
    fs.writeFileSync(outPath, JSON.stringify(dataset, null, 2) + '\n');
    console.log(
      `Wrote ${outPath}: ${dataset.days.length} days, ${dataset.days[0].date} to ${dataset.days[dataset.days.length - 1].date}, no gaps.`
    );
  }
}

main();
