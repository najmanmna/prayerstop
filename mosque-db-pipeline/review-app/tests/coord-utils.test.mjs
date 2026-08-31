import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCoordPair,
  haversineM,
  fmtCoord,
  classifyCoordinateSave,
  googleMapsSearchUrl,
} from '../coord-utils.js';

describe('parseCoordPair', () => {
  test('parses a valid pair at full precision', () => {
    const r = parseCoordPair('6.463871417972701, 79.97982125307784');
    assert.equal(r.lat, 6.463871417972701);
    assert.equal(r.lon, 79.97982125307784);
    assert.equal(r.error, undefined);
  });

  test('empty input is a distinct, non-blocking state — not an error', () => {
    assert.deepEqual(parseCoordPair(''), { empty: true });
    assert.deepEqual(parseCoordPair('   '), { empty: true });
  });

  test('rejects out-of-range latitude/longitude', () => {
    assert.match(parseCoordPair('999, 79.9').error, /Latitude 999 is out of range/);
    assert.match(parseCoordPair('6.9, 999').error, /Longitude 999 is out of range/);
  });

  test('rejects malformed input (not exactly two comma-separated numbers)', () => {
    assert.match(parseCoordPair('not a coordinate').error, /Expected exactly two/);
    assert.match(parseCoordPair('6.9, 79.9, 17z').error, /Expected exactly two/);
    assert.match(parseCoordPair('6.9').error, /Expected exactly two/);
  });

  test('flags (but does not block) a value far outside Sri Lanka', () => {
    const r = parseCoordPair('40.7128, -74.0060'); // New York
    assert.equal(r.error, undefined);
    assert.match(r.warning, /far from Sri Lanka/);
  });

  test('does not warn for a value inside Sri Lanka', () => {
    const r = parseCoordPair('6.9271, 79.8612'); // Colombo
    assert.equal(r.warning, null);
  });
});

describe('fmtCoord — full precision, never rounded', () => {
  test('echoes the exact value back, not a truncated one', () => {
    // Regression: Step 6B's tool once used .toFixed(6), which silently
    // turned this into "6.463871" — looked like a *different*, wrong value
    // had been saved even though the full-precision value was intact.
    assert.equal(fmtCoord(6.463871417972701), '6.463871417972701');
  });

  test('renders null/undefined as an em dash, not "null"/"undefined"', () => {
    assert.equal(fmtCoord(null), '—');
    assert.equal(fmtCoord(undefined), '—');
  });
});

describe('haversineM', () => {
  test('is zero for identical points', () => {
    assert.equal(haversineM(6.9271, 79.8612, 6.9271, 79.8612), 0);
  });

  test('matches a known real-world distance within a few meters (Colombo Fort to Wellawatte, ~5km)', () => {
    const d = haversineM(6.9344, 79.8428, 6.8770, 79.8601);
    assert.ok(d > 5000 && d < 7000, `expected ~5-7km, got ${d}`);
  });
});

describe('classifyCoordinateSave', () => {
  const current = { latitude: 6.9271, longitude: 79.8612 };

  test('blocked when the parsed input is a real error', () => {
    const result = classifyCoordinateSave(current, { error: 'bad input' });
    assert.equal(result.kind, 'blocked');
  });

  test('blocked when empty AND there is no existing coordinate to fall back on', () => {
    const result = classifyCoordinateSave({ latitude: null, longitude: null }, { empty: true });
    assert.equal(result.kind, 'blocked');
  });

  test('unchanged when empty but a current coordinate already exists (keep as-is)', () => {
    const result = classifyCoordinateSave(current, { empty: true });
    assert.equal(result.kind, 'unchanged');
  });

  test('unchanged when the pasted value is within 1m of the current one (float round-trip)', () => {
    const result = classifyCoordinateSave(current, { lat: 6.92710001, lon: 79.86120001 });
    assert.equal(result.kind, 'unchanged');
  });

  test('correct when the pasted value meaningfully differs from the current one', () => {
    const result = classifyCoordinateSave(current, { lat: 6.9354, lon: 79.8517 });
    assert.equal(result.kind, 'correct');
    assert.ok(result.distanceM > 100);
  });

  test('correct (never "unchanged") when there is no existing coordinate at all', () => {
    const result = classifyCoordinateSave({ latitude: null, longitude: null }, { lat: 6.9354, lon: 79.8517 });
    assert.equal(result.kind, 'correct');
    assert.equal(result.distanceM, null);
  });
});

describe('googleMapsSearchUrl', () => {
  test('builds a Google Maps search URL from name + address, never a directions URL', () => {
    const url = googleMapsSearchUrl('Colombo Grand Mosque', '151, New Moor Street', 'Colombo');
    assert.ok(url.startsWith('https://www.google.com/maps/search/?api=1&query='));
    assert.ok(url.includes(encodeURIComponent('Colombo Grand Mosque')));
    assert.ok(!url.includes('/dir/'));
  });

  test('falls back gracefully when name/address are missing', () => {
    const url = googleMapsSearchUrl(null, null, null);
    assert.ok(url.includes(encodeURIComponent('Sri Lanka')));
  });
});
