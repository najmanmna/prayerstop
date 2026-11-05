import { createRateLimiter, getClientKey, rateLimitResponse } from '../rate-limit';

describe('createRateLimiter', () => {
  it('allows up to the limit, then rejects with a retry time', () => {
    const check = createRateLimiter({ limit: 2, windowMs: 60_000 });
    expect(check('a', 0)).toEqual({ allowed: true });
    expect(check('a', 1000)).toEqual({ allowed: true });
    expect(check('a', 20_000)).toEqual({ allowed: false, retryAfterSeconds: 40 });
  });

  it('counts each client separately', () => {
    const check = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(check('a', 0).allowed).toBe(true);
    expect(check('b', 0).allowed).toBe(true);
    expect(check('a', 1).allowed).toBe(false);
  });

  it('starts a fresh window once the old one expires', () => {
    const check = createRateLimiter({ limit: 1, windowMs: 60_000 });
    check('a', 0);
    expect(check('a', 59_999).allowed).toBe(false);
    expect(check('a', 60_000).allowed).toBe(true);
  });

  it('bounds memory by evicting the oldest client when full', () => {
    const check = createRateLimiter({ limit: 1, windowMs: 60_000, maxTrackedClients: 2 });
    check('a', 0);
    check('b', 1);
    check('c', 2); // evicts "a"
    expect(check('a', 3).allowed).toBe(true); // forgotten, so allowed again
    expect(check('c', 4).allowed).toBe(false); // still tracked
  });
});

describe('getClientKey', () => {
  const requestWith = (headers: Record<string, string>) => new Request('https://x.test/api', { headers });

  it('prefers cf-connecting-ip, then the first x-forwarded-for hop, then x-real-ip', () => {
    expect(getClientKey(requestWith({ 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' }))).toBe('1.1.1.1');
    expect(getClientKey(requestWith({ 'x-forwarded-for': '2.2.2.2, 3.3.3.3' }))).toBe('2.2.2.2');
    expect(getClientKey(requestWith({ 'x-real-ip': '4.4.4.4' }))).toBe('4.4.4.4');
  });

  it('falls back to one shared key so a missing header cannot bypass the limit', () => {
    expect(getClientKey(requestWith({}))).toBe('unknown');
  });
});

describe('rateLimitResponse', () => {
  it('returns null while allowed, then a 429 with Retry-After', async () => {
    const check = createRateLimiter({ limit: 1, windowMs: 60_000 });
    const request = new Request('https://x.test/api', { headers: { 'x-real-ip': '9.9.9.9' } });
    expect(rateLimitResponse(check, request)).toBeNull();
    const blocked = rateLimitResponse(check, request);
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get('Retry-After')).toMatch(/^\d+$/);
    expect(await blocked?.json()).toEqual({ error: 'Too many requests. Please try again shortly.' });
  });
});
