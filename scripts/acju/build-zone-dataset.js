#!/usr/bin/env node

/**
 * Merges the per-month ACJU extraction outputs (produced by
 * `parse-acju-pdf.js --permanent`) into one consolidated per-zone dataset
 * consumed by the app's PrayerTimeRepository (lib/prayer-times/). Every day
 * in the merged dataset traces back to a parsed PDF — nothing here is
 * hardcoded.
 *
 * ACJU's timetable is permanent — the same times every year, keyed by
 * calendar day, with a 29 February row for leap years. Verified 2026-10-29:
 * ACJU's July-2025 and October-2026 uploads are identical on every
 * overlapping day, no PDF prints a year, and February has 29 rows; real
 * sunrise/noon/sunset for the same date differ by under 20 seconds between
 * years, well inside ACJU's whole-minute rounding. So datasets are keyed by
 * "MM-DD" (366 per zone), not by full date.
 *
 * Source PDFs + extractions: assets/images/prayer-times-acju-pdfs/permanent/
 * zone-NN/NN-MM.pdf, with each file's ACJU URL in sources.json there.
 *
 * Usage: node scripts/acju/build-zone-dataset.js
 */

const fs = require('fs');
const path = require('path');

const SOURCE_DIR = path.resolve(__dirname, '../../assets/images/prayer-times-acju-pdfs/permanent');
const OUTPUT_DIR = path.resolve(__dirname, '../../data/acju');
const MONTH_LENGTHS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Every "MM-DD" in a permanent timetable, 01-01 .. 12-31 including 02-29. */
function allMonthDays() {
  return MONTH_LENGTHS.flatMap((length, monthIndex) =>
    Array.from({ length }, (_, dayIndex) => `${String(monthIndex + 1).padStart(2, '0')}-${String(dayIndex + 1).padStart(2, '0')}`)
  );
}

/** Extracted JSON files in the zone-NN/ subfolders of SOURCE_DIR. */
function listExtractedFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listExtractedFiles(full);
    return /^\d{2}-\d{2}\.json$/.test(entry.name) ? [full] : [];
  });
}

/**
 * The zone comes from the file name ("06-09.json" -> "06"), NOT from the
 * "Zone: NN" label printed inside the PDF: ACJU's earlier Kurunegala PDFs
 * misprinted "Zone: 05", and acju.lk's October-2026 "Mullaitivu" downloads
 * actually contain Colombo's Zone 01 timetable (see sources.json `_notes`).
 * A mismatch is recorded on the dataset, never trusted.
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
    if (!parsed.source.permanent) {
      throw new Error(`${path.basename(file)} was not parsed with --permanent.`);
    }
    const zone = zoneFromFileName(file);
    if (!byZone.has(zone)) {
      byZone.set(zone, {
        zone,
        regions: parsed.source.regions,
        country: parsed.source.country,
        calendar: 'permanent',
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
      dataset.notes.push(`${parsed.source.month}: PDF prints "Zone: ${parsed.source.zone}"; zone taken from the file name (${zone}).`);
    }
    dataset.days.push(...parsed.days);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const expected = allMonthDays();

  for (const [zone, dataset] of [...byZone].sort(([a], [b]) => a.localeCompare(b))) {
    dataset.days.sort((a, b) => a.monthDay.localeCompare(b.monthDay));
    const actual = dataset.days.map((day) => day.monthDay);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      const missing = expected.filter((monthDay) => !actual.includes(monthDay));
      const extra = actual.filter((monthDay, index) => !expected.includes(monthDay) || actual.indexOf(monthDay) !== index);
      throw new Error(`Zone ${zone}: expected every day 01-01..12-31 once — missing ${missing.join(', ') || 'none'}, unexpected/duplicate ${extra.join(', ') || 'none'}.`);
    }
    if (dataset.notes.length === 0) delete dataset.notes;

    const outPath = path.join(OUTPUT_DIR, `zone-${zone}.json`);
    fs.writeFileSync(outPath, JSON.stringify(dataset, null, 2) + '\n');
    console.log(`Wrote ${outPath}: ${dataset.days.length} days (permanent, 01-01 to 12-31 incl. 02-29).`);
  }
}

main();
