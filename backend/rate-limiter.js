/**
 * Rate Limiter Engine
 * Supports Cloudflare KV distributed rate limiting and in-memory bucket fallback for Express.
 */

const buckets = new Map();
const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 30;

// Cloudflare KV distributed rate limit check
async function isRateLimited(clientKey = "anon", limit = DEFAULT_LIMIT, env = {}) {
  const now = Date.now();
  const currentMinute = Math.floor(now / 60000);
  const kvKey = `rate:${clientKey}:${currentMinute}`;

  if (env.KV && typeof env.KV.get === "function") {
    try {
      const current = await env.KV.get(kvKey);
      const count = (parseInt(current, 10) || 0) + 1;
      await env.KV.put(kvKey, String(count), { expirationTtl: 120 });
      return count > limit;
    } catch (e) {
      console.warn("KV rate limit check error, falling back to memory:", e.message);
    }
  }

  // In-memory bucket fallback
  const existing = buckets.get(clientKey);
  const bucket = !existing || now - existing.startedAt >= WINDOW_MS
    ? { startedAt: now, count: 0 }
    : existing;

  bucket.count += 1;
  buckets.set(clientKey, bucket);

  return bucket.count > limit;
}

// Express middleware
function rateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const limit = Number(process.env.RATE_LIMIT_PER_MINUTE || DEFAULT_LIMIT);
  const now = Date.now();

  const existing = buckets.get(ip);
  const bucket = !existing || now - existing.startedAt >= WINDOW_MS
    ? { startedAt: now, count: 0 }
    : existing;

  bucket.count += 1;
  buckets.set(ip, bucket);

  if (bucket.count > limit) {
    return res.status(429).json({
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests. Please try again in a minute."
      }
    });
  }
  next();
}

// Memory cleanup for Node
if (typeof setInterval !== "undefined") {
  const interval = setInterval(() => {
    const cutoff = Date.now() - WINDOW_MS;
    for (const [ip, bucket] of buckets) {
      if (bucket.startedAt < cutoff) buckets.delete(ip);
    }
  }, WINDOW_MS);
  if (interval.unref) interval.unref();
}

module.exports = {
  isRateLimited,
  rateLimit,
};
