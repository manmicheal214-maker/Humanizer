require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const { rateLimit } = require("./backend/rate-limiter");
const { runAnalysisPipeline, runHumanizePipeline } = require("./backend/pipeline");
const { validateHumanizeInput, validateAnalyzeInput } = require("./backend/validator");
const { checkUsageLimit, getHistory } = require("./backend/storage");
const CONFIG = require("./backend/config");

const app = express();
app.set("trust proxy", 1);

const PORT = Number(process.env.PORT || 3000);
const MAX_CHARS = Number(process.env.MAX_INPUT_CHARS || CONFIG.MAX_INPUT_CHARS);

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
  allowedHeaders: ["Content-Type", "Authorization", "X-User-Id"],
  credentials: true,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(express.json({ limit: `${Math.max(64, Math.ceil(MAX_CHARS / 1024))}kb` }));

// Request ID & Structured timing middleware
app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] || `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  req.startTime = Date.now();
  res.setHeader("X-Request-Id", req.id);
  next();
});

// Health check endpoint
app.get(["/health", "/api/health"], (_req, res) => {
  res.json({
    status: "ok",
    version: "1.0.0",
    timestamp: new Date().toISOString()
  });
});

// Detailed Analysis Endpoint
app.post("/api/analyze", rateLimit, async (req, res) => {
  const requestId = req.id;
  try {
    const validation = validateAnalyzeInput(req.body, MAX_CHARS);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_FAILED", message: validation.error }
      });
    }

    console.info(`[${requestId}] Analysis request received (length: ${validation.data.text.length})`);
    const analysis = await runAnalysisPipeline({
      text: validation.data.text,
      env: process.env,
    });

    const duration = Date.now() - req.startTime;
    console.info(`[${requestId}] Analysis completed in ${duration}ms`);

    return res.json({
      success: true,
      analysis,
      meta: { durationMs: duration, requestId }
    });
  } catch (error) {
    const duration = Date.now() - req.startTime;
    console.error(`[${requestId}] Analysis failed after ${duration}ms:`, error.message);
    const status = error.status || 500;
    return res.status(status).json({
      success: false,
      error: {
        code: error.code || "ANALYSIS_FAILED",
        message: error.message || "Failed to analyze text."
      }
    });
  }
});

// Full Humanize & Rewriting Endpoint
app.post("/api/humanize", rateLimit, async (req, res) => {
  const requestId = req.id;
  try {
    const validation = validateHumanizeInput(req.body, MAX_CHARS);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_FAILED", message: validation.error }
      });
    }

    const userId = req.headers["x-user-id"] || "anonymous";
    console.info(`[${requestId}] Humanize request received (user: ${userId}, style: ${validation.data.style}, length: ${validation.data.text.length})`);

    const result = await runHumanizePipeline({
      ...validation.data,
      userId,
      env: process.env,
    });

    const duration = Date.now() - req.startTime;
    console.info(`[${requestId}] Humanize completed successfully in ${duration}ms`);

    return res.json({
      ...result,
      meta: { durationMs: duration, requestId }
    });
  } catch (error) {
    const duration = Date.now() - req.startTime;
    console.error(`[${requestId}] Humanize failed after ${duration}ms:`, error.message);
    const status = error.status || (error.code === "QUOTA_EXCEEDED" ? 403 : 502);
    if (error.retryAfter) {
      res.set("Retry-After", String(error.retryAfter));
    }
    return res.status(status).json({
      success: false,
      error: {
        code: error.code || "HUMANIZE_FAILED",
        message: error.message || "Content transformation failed.",
        retryAfter: error.retryAfter
      }
    });
  }
});

// Backward compatibility for /api/rewrite
app.post("/api/rewrite", rateLimit, async (req, res) => {
  const requestId = req.id;
  try {
    const { text, intensity = "balanced" } = req.body || {};
    if (typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Please enter some text first." });
    }
    if (text.length > MAX_CHARS) {
      return res.status(413).json({ error: "The text is too long. Please shorten it and try again." });
    }

    const styleMap = { light: "concise", balanced: "natural", strong: "conversational" };
    const style = styleMap[intensity] || "natural";

    const result = await runHumanizePipeline({
      text: text.trim(),
      style,
      userId: req.headers["x-user-id"] || "anonymous",
      env: process.env,
    });

    return res.json({
      text: result.result,
      result: result.result,
      analysis: result.analysis,
      quality: result.quality
    });
  } catch (error) {
    console.error(`[${requestId}] Rewrite failed:`, error.message);
    const status = error.status || 502;
    if (error.retryAfter) {
      res.set("Retry-After", String(error.retryAfter));
    }
    return res.status(status).json({
      error: error.message || "The rewriting service is temporarily unavailable.",
      retryAfter: error.retryAfter
    });
  }
});

// Usage Quota Endpoint
app.get("/api/usage", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"] || "anonymous";
    const usage = await checkUsageLimit(userId, 0, process.env);
    return res.json({ success: true, usage });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Rewriting History Endpoint
app.get("/api/history", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"] || "anonymous";
    const history = await getHistory(userId, 20, process.env);
    return res.json({ success: true, history });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Serve frontend static assets
const frontendPath = path.join(__dirname, "frontend");
app.use(express.static(frontendPath));

// Catch-all for API 404
app.all("/api/*", (_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: "API endpoint not found." }
  });
});

// SPA fallback for HTML pages
app.get("*", (_req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// Global error handler
app.use((error, req, res, _next) => {
  console.error(`[${req.id || "err"}] Server exception:`, error.message);
  res.status(error.type === "entity.too.large" ? 413 : 500).json({
    success: false,
    error: {
      code: error.type === "entity.too.large" ? "PAYLOAD_TOO_LARGE" : "INTERNAL_SERVER_ERROR",
      message: error.type === "entity.too.large"
        ? "The text is too long. Please shorten it and try again."
        : "The server encountered an error processing your request."
    }
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.info(`TextMy AI Platform listening on http://0.0.0.0:${PORT}`);
});
