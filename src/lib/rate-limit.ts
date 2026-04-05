/**
 * In-memory rate limiter — sliding window counter per key (typically IP).
 *
 * Simple and dependency-free. Works for single-instance deployments (Railway).
 * For multi-instance / horizontal scale, replace with Upstash Redis.
 *
 * Memory: expired entries are cleaned lazily on each check for the same key.
 * The store is bounded by active unique keys × entry size (~100 bytes each).
 */

interface Entry {
  count: number;
  resetAt: number; // epoch ms
}

const store = new Map<string, Entry>();

export interface RateLimitResult {
  limited: boolean;
  /** Remaining requests in this window (0 when limited). */
  remaining: number;
  /** Seconds until the window resets (only meaningful when limited). */
  retryAfter: number;
}

export interface RateLimitOptions {
  /** Unique key — typically a composite of route + IP. */
  key: string;
  /** Maximum requests allowed per window. */
  limit: number;
  /** Window duration in milliseconds. */
  windowMs: number;
}

export function rateLimit(opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  let entry = store.get(opts.key);

  // Expired entry — reset
  if (!entry || now >= entry.resetAt) {
    entry = { count: 1, resetAt: now + opts.windowMs };
    store.set(opts.key, entry);
    return { limited: false, remaining: opts.limit - 1, retryAfter: 0 };
  }

  if (entry.count >= opts.limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { limited: true, remaining: 0, retryAfter };
  }

  entry.count++;
  return {
    limited: false,
    remaining: opts.limit - entry.count,
    retryAfter: 0,
  };
}

/**
 * Extract the client IP from a request, respecting Railway / Vercel proxy headers.
 * Falls back to a safe placeholder when no IP is resolvable.
 */
export function getClientIp(req: Request | { headers: Headers }): string {
  const h = req.headers as Headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Build a per-route rate-limit response (429 Too Many Requests).
 */
export function rateLimitResponse(retryAfter: number): Response {
  return new Response(
    JSON.stringify({ success: false, error: "Too many requests" }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
      },
    }
  );
}
