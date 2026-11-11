/**
 * In-memory circuit breaker for a Google API's own daily quota being
 * exhausted (not our own rate limiter — see rate-limit.ts for that).
 *
 * Without this, every request keeps paying full latency for a doomed call
 * to Google and logging its own "request failed" line, for the rest of the
 * day once the daily cap is hit. With it, the first quota-exceeded response
 * opens the breaker; further calls short-circuit straight to the existing
 * local/degraded fallback (see find-nearby-places.ts and route-matrix+api.ts)
 * without touching the network, until the cooldown elapses.
 *
 * Deliberately self-healing rather than quota-aware: it has no idea when
 * Google's own daily quota actually resets (midnight Pacific), so it just
 * retries after `cooldownMs`. If the cap is still exhausted, that one
 * retry reopens the breaker for another cooldown window; if the cap has
 * reset (or it was a transient burst, not a real daily exhaustion), Google
 * starts answering again immediately. Best-effort and per-process, exactly
 * like rate-limit.ts: a restart or a second server instance starts fresh.
 */
export interface QuotaBreakerOptions {
  /** How long to skip real requests after a quota-exceeded response. */
  cooldownMs: number;
}

export function createQuotaBreaker({ cooldownMs }: QuotaBreakerOptions) {
  let cooldownUntil = 0;

  return {
    /** True while a previous quota-exceeded response is still being honoured. */
    isInCooldown(now: number = Date.now()): boolean {
      return now < cooldownUntil;
    },
    /** Call once a response is confirmed to be a quota-exceeded error. */
    recordExceeded(now: number = Date.now()): void {
      cooldownUntil = now + cooldownMs;
    },
    /** Milliseconds left in the current cooldown, 0 if none is active. */
    remainingMs(now: number = Date.now()): number {
      return Math.max(0, cooldownUntil - now);
    },
  };
}

/**
 * Whether a failed Google API response indicates its OWN quota/rate limit
 * was exhausted, as opposed to an outage or a malformed request. Checked
 * against the HTTP status and the raw response body, since Google reports
 * this consistently as HTTP 429 or a structured `RESOURCE_EXHAUSTED` /
 * `RATE_LIMIT_EXCEEDED` status even when the outer HTTP status varies.
 */
export function isQuotaExceededResponse(httpStatus: number, bodyText: string): boolean {
  if (httpStatus === 429) return true;
  return /RESOURCE_EXHAUSTED|RATE_LIMIT_EXCEEDED/i.test(bodyText);
}

/** Shared cooldown for both Google breakers — see the module comment for why a fixed window, not a quota-aware one. */
export const GOOGLE_QUOTA_COOLDOWN_MS = 15 * 60 * 1000;
