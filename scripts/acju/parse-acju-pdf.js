#!/usr/bin/env node

/**
 * Parses ACJU monthly prayer-time PDFs (the "PRAYER TIME <districts> - SRI
 * LANKA, Zone: NN" layout, e.g. 01-COLOMBO-DISTRICT-GAMPAHA-DISTRICT-
 * KALUTARA-DISTRICT-8-Aug.pdf) into normalized JSON.
 *
 * Nothing here is hardcoded from a specific month's times — every value
 * comes from parsing the PDF's own extracted text. The one thing the PDF
 * genuinely does not state anywhere is the calendar YEAR, so that must be
 * passed explicitly (see --year below); the script refuses to guess it.
 *
 * Usage:
 *   node scripts/acju/parse-acju-pdf.js <path-to-pdf> --year 2025 [--out output.json]
 *   node scripts/acju/parse-acju-pdf.js <path-to-pdf> --permanent [--out output.json]
 *
 * Also usable as a library:
 *   const { parseAcjuPdf } = require('./scripts/acju/parse-acju-pdf');
 *   const result = await parseAcjuPdf(buffer, { year: 2025 });
 */

const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

const MONTH_INDEX = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};
const MONTH_NAME = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Column key -> accepted header spellings. LUHR is ACJU's own printed
// spelling for Dhuhr in this document (not an extraction artifact) — DHUHR
// and ZUHR are accepted too in case later months spell it differently.
// ACJU's 2026 permanent-timetable PDFs print two Asr columns, ASR-SHAFIE and
// ASR-HANAFI; `asr` is the Shafi'i time (the same column the older
// single-Asr PDFs printed — verified identical for Aug–Dec), and the Hanafi
// time is kept separately as `asrHanafi`.
const COLUMN_ALIASES = {
  date: ['DATE'],
  fajr: ['FAJR'],
  sunrise: ['SUNRISE'],
  dhuhr: ['LUHR', 'DHUHR', 'ZUHR'],
  asr: ['ASR', 'ASR-SHAFIE', 'ASR-SHAFI'],
  asrHanafi: ['ASR-HANAFI'],
  maghrib: ['MAGRIB', 'MAGHRIB'],
  isha: ['ISHA'],
};
const COLUMN_KEYS = Object.keys(COLUMN_ALIASES);
const REQUIRED_KEYS = COLUMN_KEYS.filter((key) => key !== 'asrHanafi');
// A permanent timetable has no year, so February has 29 rows (used only in leap years).
const PERMANENT_MONTH_LENGTHS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// "1-Aug" — and "Jun-1", which ACJU's 2026 Colombo June PDF uses instead.
const DATE_CELL_PATTERN = /^(?:(\d{1,2})-([A-Za-z]{3})|([A-Za-z]{3})-(\d{1,2}))$/;
const TIME_CELL_PATTERN = /^(\d{1,2}):(\d{2})\s*([AP]M)$/i;

/** "4:43 AM" -> "04:43", "12:18 PM" -> "12:18", "7:44 PM" -> "19:44". */
function convertTo24Hour(value) {
  const match = TIME_CELL_PATTERN.exec(value.trim());
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3].toUpperCase();
  if (period === 'AM') {
    if (hours === 12) hours = 0;
  } else if (hours !== 12) {
    hours += 12;
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function findColumnOrder(headerCells) {
  const order = headerCells.map((cell) => {
    const normalized = cell.trim().toUpperCase();
    return COLUMN_KEYS.find((key) => COLUMN_ALIASES[key].includes(normalized)) ?? null;
  });
  const hasAllColumns = REQUIRED_KEYS.every((key) => order.includes(key)) && !order.includes(null);
  return hasAllColumns ? order : null;
}

/**
 * Locates the day-rows table in the PDF's extracted text and returns raw
 * { day, monthAbbr, times: { fajr, sunrise, dhuhr, asr, maghrib, isha } }
 * entries in 24-hour "HH:MM" form. Throws if no table matching the known
 * column layout can be found — it will not fall back to guessing positions.
 */
function extractRows(rawText) {
  const lines = rawText.split('\n');
  let columnOrder = null;
  let headerLineIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i].split('\t').map((cell) => cell.trim());
    if (cells.length < REQUIRED_KEYS.length) continue;
    const order = findColumnOrder(cells);
    if (order) {
      columnOrder = order;
      headerLineIndex = i;
      break;
    }
  }

  if (!columnOrder) {
    throw new Error(
      `Could not find a header row containing all of: ${REQUIRED_KEYS.join(', ')}. ` +
        'The PDF layout may have changed — inspect the raw extracted text before adjusting this parser.'
    );
  }

  const dateColumn = columnOrder.indexOf('date');
  const rows = [];

  for (let i = headerLineIndex + 1; i < lines.length; i++) {
    const cells = lines[i].split('\t').map((cell) => cell.trim());
    if (cells.length !== columnOrder.length) {
      if (rows.length > 0) break; // table ended
      continue;
    }
    const dateMatch = DATE_CELL_PATTERN.exec(cells[dateColumn]);
    if (!dateMatch) {
      if (rows.length > 0) break;
      continue;
    }

    const times = {};
    let allTimesValid = true;
    columnOrder.forEach((key, columnIndex) => {
      if (key === 'date') return;
      const converted = convertTo24Hour(cells[columnIndex]);
      if (!converted) allTimesValid = false;
      times[key] = converted;
    });
    if (!allTimesValid) {
      throw new Error(`Row for "${cells[dateColumn]}" has a time cell that doesn't match "H:MM AM/PM": ${lines[i]}`);
    }

    rows.push({
      day: Number(dateMatch[1] ?? dateMatch[4]),
      monthAbbr: (dateMatch[2] ?? dateMatch[3]).toLowerCase(),
      times,
    });
  }

  if (rows.length === 0) {
    throw new Error('Found the header row but no day rows followed it — the table may be empty or malformed.');
  }

  return rows;
}

function extractZone(rawText) {
  const match = /Zone:\s*(\S+)/i.exec(rawText);
  return match ? match[1] : null;
}

/** From a line like "PRAYER TIMECOLOMBO DISTRICT, GAMPAHA DISTRICT , KALUTARA DISTRICT - SRI LANKA". */
function extractCoverage(rawText) {
  // Older PDFs: "PRAYER TIME<regions> - SRI LANKA" on one line. ACJU's 2026
  // PDFs often put "<regions> - SRI LANKA" on a line of its own.
  const match =
    /PRAYER TIME[ \t]*(\S.*?)\s*-\s*([A-Z ]+)\s*$/im.exec(rawText) ?? /^[ \t]*([A-Z][A-Z ,().]*?)\s*-\s*(SRI LANKA)\s*$/m.exec(rawText);
  if (!match) return { regions: [], country: null };
  const regions = match[1]
    .split(',')
    .map((region) => region.trim())
    .filter(Boolean);
  return { regions, country: match[2].trim() };
}

/**
 * Cross-checks the parsed rows against what's structurally expected for a
 * real calendar month, so a parsing mistake surfaces immediately instead of
 * silently producing wrong data.
 */
function validateRows(rows, year, permanent = false) {
  const errors = [];
  const warnings = [];

  const monthAbbrs = new Set(rows.map((row) => row.monthAbbr));
  if (monthAbbrs.size !== 1) {
    errors.push(`Rows span more than one month abbreviation: ${[...monthAbbrs].join(', ')}`);
  }
  const monthAbbr = [...monthAbbrs][0];
  const monthIndex = MONTH_INDEX[monthAbbr];
  if (monthIndex === undefined) {
    errors.push(`Unrecognized month abbreviation "${monthAbbr}".`);
    return { errors, warnings, monthIndex: null };
  }

  const expectedDayCount = permanent ? PERMANENT_MONTH_LENGTHS[monthIndex] : new Date(year, monthIndex + 1, 0).getDate();
  if (rows.length !== expectedDayCount) {
    const label = permanent ? `${MONTH_NAME[monthIndex]} (permanent timetable)` : `${MONTH_NAME[monthIndex]} ${year}`;
    errors.push(`Expected ${expectedDayCount} days for ${label}, found ${rows.length}.`);
  }

  rows.forEach((row, index) => {
    const expectedDay = index + 1;
    if (row.day !== expectedDay) {
      errors.push(`Row ${index + 1}: expected day ${expectedDay}, found ${row.day}.`);
    }
    const order = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha']; // asrHanafi checked separately below
    const minutes = order.map((key) => {
      const [h, m] = row.times[key].split(':').map(Number);
      return h * 60 + m;
    });
    for (let i = 1; i < minutes.length; i++) {
      if (minutes[i] <= minutes[i - 1]) {
        warnings.push(
          `Day ${row.day}: ${order[i]} (${row.times[order[i]]}) is not after ${order[i - 1]} (${row.times[order[i - 1]]}).`
        );
      }
    }
    if (row.times.asrHanafi && !(row.times.asr < row.times.asrHanafi && row.times.asrHanafi < row.times.maghrib)) {
      warnings.push(`Day ${row.day}: Hanafi Asr (${row.times.asrHanafi}) is not between Shafi'i Asr and Maghrib.`);
    }
  });

  return { errors, warnings, monthIndex };
}

/**
 * @param {Buffer} pdfBuffer
 * @param {{ year?: number, permanent?: boolean, sourceFile?: string }} options
 *   Exactly one of `year` (a timetable for one calendar year) or `permanent`
 *   (ACJU's year-independent timetable: days keyed "MM-DD", February with
 *   29 rows) — the PDF itself never says which, so the caller must.
 */
async function parseAcjuPdf(pdfBuffer, options) {
  const permanent = options?.permanent === true;
  if (!options || (permanent ? options.year !== undefined : !Number.isInteger(options.year))) {
    throw new Error(
      'Pass exactly one of --year YYYY or --permanent: this PDF does not print a calendar year anywhere, so it cannot be inferred safely.'
    );
  }

  const parser = new PDFParse({ data: pdfBuffer });
  let rawText;
  try {
    const textResult = await parser.getText();
    rawText = textResult.text;
  } finally {
    await parser.destroy();
  }

  const rows = extractRows(rawText);
  const zone = extractZone(rawText);
  const { regions, country } = extractCoverage(rawText);
  const { errors, warnings, monthIndex } = validateRows(rows, options.year, permanent);

  if (errors.length > 0) {
    const message = ['Validation failed:', ...errors.map((error) => `  - ${error}`)].join('\n');
    throw new Error(message);
  }

  const monthDayOf = (row) => `${String(monthIndex + 1).padStart(2, '0')}-${String(row.day).padStart(2, '0')}`;
  const days = rows.map((row) => ({
    ...(permanent ? { monthDay: monthDayOf(row) } : { date: `${options.year}-${monthDayOf(row)}` }),
    fajr: row.times.fajr,
    sunrise: row.times.sunrise,
    dhuhr: row.times.dhuhr,
    asr: row.times.asr,
    ...(row.times.asrHanafi ? { asrHanafi: row.times.asrHanafi } : {}),
    maghrib: row.times.maghrib,
    isha: row.times.isha,
  }));

  return {
    source: {
      file: options.sourceFile ?? null,
      zone,
      regions,
      country,
      month: MONTH_NAME[monthIndex],
      year: permanent ? null : options.year,
      permanent,
      extractedAt: new Date().toISOString(),
    },
    days,
    warnings,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const pdfPathArg = args.find((arg) => !arg.startsWith('--'));
  const yearArg = args.find((arg) => arg.startsWith('--year='))?.split('=')[1] ?? argValueAfterFlag(args, '--year');
  const outArg = args.find((arg) => arg.startsWith('--out='))?.split('=')[1] ?? argValueAfterFlag(args, '--out');
  const permanent = args.includes('--permanent');

  if (!pdfPathArg) {
    console.error('Usage: node scripts/acju/parse-acju-pdf.js <path-to-pdf> (--year YYYY | --permanent) [--out output.json]');
    process.exitCode = 1;
    return;
  }

  const pdfPath = path.resolve(process.cwd(), pdfPathArg);
  const pdfBuffer = fs.readFileSync(pdfPath);

  if (!yearArg && !permanent) {
    const parser = new PDFParse({ data: pdfBuffer });
    const info = await parser.getInfo();
    await parser.destroy();
    console.error('Error: --year (or --permanent) is required — this PDF does not print a calendar year anywhere.');
    if (info.info?.CreationDate) {
      console.error(`Hint: this PDF's own metadata says it was created ${info.info.CreationDate} — verify the intended year before passing --year, do not assume it.`);
    }
    process.exitCode = 1;
    return;
  }

  const result = await parseAcjuPdf(
    pdfBuffer,
    permanent ? { permanent: true, sourceFile: path.basename(pdfPath) } : { year: Number(yearArg), sourceFile: path.basename(pdfPath) }
  );

  const outPath = outArg
    ? path.resolve(process.cwd(), outArg)
    : pdfPath.replace(/\.pdf$/i, '.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');

  console.log(`Parsed ${result.days.length} day(s) for ${result.source.month} ${result.source.permanent ? '(permanent)' : result.source.year}, Zone ${result.source.zone}.`);
  console.log(`Regions: ${result.source.regions.join(', ')} — ${result.source.country}`);
  if (result.warnings.length > 0) {
    console.log(`\n${result.warnings.length} warning(s):`);
    result.warnings.forEach((warning) => console.log(`  - ${warning}`));
  }
  console.log('\nFirst day:', JSON.stringify(result.days[0]));
  console.log('Last day: ', JSON.stringify(result.days[result.days.length - 1]));
  console.log(`\nWrote ${outPath}`);
}

function argValueAfterFlag(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { parseAcjuPdf, convertTo24Hour, extractRows, extractZone, extractCoverage, validateRows };
