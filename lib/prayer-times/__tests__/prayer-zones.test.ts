import { ACJU_ZONE_REGIONS, acjuPrayerTimeRepository } from '../acju-repository';
import { decidePrayerZone, DISTRICT_ZONES, prayerZoneUnavailableReason, resolvePrayerZone } from '../prayer-zones';

describe('resolvePrayerZone — real towns in every ACJU zone', () => {
  it.each([
    ['Colombo Fort', 6.9344, 79.8428, 'Colombo', '01'],
    ['Wattala', 6.989, 79.892, 'Gampaha', '01'],
    ['Kalutara', 6.5854, 79.9607, 'Kalutara', '01'],
    ['Jaffna', 9.6615, 80.0255, 'Jaffna', '02'],
    ['Kilinochchi', 9.3803, 80.377, 'Kilinochchi', '03'],
    ['Vavuniya', 8.7514, 80.4971, 'Vavuniya', '03'],
    ['Mannar', 8.981, 79.9044, 'Mannar', '04'],
    ['Puttalam', 8.0362, 79.8283, 'Puttalam', '04'],
    ['Anuradhapura', 8.3114, 80.4037, 'Anuradhapura', '05'],
    ['Polonnaruwa', 7.9403, 81.0188, 'Polonnaruwa', '05'],
    ['Kurunegala', 7.4863, 80.3623, 'Kurunegala', '06'],
    ['Kandy', 7.2906, 80.6337, 'Kandy', '07'],
    ['Nuwara Eliya', 6.9497, 80.7891, 'Nuwara Eliya', '07'],
    ['Kattankudy', 7.675, 81.73, 'Batticaloa', '08'],
    ['Ampara', 7.2975, 81.682, 'Ampara', '08'],
    ['Trincomalee', 8.5874, 81.2152, 'Trincomalee', '09'],
    ['Badulla', 6.9934, 81.055, 'Badulla', '10'],
    ['Monaragala', 6.8728, 81.3507, 'Moneragala', '10'],
    ['Ratnapura', 6.6828, 80.3992, 'Ratnapura', '11'],
    ['Kegalle', 7.2513, 80.3464, 'Kegalle', '11'],
    ['Galle', 6.0329, 80.2168, 'Galle', '12'],
    ['Matara', 5.9549, 80.555, 'Matara', '12'],
    ['Hambantota', 6.1241, 81.1185, 'Hambantota', '13'],
  ])('%s → %s district, Zone %s', (_name, latitude, longitude, district, zoneId) => {
    expect(resolvePrayerZone({ latitude, longitude })).toEqual({ status: 'ok', zoneId, district });
  });

  it('places a point just offshore (past the simplified coastline) in the nearest district', () => {
    expect(resolvePrayerZone({ latitude: 6.9271, longitude: 79.835 })).toEqual({
      status: 'ok',
      zoneId: '01',
      district: 'Colombo',
    });
  });

  it.each([
    ['Chennai', 13.0827, 80.2707],
    ['Malé', 4.1755, 73.5093],
    ['50 km off the west coast', 7.0, 79.3],
  ])('treats %s as outside Sri Lanka, never as a default zone', (_name, latitude, longitude) => {
    expect(resolvePrayerZone({ latitude, longitude })).toEqual({ status: 'outside' });
  });
});

describe('zone data coverage', () => {
  it('maps every district to a zone that has a bundled ACJU timetable, and every zone to at least one district', () => {
    const zonesWithData = new Set(Object.keys(ACJU_ZONE_REGIONS));
    expect(zonesWithData.size).toBe(13);
    expect(Object.keys(DISTRICT_ZONES)).toHaveLength(25);
    for (const zoneId of Object.values(DISTRICT_ZONES)) expect(zonesWithData.has(zoneId)).toBe(true);
    expect(new Set(Object.values(DISTRICT_ZONES))).toEqual(zonesWithData);
  });

  it.each(Object.keys(ACJU_ZONE_REGIONS))('Zone %s has every day of a leap year (2028), in prayer order', (zoneId) => {
    const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    for (let date = new Date(Date.UTC(2028, 0, 1)); date <= new Date(Date.UTC(2028, 11, 31)); date.setUTCDate(date.getUTCDate() + 1)) {
      const day = acjuPrayerTimeRepository.getDailyTimes(zoneId, date.toISOString().slice(0, 10));
      expect(day).not.toBeNull();
      const order = [day!.fajr, day!.sunrise, day!.dhuhr, day!.asr, day!.maghrib, day!.isha].map(toMinutes);
      for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]);
    }
  });

  it('keeps each zone its own data (zones differ, so a wrong zone would show wrong times)', () => {
    const fajrOn = (zoneId: string) => acjuPrayerTimeRepository.getDailyTimes(zoneId, '2026-11-01')!.fajr;
    expect(new Set(Object.keys(ACJU_ZONE_REGIONS).map(fajrOn)).size).toBeGreaterThan(1);
  });
});

describe('decidePrayerZone', () => {
  const kandy = { latitude: 7.2906, longitude: 80.6337 };

  it('uses the current location when there is a fix', () => {
    expect(
      decidePrayerZone({ deviceStatus: 'granted', coords: kandy, stored: { zoneId: '01', district: 'Colombo' }, storageLoaded: true })
    ).toEqual({ status: 'ok', zoneId: '07', district: 'Kandy', basis: 'current-location' });
  });

  it('uses the last known zone while still locating', () => {
    expect(
      decidePrayerZone({ deviceStatus: 'requesting', coords: null, stored: { zoneId: '07', district: 'Kandy' }, storageLoaded: true })
    ).toEqual({ status: 'ok', zoneId: '07', district: 'Kandy', basis: 'last-known-location' });
  });

  it('uses the last known zone when location is denied', () => {
    expect(
      decidePrayerZone({ deviceStatus: 'denied', coords: null, stored: { zoneId: '07', district: 'Kandy' }, storageLoaded: true })
    ).toMatchObject({ status: 'ok', basis: 'last-known-location' });
  });

  it('is still resolving on first launch, before storage has been read or while locating', () => {
    expect(decidePrayerZone({ deviceStatus: 'denied', coords: null, stored: null, storageLoaded: false })).toEqual({ status: 'resolving' });
    expect(decidePrayerZone({ deviceStatus: 'requesting', coords: null, stored: null, storageLoaded: true })).toEqual({ status: 'resolving' });
  });

  it('needs location when there is no fix and nothing remembered — never a default zone', () => {
    expect(decidePrayerZone({ deviceStatus: 'denied', coords: null, stored: null, storageLoaded: true })).toEqual({
      status: 'needs-location',
    });
    expect(decidePrayerZone({ deviceStatus: 'error', coords: null, stored: null, storageLoaded: true })).toEqual({
      status: 'needs-location',
    });
  });

  it('says outside Sri Lanka for a fix abroad, ignoring the remembered zone', () => {
    expect(
      decidePrayerZone({
        deviceStatus: 'granted',
        coords: { latitude: 13.0827, longitude: 80.2707 },
        stored: { zoneId: '01', district: 'Colombo' },
        storageLoaded: true,
      })
    ).toEqual({ status: 'outside' });
  });

  it('ignores a corrupt remembered zone that does not match its district', () => {
    expect(
      decidePrayerZone({ deviceStatus: 'denied', coords: null, stored: { zoneId: '99', district: 'Kandy' }, storageLoaded: true })
    ).toEqual({ status: 'needs-location' });
  });

  it('explains every unavailable state factually', () => {
    expect(prayerZoneUnavailableReason({ status: 'outside' })).toMatch(/Sri Lanka only/);
    expect(prayerZoneUnavailableReason({ status: 'needs-location' })).toMatch(/Allow location access/);
    expect(prayerZoneUnavailableReason({ status: 'resolving' })).toMatch(/Finding your location/);
  });
});
