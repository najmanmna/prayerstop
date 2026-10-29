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

/** Extracted JSON files in SOURCE_DIR and its zone-N/ subfolders. */
function listExtractedFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listExtractedFiles(full);
    return entry.name.endsWith('.json') ? [full] : [];
  });
}

/**
 * The zone comes from the official file name ("06-KURUNEGALA-DISTRICT-9-Sep.pdf"
 * -> "06"), NOT from the "Zone: NN" label printed inside the PDF: ACJU's own
 * Kurunegala PDFs for Sep and Nov 2026 print "Zone: 05" (verified: their
 * heading says KURUNEGALA DISTRICT and their times differ from Zone 05's on
 * almost every day). A mismatch is recorded on the dataset, never trusted.
 */
function zoneFromFileName(file) {
  const match = /^(\d{2})-/.exec(path.basename(file));
  if (!match) throw new Error(`Cannot read a zone number from file name: ${file}`);
  return match[1];
}

function main() {
  const files = listExtractedFiles(SOURCE_DIR);
  if (files.length === 0) {
    throw new Error(`No extracted JSON files found in ${SOURCE_DIR}.`);
  }

  const byZone = new Map();
  for (const file of files) {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const zone = zoneFromFileName(file);
    if (!byZone.has(zone)) {
      byZone.set(zone, {
        zone,
        regions: parsed.source.regions,
        country: parsed.source.country,
        notes: [],
        days: [],
      });
    }
    const dataset = byZone.get(zone);
    // Compared with whitespace removed: PDF text extraction sometimes drops
    // spaces ("RATNAPURADISTRICT"), which isn't a different region.
    const squash = (regions) => JSON.stringify(regions.map((region) => region.replace(/\s+/g, '')));
    if (squash(parsed.source.regions) !== squash(dataset.regions)) {
      throw new Error(
        `Zone ${zone}: ${path.basename(file)} covers ${JSON.stringify(parsed.source.regions)}, ` +
          `but other months cover ${JSON.stringify(dataset.regions)}. Check the file is in the right zone.`
      );
    }
    if (parsed.source.zone !== zone) {
      dataset.notes.push(
        `${parsed.source.month} ${parsed.source.year}: PDF prints "Zone: ${parsed.source.zone}"; zone taken from the file name (${zone}).`
      );
    }
    dataset.days.push(...parsed.days);
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

    if (dataset.notes.length === 0) delete dataset.notes;
    const outPath = path.join(OUTPUT_DIR, `zone-${zone}.json`);
    fs.writeFileSync(outPath, JSON.stringify(dataset, null, 2) + '\n');
    console.log(
      `Wrote ${outPath}: ${dataset.days.length} days, ${dataset.days[0].date} to ${dataset.days[dataset.days.length - 1].date}, no gaps.`
    );
  }
}

main();
