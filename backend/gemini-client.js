/**
 * Robust Gemini API Client
 * Supports automatic model fallbacks, exponential backoff, JSON extraction, and safe error normalization.
 */

const CONFIG = require("./config");

function stripMarkdownFences(text) {
  if (!text || typeof text !== "string") return "";
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z0-9_-]*\n?/, "").replace(/\n?```$/, "").trim();
  }
  return cleaned;
}

function parseStrictJson(text, fallback = {}) {
  const cleaned = stripMarkdownFences(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to extract first outer json object
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
}

// In-memory circuit breaker for models currently experiencing rate-limiting (429)
const throttledModels = new Map();

async function callGemini({
  prompt,
  systemInstruction,
  apiKey,
  model,
  temperature = 0.7,
  jsonMode = false,
  maxOutputTokens = 8192,
  timeoutMs = CONFIG.DEFAULT_TIMEOUT_MS,
}) {
  if (!apiKey) {
    const err = new Error("GEMINI_API_KEY is not configured.");
    err.code = "API_KEY_MISSING";
    err.status = 500;
    throw err;
  }

  const now = Date.now();
  const rawList = [
    model,
    ...CONFIG.FALLBACK_MODELS
  ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

  // Put currently unthrottled models first so we don't stall on known rate-limited models
  const models = [...rawList].sort((a, b) => {
    const aThrottled = (throttledModels.get(a) || 0) > now;
    const bThrottled = (throttledModels.get(b) || 0) > now;
    if (aThrottled === bThrottled) return 0;
    return aThrottled ? 1 : -1;
  });

  let lastError = null;
  let lastRetryAfter = null;
  let lastErrorDetail = "";

  for (const currentModel of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(currentModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;

        const bodyPayload = {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature,
            topP: 0.9,
            maxOutputTokens,
          }
        };

        if (jsonMode) {
          bodyPayload.generationConfig.responseMimeType = "application/json";
        }

        if (systemInstruction) {
          bodyPayload.systemInstruction = { parts: [{ text: systemInstruction }] };
        }

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyPayload),
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (response.ok) {
          throttledModels.delete(currentModel);
          const data = await response.json();
          const rawText = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim();
          const usageMetadata = data?.usageMetadata || {};

          if (!rawText) {
            throw new Error("Model returned an empty candidate response.");
          }

          return {
            text: rawText,
            model: currentModel,
            usage: {
              promptTokens: usageMetadata.promptTokenCount || 0,
              candidatesTokens: usageMetadata.candidatesTokenCount || 0,
              totalTokens: usageMetadata.totalTokenCount || 0,
            }
          };
        }

        // Handle error responses
        let errorDetail = "";
        try {
          const errJson = await response.json();
          errorDetail = errJson?.error?.message || "";
        } catch {
          errorDetail = await response.text().catch(() => "");
        }

        const status = response.status;
        lastErrorDetail = errorDetail;
        lastError = new Error(`AI service returned HTTP ${status}: ${errorDetail || "Error"}`);
        lastError.status = status;

        // Parse retry-after from Google error message or header
        if (status === 429) {
          const match = errorDetail.match(/retry in\s+([0-9.]+)\s*s/i);
          if (match) {
            lastRetryAfter = Math.ceil(parseFloat(match[1]));
          } else {
            const h = response.headers.get("retry-after");
            if (h) lastRetryAfter = parseInt(h, 10) || 30;
          }
          const cooldownSec = lastRetryAfter || 30;
          throttledModels.set(currentModel, Date.now() + cooldownSec * 1000);
          console.warn(`Model ${currentModel} returned HTTP 429 quota limit. Set ${cooldownSec}s circuit breaker cooldown. Trying next fallback model...`);
          break;
        }

        if (status === 503) {
          throttledModels.set(currentModel, Date.now() + 15000);
          console.warn(`Model ${currentModel} returned HTTP 503 high demand. Trying next fallback model...`);
          break;
        }

        // If client bad request or model not found, don't repeat this model
        break;
      } catch (err) {
        clearTimeout(timer);
        lastError = err;
        if (err.name === "AbortError") {
          lastError = new Error("AI request timed out.");
          lastError.status = 504;
          break;
        }
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 400));
          continue;
        }
      }
    }
  }

  // Safe normalized error with retry metadata
  const is429 = lastError?.status === 429;
  const is503 = lastError?.status === 503;
  const retrySec = lastRetryAfter || 30;

  const safeError = new Error(
    is429
      ? `AI quota limit reached on provider. Please retry in ${retrySec} seconds, or try with shorter text.`
      : (is503
        ? "AI model is currently experiencing high demand. Please retry in a few moments."
        : "Unable to process content with the AI service at this time.")
  );
  safeError.code = is429 ? "AI_QUOTA_EXCEEDED" : (is503 ? "AI_UNAVAILABLE" : "AI_REQUEST_FAILED");
  safeError.status = is429 ? 429 : (lastError?.status || 502);
  safeError.retryAfter = is429 ? retrySec : undefined;
  safeError.details = lastErrorDetail;
  throw safeError;
}

module.exports = {
  callGemini,
  stripMarkdownFences,
  parseStrictJson,
};
