// A small, process-local backstop for self-hosting. Use a shared rate limiter
// at the reverse proxy for public or multi-instance deployments.
export function createRateLimiter({ limit = 10, windowMs = 15 * 60 * 1000, clock = Date.now } = {}) {
  const buckets = new Map();
  return {
    consume(key) {
      const now = clock();
      if (buckets.size > 1000) {
        for (const [address, bucket] of buckets) {
          if (now >= bucket.resetAt) buckets.delete(address);
        }
      }
      let bucket = buckets.get(key);
      if (!bucket || now >= bucket.resetAt) {
        if (!bucket && buckets.size >= 10_000) return { allowed: false, retryAfter: Math.ceil(windowMs / 1000) };
        bucket = { count: 0, resetAt: now + windowMs };
        buckets.set(key, bucket);
      }
      if (bucket.count >= limit) return { allowed: false, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
      bucket.count += 1;
      return { allowed: true, retryAfter: 0 };
    },
  };
}
