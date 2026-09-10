require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("./rate-limiter");
const { rewriteText } = require("./semantic-rewriter");

const app = express();
// The API runs behind a platform proxy (Render/Vercel/Cloudflare); trust the first proxy so req.ip resolves to the client IP for rate limiting.
app.set("trust proxy", 1);
const PORT = Number(process.env.PORT || 3000);
const MAX_CHARS = Number(process.env.MAX_INPUT_CHARS || 20000);
const allowedOrigin = process.env.ALLOWED_ORIGIN || "http://localhost:5500";

app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: allowedOrigin, methods: ["GET", "POST"], allowedHeaders: ["Content-Type"] }));
app.use(express.json({ limit: `${Math.max(32, Math.ceil(MAX_CHARS / 1024))}kb` }));

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.post("/api/rewrite", rateLimit, async (req, res) => {
  try {
    const { text, intensity } = req.body || {};
    if (typeof text !== "string" || !text.trim()) return res.status(400).json({ error: "Please enter some text first." });
    if (text.length > MAX_CHARS) return res.status(413).json({ error: "The text is too long. Please shorten it and try again." });
    if (!new Set(["light", "balanced", "strong"]).has(intensity)) return res.status(400).json({ error: "Invalid rewrite intensity." });
    console.info("request received");
    const rewritten = await rewriteText(text, intensity);
    console.info("request completed");
    return res.json({ text: rewritten });
  } catch (error) {
    console.error("request failed:", error.message);
    return res.status(502).json({ error: "The rewriting service is temporarily unavailable." });
  }
});

app.use((_req, res) => res.status(404).json({ error: "Not found." }));
app.use((error, _req, res, _next) => {
  console.error("request failed:", error.message);
  res.status(error.type === "entity.too.large" ? 413 : 500).json({ error: error.type === "entity.too.large" ? "The text is too long. Please shorten it and try again." : "The server could not process the request." });
});

app.listen(PORT, () => console.info(`TextMy API listening on port ${PORT}`));
