require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const { rateLimit } = require("./backend/rate-limiter");
const { rewriteText } = require("./backend/semantic-rewriter");

const app = express();
app.set("trust proxy", 1);

const PORT = Number(process.env.PORT || 3000);
const MAX_CHARS = Number(process.env.MAX_INPUT_CHARS || 20000);

app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: false,
    frameguard: false,
    crossOriginResourcePolicy: false,
  })
);

const corsOptions = {
  origin: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(express.json({ limit: `${Math.max(32, Math.ceil(MAX_CHARS / 1024))}kb` }));

// Health check endpoints
app.get(["/health", "/api/health"], (_req, res) => {
  res.json({ status: "ok" });
});

// Semantic rewrite endpoint
app.post("/api/rewrite", rateLimit, async (req, res) => {
  try {
    const { text, intensity = "balanced" } = req.body || {};
    if (typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Please enter some text first." });
    }
    if (text.length > MAX_CHARS) {
      return res.status(413).json({ error: "The text is too long. Please shorten it and try again." });
    }
    if (!new Set(["light", "balanced", "strong"]).has(intensity)) {
      return res.status(400).json({ error: "Invalid rewrite intensity." });
    }

    console.info("Semantic rewrite request received");
    const rewritten = await rewriteText(text, intensity);
    console.info("Semantic rewrite request completed");
    return res.json({ text: rewritten });
  } catch (error) {
    console.error("Semantic rewrite request failed:", error.message);
    return res.status(502).json({ error: error.message || "The rewriting service is temporarily unavailable." });
  }
});

// Serve frontend static assets
const frontendPath = path.join(__dirname, "frontend");
app.use(express.static(frontendPath));

// Catch-all for API 404
app.all("/api/*", (_req, res) => {
  res.status(404).json({ error: "Not found." });
});

// SPA fallback for HTML pages
app.get("*", (_req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// Global error handler
app.use((error, _req, res, _next) => {
  console.error("Server error:", error.message);
  res.status(error.type === "entity.too.large" ? 413 : 500).json({
    error: error.type === "entity.too.large" ? "The text is too long. Please shorten it and try again." : "The server could not process the request.",
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.info(`TextMy AI Humanizer listening on http://0.0.0.0:${PORT}`);
});
