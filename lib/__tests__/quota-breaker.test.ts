import { createQuotaBreaker, isQuotaExceededResponse } from '../quota-breaker';

describe('isQuotaExceededResponse', () => {
  it('treats HTTP 429 as quota exceeded regardless of body', () => {
    expect(isQuotaExceededResponse(429, '')).toBe(true);
    expect(isQuotaExceededResponse(429, 'anything')).toBe(true);
  });

  it('treats a RESOURCE_EXHAUSTED status in the body as quota exceeded, even under a different HTTP status', () => {
    expect(isQuotaExceededResponse(403, '{"error":{"status":"RESOURCE_EXHAUSTED","message":"Quota exceeded"}}')).toBe(true);
  });

  it('treats a RATE_LIMIT_EXCEEDED status in the body as quota exceeded', () => {
    expect(isQuotaExceededResponse(400, '{"error":{"status":"RATE_LIMIT_EXCEEDED"}}')).toBe(true);
  });

  it('does not treat an unrelated error as quota exceeded', () => {
    expect(isQuotaExceededResponse(403, '{"error":{"status":"PERMISSION_DENIED"}}')).toBe(false);
    expect(isQuotaExceededResponse(500, 'internal error')).toBe(false);
  });
});

describe('createQuotaBreaker', () => {
  it('starts closed (not in cooldown)', () => {
    const breaker = createQuotaBreaker({ cooldownMs: 60_000 });
    expect(breaker.isInCooldown(1_000)).toBe(false);
    expect(breaker.remainingMs(1_000)).toBe(0);
  });

  it('opens for exactly cooldownMs after recordExceeded', () => {
    const breaker = createQuotaBreaker({ cooldownMs: 60_000 });
    breaker.recordExceeded(1_000);

    expect(breaker.isInCooldown(1_000)).toBe(true);
    expect(breaker.isInCooldown(60_999)).toBe(true);
    expect(breaker.remainingMs(1_000)).toBe(60_000);
    expect(breaker.remainingMs(31_000)).toBe(30_000);
  });

  it('self-heals once the cooldown elapses, with no knowledge of Google needed', () => {
    const breaker = createQuotaBreaker({ cooldownMs: 60_000 });
    breaker.recordExceeded(1_000);

    expect(breaker.isInCooldown(61_000)).toBe(false);
    expect(breaker.remainingMs(61_000)).toBe(0);
  });

  it('a later recordExceeded call extends the cooldown from its own call time', () => {
    const breaker = createQuotaBreaker({ cooldownMs: 60_000 });
    breaker.recordExceeded(1_000); // open until 61_000
    breaker.recordExceeded(50_000); // re-opened until 110_000

    expect(breaker.isInCooldown(61_000)).toBe(true);
    expect(breaker.remainingMs(50_000)).toBe(60_000);
  });
});
