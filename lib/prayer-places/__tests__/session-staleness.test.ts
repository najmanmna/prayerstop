import { hasMovedSignificantly, isSessionTimeStale, SESSION_STALE_THRESHOLD_MS, SIGNIFICANT_MOVEMENT_METERS } from '../session-staleness';

describe('isSessionTimeStale', () => {
  const fetchedAt = 1_000_000;

  it('is not stale immediately after fetching', () => {
    expect(isSessionTimeStale(fetchedAt, fetchedAt)).toBe(false);
  });

  it('is not stale just under the threshold', () => {
    expect(isSessionTimeStale(fetchedAt, fetchedAt + SESSION_STALE_THRESHOLD_MS - 1)).toBe(false);
  });

  it('is stale just over the threshold', () => {
    expect(isSessionTimeStale(fetchedAt, fetchedAt + SESSION_STALE_THRESHOLD_MS + 1)).toBe(true);
  });
});

describe('hasMovedSignificantly', () => {
  const origin = { latitude: 6.9271, longitude: 79.8612 };

  it('is false for the exact same coordinates', () => {
    expect(hasMovedSignificantly(origin, origin)).toBe(false);
  });

  it('is false for a tiny GPS-jitter-sized change', () => {
    const jitter = { latitude: origin.latitude + 0.00005, longitude: origin.longitude }; // ~5.5m
    expect(hasMovedSignificantly(origin, jitter)).toBe(false);
  });

  it('is true for a move well beyond the significant-movement threshold', () => {
    const moved = { latitude: origin.latitude + 0.05, longitude: origin.longitude }; // ~5.5km
    expect(hasMovedSignificantly(origin, moved)).toBe(true);
  });

  it('treats the configured threshold as meters, not kilometers', () => {
    expect(SIGNIFICANT_MOVEMENT_METERS).toBeGreaterThan(50);
    expect(SIGNIFICANT_MOVEMENT_METERS).toBeLessThan(5000);
  });
});
