const buckets = new Map();
const WINDOW_MS = 60_000;
const LIMIT = Number(process.env.RATE_LIMIT_PER_MINUTE || 10);

function rateLimit(req, res, next) {
  const now = Date.now();
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const existing = buckets.get(ip);
  const bucket = !existing || now - existing.startedAt >= WINDOW_MS
    ? { startedAt: now, count: 0 }
    : existing;

  bucket.count += 1;
  buckets.set(ip, bucket);

  if (bucket.count > LIMIT) {
    console.warn("rate limit exceeded");
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }
  next();
}

setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [ip, bucket] of buckets) if (bucket.startedAt < cutoff) buckets.delete(ip);
}, WINDOW_MS).unref();

module.exports = { rateLimit };
