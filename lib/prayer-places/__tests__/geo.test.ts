import { distanceKm } from '../geo';

describe('distanceKm', () => {
  it('returns 0 for identical coordinates', () => {
    const point = { latitude: 6.9271, longitude: 79.8612 };
    expect(distanceKm(point, point)).toBe(0);
  });

  it('computes the great-circle distance between two known points', () => {
    // Colombo Fort to Colombo Town Hall — roughly 5.4km apart in reality.
    const colomboFort = { latitude: 6.9344, longitude: 79.8428 };
    const townHall = { latitude: 6.9147, longitude: 79.8636 };
    const distance = distanceKm(colomboFort, townHall);
    expect(distance).toBeGreaterThan(2);
    expect(distance).toBeLessThan(4);
  });

  it('is symmetric', () => {
    const a = { latitude: 6.9271, longitude: 79.8612 };
    const b = { latitude: 7.2906, longitude: 80.6337 };
    expect(distanceKm(a, b)).toBeCloseTo(distanceKm(b, a), 10);
  });
});
