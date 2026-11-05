/**
 * Fixed-window, in-memory rate limiter for the server-side API routes (they
 * call paid Google APIs, so an unthrottled caller costs real money).
 *
 * Best-effort by design: state lives in one server instance's memory, so
 * separate instances each keep their own counts and a restart resets them.
 * That's enough to stop a runaway client or casual abuse; it is not a hard
 * quota. Google's own per-key quotas remain the real backstop.
 */
export interface RateLimiterOptions {
  /** Requests allowed per client within one window. */
  limit: number;
  windowMs: number;
  /** Clients tracked at once; the oldest windows are dropped past this. */
  maxTrackedClients?: number;
}

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export function createRateLimiter({ limit, windowMs, maxTrackedClients = 5000 }: RateLimiterOptions) {
  const windows = new Map<string, { startedAt: number; count: number }>();

  return function check(clientKey: string, now: number = Date.now()): RateLimitResult {
    const current = windows.get(clientKey);

    if (!current || now - current.startedAt >= windowMs) {
      if (windows.size >= maxTrackedClients) {
        for (const [key, window] of windows) {
          if (now - window.startedAt >= windowMs) windows.delete(key);
        }
        // Still full of live windows: drop the oldest (Map keeps insertion order).
        if (windows.size >= maxTrackedClients) {
          const oldest = windows.keys().next().value;
          if (oldest !== undefined) windows.delete(oldest);
        }
      }
      windows.delete(clientKey);
      windows.set(clientKey, { startedAt: now, count: 1 });
      return { allowed: true };
    }

    if (current.count >= limit) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.startedAt + windowMs - now) / 1000)) };
    }

    current.count += 1;
    return { allowed: true };
  };
}

/**
 * Best available client identifier from proxy headers. Falls back to a single
 * shared key when none is present, which makes the limit global, so a missing
 * header can never become a way around it.
 */
export function getClientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return request.headers.get('cf-connecting-ip')?.trim() || forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** A 429 response for a rejected request, or null when it may proceed. */
export function rateLimitResponse(check: ReturnType<typeof createRateLimiter>, request: Request): Response | null {
  const result = check(getClientKey(request));
  if (result.allowed) return null;
  return Response.json(
    { error: 'Too many requests. Please try again shortly.' },
    { status: 429, headers: { 'Retry-After': String(result.retryAfterSeconds) } }
  );
}
