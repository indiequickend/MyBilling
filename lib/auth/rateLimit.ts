/**
 * In-memory sliding-window rate limiter. Deliberately no Redis — this project
 * has no background-job/external-store infrastructure by design (see
 * CLAUDE.md). This means limits reset on deploy/restart and don't share state
 * across horizontally-scaled instances; acceptable for a single-instance
 * self-hosted deployment, called out explicitly rather than silently assumed.
 */

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();
const MAX_TRACKED_KEYS = 10_000;

export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart > windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    sweepIfNeeded(now, windowMs);
    return true;
  }

  if (bucket.count >= limit) return false;

  bucket.count += 1;
  return true;
}

function sweepIfNeeded(now: number, windowMs: number) {
  if (buckets.size <= MAX_TRACKED_KEYS) return;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > windowMs) buckets.delete(key);
  }
}

type HeaderReader = { get(name: string): string | null };

/** Works with both a Route Handler's `Request.headers` and Server Actions' `headers()`. */
export function rateLimitKeyFromHeaders(headerReader: HeaderReader, routeName: string): string {
  const forwardedFor = headerReader.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim() ?? "unknown";
  return `${routeName}:${ip}`;
}
