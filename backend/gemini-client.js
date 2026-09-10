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

  const models = [
    model,
    ...CONFIG.FALLBACK_MODELS
  ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

  let lastError = null;

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
        lastError = new Error(`AI service returned HTTP ${status}: ${errorDetail || "Error"}`);
        lastError.status = status;

        // On transient load or rate-limit, move immediately to the next fallback model
        if (status === 429 || status === 503) {
          console.warn(`Model ${currentModel} returned HTTP ${status}. Trying next fallback model...`);
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

  // Safe normalized error
  const safeError = new Error(
    lastError?.status === 429
      ? "AI service is currently at capacity. Please try again shortly."
      : (lastError?.status === 503
        ? "AI model is currently experiencing high demand. Please retry in a few moments."
        : "Unable to process content with the AI service at this time.")
  );
  safeError.code = "AI_REQUEST_FAILED";
  safeError.status = lastError?.status || 502;
  throw safeError;
}

module.exports = {
  callGemini,
  stripMarkdownFences,
  parseStrictJson,
};
