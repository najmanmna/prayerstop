import { isLocationStale, LOCATION_STALE_THRESHOLD_MS, resolveLocationNotice } from '../location-freshness';

describe('isLocationStale', () => {
  const timestamp = 1_000_000;

  it('is not stale immediately after the fix', () => {
    expect(isLocationStale(timestamp, timestamp)).toBe(false);
  });

  it('is not stale just under the threshold', () => {
    expect(isLocationStale(timestamp, timestamp + LOCATION_STALE_THRESHOLD_MS - 1)).toBe(false);
  });

  it('is stale just over the threshold', () => {
    expect(isLocationStale(timestamp, timestamp + LOCATION_STALE_THRESHOLD_MS + 1)).toBe(true);
  });
});

describe('resolveLocationNotice', () => {
  it('shows nothing when every signal is clean — no stray banner on an otherwise-fine Home screen', () => {
    expect(resolveLocationNotice({ refreshError: null, locationStale: false, sessionStale: false })).toBeNull();
  });

  it('prioritizes a failed refresh over everything else — it is the most actionable/urgent signal', () => {
    const notice = resolveLocationNotice({
      refreshError: 'Getting your location is taking longer than expected.',
      locationStale: true,
      sessionStale: true,
    });
    expect(notice?.kind).toBe('refresh-error');
    expect(notice?.message).toMatch(/retry/i);
  });

  it('falls back to an old GPS fix when there is no refresh error', () => {
    const notice = resolveLocationNotice({ refreshError: null, locationStale: true, sessionStale: true });
    expect(notice?.kind).toBe('location-stale');
    expect(notice?.message).toMatch(/refresh/i);
  });

  it('falls back to an old fetched session only when nothing else applies', () => {
    const notice = resolveLocationNotice({ refreshError: null, locationStale: false, sessionStale: true });
    expect(notice?.kind).toBe('session-stale');
    expect(notice?.message).toMatch(/refresh/i);
  });

  it('never mentions a separate screen — the whole point is a single compact, self-sufficient control', () => {
    const notice = resolveLocationNotice({ refreshError: null, locationStale: false, sessionStale: true });
    expect(notice?.message.toLowerCase()).not.toContain('nearby');
    expect(notice?.message.toLowerCase()).not.toContain('pull to refresh on');
  });
});
