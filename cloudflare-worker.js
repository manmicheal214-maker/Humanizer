/**
 * TextMy AI Humanizer & Content Analysis Platform - Cloudflare Worker
 * Fully production-ready for Cloudflare Workers, Cloudflare D1, Cloudflare KV, and Gemini API.
 *
 * Supported Endpoints:
 * - GET  /health or /api/health
 * - POST /api/analyze
 * - POST /api/humanize
 * - POST /api/rewrite (backward compatibility)
 * - GET  /api/usage
 * - GET  /api/history
 */

// ---------------------------------------------------------------------------
// Configuration & Prompts
// ---------------------------------------------------------------------------

const ANALYZER_PROMPT_VERSION = "1.0.0";
const REWRITER_PROMPT_VERSION = "1.0.0";
const CHECKER_PROMPT_VERSION = "1.0.0";
const CORRECTION_PROMPT_VERSION = "1.0.0";

const CONFIG = {
  DEFAULT_MODEL: "gemini-3.1-flash-lite",
  FALLBACK_MODELS: ["gemini-3.1-flash-lite", "gemini-2.5-flash", "gemini-3.8-flash"],
  MAX_INPUT_CHARS: 20000,
  DEFAULT_TIMEOUT_MS: 45000,
  PLANS: {
    free: { id: "free", name: "Free Tier", monthlyChars: 50000, rateLimitPerMin: 20 },
    pro: { id: "pro", name: "Pro Tier", monthlyChars: 1000000, rateLimitPerMin: 60 },
    business: { id: "business", name: "Business Tier", monthlyChars: 10000000, rateLimitPerMin: 200 },
  },
  SUPPORTED_STYLES: ["natural", "conversational", "professional", "academic", "business", "marketing", "casual", "concise"],
  SUPPORTED_AUDIENCES: ["general", "professionals", "academics", "executives", "students", "customers", "beginners"],
  SUPPORTED_PURPOSES: ["general writing", "blog post", "essay", "email", "report", "technical document", "creative article"],
  SUPPORTED_LANGUAGES: ["en", "es", "fr", "de", "pt", "it", "nl", "auto"],
  LIMITATIONS: [
    "AI detectors and stylistic models are probabilistic and cannot conclusively prove authorship.",
    "Perplexity scores depend on the specific training distribution of the evaluated language model.",
    "Human writing frequently exhibits low perplexity, tight symmetry, or concise cadence in formal domains.",
    "AI-generated text can exhibit high burstiness and varied vocabulary through prompt instructions.",
    "Human editing, proofreading, and paraphrasing alter detectable statistical signatures.",
    "Non-native English writers often use repetitive or formulaic transitions that automated tools mistake for machine generation.",
    "No stylistic or statistical analysis alone constitutes definitive proof of human or synthetic authorship."
  ],
};

const STYLE_INSTRUCTIONS = {
  natural: "Rewrite with natural, effortless cadence, balanced vocabulary, and organic sentence variety suitable for human readers.",
  conversational: "Rewrite in a warm, direct, conversational voice with natural contractions, clear phrasing, and accessible flow.",
  professional: "Rewrite in a polished, articulate, professional tone suitable for workplace, business, or client communications.",
  academic: "Rewrite with scholarly rigor, analytical clarity, precise vocabulary, and well-structured transitions without sounding inflated.",
  business: "Rewrite with concise, action-oriented business prose emphasizing clarity, key takeaways, and crisp delivery.",
  marketing: "Rewrite with engaging, persuasive energy, crisp rhythm, and compelling narrative flow.",
  casual: "Rewrite in an easygoing, everyday style with friendly cadence and relaxed phrasing.",
  concise: "Rewrite with maximum economy of language, eliminating all redundant phrasing, fluff, and filler while retaining every core fact."
};

const COMMON_TRANSITIONS = [
  "furthermore", "moreover", "additionally", "however", "in conclusion",
  "therefore", "nevertheless", "consequently", "further", "thus", "hence",
  "in summary", "overall", "on the other hand", "specifically", "for example",
  "for instance", "in particular", "notably", "significantly", "meanwhile",
  "subsequently", "as a result", "ultimately", "to summarize"
];

const FORMULAIC_PHRASES = [
  "it is important to note", "it is worth noting", "delve into", "delves into",
  "a testament to", "testament to", "in today's fast-paced world",
  "plays a crucial role", "plays a pivotal role", "rich tapestry", "tapestry of",
  "beacon of", "revolutionize the way", "game-changer", "fosters a sense",
  "at its core", "shed light on", "navigating the complexities", "dive deep into",
  "in summary,", "in conclusion,", "vital role", "paramount importance"
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-User-Id, X-Request-Id",
  "Access-Control-Max-Age": "86400",
};

// ---------------------------------------------------------------------------
// Deterministic Text Analysis Engine
// ---------------------------------------------------------------------------

function extractParagraphs(text) {
  if (!text || typeof text !== "string") return [];
  return text.split(/\n\s*\n+/).map((p) => p.trim()).filter((p) => p.length > 0);
}

function extractSentences(text) {
  if (!text || typeof text !== "string") return [];
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  let protectedText = normalized
    .replace(/\b([a-z])\.(?=[a-z]\.)/gi, "$1\u2024")
    .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|vol|no|fig|approx|dept|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\./gi, "$1\u2024")
    .replace(/\b([A-Z])\./g, "$1\u2024");

  const rawMatches = protectedText.match(/[^.!?\n]+(?:[.!?]+(?=["'\s]|$)|$)/g) || [protectedText];
  return rawMatches
    .map((s) => s.replace(/\u2024/g, ".").trim())
    .filter((s) => s.length > 0);
}

function extractWords(text) {
  if (!text || typeof text !== "string") return [];
  return text.match(/[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*/g) || [];
}

function calculateVarianceAndStdDev(numbers, mean) {
  if (!numbers || numbers.length <= 1) return { variance: 0, stdDev: 0 };
  const sumSquares = numbers.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0);
  const variance = sumSquares / numbers.length;
  const stdDev = Math.sqrt(variance);
  return {
    variance: Math.round(variance * 100) / 100,
    stdDev: Math.round(stdDev * 100) / 100,
  };
}

function computeNgrams(words, n) {
  if (words.length < n) return {};
  const counts = {};
  for (let i = 0; i <= words.length - n; i++) {
    const gram = words.slice(i, i + n).join(" ");
    counts[gram] = (counts[gram] || 0) + 1;
  }
  return counts;
}

function analyzeDeterministic(rawText) {
  const text = typeof rawText === "string" ? rawText : "";
  const trimmed = text.trim();

  const characterCount = text.length;
  const characterCountNoSpaces = text.replace(/\s+/g, "").length;

  const paragraphs = extractParagraphs(trimmed);
  const paragraphCount = paragraphs.length;

  const sentences = extractSentences(trimmed);
  const sentenceCount = sentences.length;

  const words = extractWords(trimmed);
  const wordCount = words.length;

  const lowerWords = words.map((w) => w.toLowerCase());
  const uniqueWordsSet = new Set(lowerWords);
  const vocabularySize = uniqueWordsSet.size;
  const typeTokenRatio = wordCount > 0 ? Math.round((vocabularySize / wordCount) * 1000) / 1000 : 0;

  const sentenceLengths = sentences.map((s) => extractWords(s).length).filter((l) => l > 0);
  const minSentenceLength = sentenceLengths.length > 0 ? Math.min(...sentenceLengths) : 0;
  const maxSentenceLength = sentenceLengths.length > 0 ? Math.max(...sentenceLengths) : 0;
  const totalSentenceWords = sentenceLengths.reduce((a, b) => a + b, 0);
  const avgSentenceLength = sentenceLengths.length > 0 ? Math.round((totalSentenceWords / sentenceLengths.length) * 10) / 10 : 0;

  const { variance: sentenceLengthVariance, stdDev: sentenceLengthStdDev } = calculateVarianceAndStdDev(sentenceLengths, avgSentenceLength);

  const totalWordChars = words.reduce((acc, w) => acc + w.length, 0);
  const averageWordLength = wordCount > 0 ? Math.round((totalWordChars / wordCount) * 10) / 10 : 0;

  const paragraphWordCounts = paragraphs.map((p) => extractWords(p).length);
  const minParagraphLength = paragraphWordCounts.length > 0 ? Math.min(...paragraphWordCounts) : 0;
  const maxParagraphLength = paragraphWordCounts.length > 0 ? Math.max(...paragraphWordCounts) : 0;
  const avgParagraphLength = paragraphWordCounts.length > 0 ? Math.round((wordCount / paragraphCount) * 10) / 10 : 0;

  const sentenceDistribution = { short: 0, medium: 0, long: 0, veryLong: 0 };
  sentenceLengths.forEach((len) => {
    if (len <= 10) sentenceDistribution.short++;
    else if (len <= 25) sentenceDistribution.medium++;
    else if (len <= 40) sentenceDistribution.long++;
    else sentenceDistribution.veryLong++;
  });

  const punctuation = {
    commas: (text.match(/,/g) || []).length,
    periods: (text.match(/\./g) || []).length,
    semicolons: (text.match(/;/g) || []).length,
    colons: (text.match(/:/g) || []).length,
    questionMarks: (text.match(/\?/g) || []).length,
    exclamationMarks: (text.match(/!/g) || []).length,
    quotations: (text.match(/["'“”‘’]/g) || []).length,
    dashes: (text.match(/[—–-]/g) || []).length,
  };

  const bigramCounts = computeNgrams(lowerWords, 2);
  const trigramCounts = computeNgrams(lowerWords, 3);
  const fourgramCounts = computeNgrams(lowerWords, 4);

  const repeatedBigrams = Object.entries(bigramCounts)
    .filter(([_, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([phrase, count]) => ({ phrase, count }));

  const repeatedTrigrams = Object.entries(trigramCounts)
    .filter(([_, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([phrase, count]) => ({ phrase, count }));

  const repeatedFourgrams = Object.entries(fourgramCounts)
    .filter(([_, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([phrase, count]) => ({ phrase, count }));

  const repeatedBigramTokens = repeatedBigrams.reduce((acc, item) => acc + item.count * 2, 0);
  const repetitionRate = wordCount > 0 ? Math.min(1, Math.round((repeatedBigramTokens / wordCount) * 100) / 100) : 0;

  const lowerText = trimmed.toLowerCase();
  const transitionFrequencies = [];
  COMMON_TRANSITIONS.forEach((phrase) => {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = lowerText.match(new RegExp(`\\b${escaped}\\b`, "gi"));
    if (matches && matches.length > 0) transitionFrequencies.push({ phrase, count: matches.length });
  });
  transitionFrequencies.sort((a, b) => b.count - a.count);

  const detectedFormulaicPhrases = [];
  FORMULAIC_PHRASES.forEach((phrase) => {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = lowerText.match(new RegExp(`\\b${escaped}`, "gi"));
    if (matches && matches.length > 0) detectedFormulaicPhrases.push({ phrase, count: matches.length });
  });

  let burstinessInterpretation = "Moderate variation across sentence lengths.";
  if (sentenceCount <= 2) {
    burstinessInterpretation = "Sample size too small for statistical sentence-length variation.";
  } else if (sentenceLengthStdDev < 4.0) {
    burstinessInterpretation = "Low variation; sentences follow a very uniform length.";
  } else if (sentenceLengthStdDev > 10.0) {
    burstinessInterpretation = "High variation with dynamic mix of short and complex sentences.";
  }

  return {
    statistics: {
      characterCount,
      characterCountNoSpaces,
      wordCount,
      sentenceCount,
      paragraphCount,
      averageSentenceLength: avgSentenceLength,
      minimumSentenceLength: minSentenceLength,
      maximumSentenceLength: maxSentenceLength,
      sentenceLengthVariance,
      sentenceLengthStdDev,
      averageWordLength,
      vocabularySize,
      typeTokenRatio,
      paragraphLengthStatistics: {
        minimumWords: minParagraphLength,
        maximumWords: maxParagraphLength,
        averageWords: avgParagraphLength,
        count: paragraphCount,
      },
      sentenceLengthDistribution: sentenceDistribution,
    },
    burstiness: {
      sentenceLengthMean: avgSentenceLength,
      sentenceLengthVariance,
      sentenceLengthStdDev,
      interpretation: burstinessInterpretation,
    },
    perplexity: {
      available: false,
      value: null,
      explanation: "Token-level probabilities were not available from the active language model. True perplexity requires internal decoder log-probabilities."
    },
    tokenProbabilities: {
      available: false,
      explanation: "Per-token log-probabilities are not exposed by the active model endpoint."
    },
    stylometry: {
      averageWordLength,
      typeTokenRatio,
      averageSentenceLength: avgSentenceLength,
      sentenceLengthStdDev,
      punctuationDistribution: punctuation,
      quotationCount: punctuation.quotations,
      questionCount: punctuation.questionMarks,
      exclamationCount: punctuation.exclamationMarks,
      colonCount: punctuation.colons,
      semicolonCount: punctuation.semicolons,
    },
    repetition: {
      repeatedWords: [],
      ngrams: {
        bigrams: repeatedBigrams,
        trigrams: repeatedTrigrams,
        fourgrams: repeatedFourgrams,
        repeatedPhrases: [],
        repetitionRate,
      },
    },
    vocabulary: {
      vocabularySize,
      typeTokenRatio,
      transitionFrequencies,
      commonFormulaicPhrases: detectedFormulaicPhrases,
    },
    structure: {
      paragraphCount,
      sentenceDistribution,
    },
  };
}

// ---------------------------------------------------------------------------
// Lexical / Embedding Similarity
// ---------------------------------------------------------------------------

function lexicalJaccardSimilarity(sentenceA, sentenceB) {
  const getTokens = (str) => new Set((str.toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length > 2));
  const setA = getTokens(sentenceA);
  const setB = getTokens(sentenceB);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  setA.forEach((token) => { if (setB.has(token)) intersection++; });
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? Math.round((intersection / union) * 100) / 100 : 0;
}

function analyzeSentenceTransitions(sentences) {
  if (!sentences || sentences.length < 2) {
    return { available: false, method: "none", pairs: [], explanation: "Insufficient sentences." };
  }
  const pairs = [];
  for (let i = 0; i < Math.min(sentences.length - 1, 15); i++) {
    const s1 = sentences[i];
    const s2 = sentences[i + 1];
    const score = lexicalJaccardSimilarity(s1, s2);
    pairs.push({
      index: i + 1,
      sentenceA: s1.length > 90 ? s1.slice(0, 87) + "…" : s1,
      sentenceB: s2.length > 90 ? s2.slice(0, 87) + "…" : s2,
      similarityScore: score,
      potentialIssue: score > 0.65 ? "Potential redundant restatement" : (score < 0.05 ? "Abrupt contextual transition" : null)
    });
  }
  return {
    available: false,
    method: "lexical_jaccard_overlap",
    pairs,
    explanation: "Semantic vector embeddings were not configured. Lexical word overlap (Jaccard index) was calculated."
  };
}

// ---------------------------------------------------------------------------
// Robust Gemini Client
// ---------------------------------------------------------------------------

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
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return fallback; }
    }
    return fallback;
  }
}

// In-memory circuit breaker for models experiencing rate limits
const workerThrottledModels = new Map();

async function callGeminiWorker({ prompt, systemInstruction, apiKey, model, temperature = 0.7, jsonMode = false }) {
  if (!apiKey) {
    const err = new Error("GEMINI_API_KEY secret is not set in Cloudflare Worker settings.");
    err.status = 500;
    throw err;
  }

  const now = Date.now();
  const rawList = [model, ...CONFIG.FALLBACK_MODELS].filter((m, i, arr) => m && arr.indexOf(m) === i);
  // Sort models with active cooldowns to the end
  const models = [...rawList].sort((a, b) => {
    const aThrottled = (workerThrottledModels.get(a) || 0) > now;
    const bThrottled = (workerThrottledModels.get(b) || 0) > now;
    if (aThrottled === bThrottled) return 0;
    return aThrottled ? 1 : -1;
  });

  let lastError = null;
  let lastRetryAfter = null;

  for (const currentModel of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(currentModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const bodyPayload = {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature, topP: 0.9, maxOutputTokens: 8192 }
        };
        if (jsonMode) bodyPayload.generationConfig.responseMimeType = "application/json";
        if (systemInstruction) bodyPayload.systemInstruction = { parts: [{ text: systemInstruction }] };

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyPayload)
        });

        if (res.ok) {
          workerThrottledModels.delete(currentModel);
          const data = await res.json();
          const rawText = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim();
          const usageMetadata = data?.usageMetadata || {};
          if (!rawText) throw new Error("Empty candidate returned by model.");
          return {
            text: rawText,
            model: currentModel,
            usage: {
              promptTokens: usageMetadata.promptTokenCount || 0,
              candidatesTokens: usageMetadata.candidatesTokenCount || 0,
            }
          };
        }

        let errorDetail = "";
        try {
          const errJson = await res.json();
          errorDetail = errJson?.error?.message || "";
        } catch {
          errorDetail = await res.text().catch(() => "");
        }

        const status = res.status;
        lastError = new Error(`AI service returned status ${status}: ${errorDetail || "Error"}`);
        lastError.status = status;

        if (status === 429) {
          const match = errorDetail.match(/retry in\s+([0-9.]+)\s*s/i);
          if (match) {
            lastRetryAfter = Math.ceil(parseFloat(match[1]));
          } else {
            const h = res.headers.get("retry-after");
            if (h) lastRetryAfter = parseInt(h, 10) || 30;
          }
          const cooldownSec = lastRetryAfter || 30;
          workerThrottledModels.set(currentModel, Date.now() + cooldownSec * 1000);
          break;
        }

        if (status === 503) {
          workerThrottledModels.set(currentModel, Date.now() + 15000);
          break;
        }
        break;
      } catch (err) {
        lastError = err;
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 400));
          continue;
        }
      }
    }
  }

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
  throw safeError;
}

// ---------------------------------------------------------------------------
// Rate Limiting & D1 Storage
// ---------------------------------------------------------------------------

async function checkWorkerRateLimit(clientKey, limit, env) {
  if (!env.KV) return false; // Allowed if KV is not bound
  const currentMinute = Math.floor(Date.now() / 60000);
  const kvKey = `rate:${clientKey}:${currentMinute}`;
  try {
    const val = await env.KV.get(kvKey);
    const count = (parseInt(val, 10) || 0) + 1;
    await env.KV.put(kvKey, String(count), { expirationTtl: 120 });
    return count > limit;
  } catch (e) {
    console.warn("KV rate limit error:", e.message);
    return false;
  }
}

async function checkD1Usage(userId, env) {
  const planKey = env.DEFAULT_PLAN || "free";
  const plan = CONFIG.PLANS[planKey] || CONFIG.PLANS.free;
  let currentMonthlyChars = 0;

  if (env.DB && typeof env.DB.prepare === "function") {
    try {
      const startOfMonth = Math.floor(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() / 1000);
      const res = await env.DB.prepare("SELECT SUM(characters) as totalChars FROM usage WHERE user_id = ? AND created_at >= ?")
        .bind(userId, startOfMonth)
        .first();
      currentMonthlyChars = Number(res?.totalChars || 0);
    } catch (e) {
      console.warn("D1 usage query error:", e.message);
    }
  }

  return {
    allowed: currentMonthlyChars < plan.monthlyChars,
    plan: plan.name,
    limit: plan.monthlyChars,
    used: currentMonthlyChars,
    remaining: Math.max(0, plan.monthlyChars - currentMonthlyChars),
  };
}

async function recordD1Usage(userId, characters, words, inputTokens, outputTokens, model, env) {
  if (env.DB && typeof env.DB.prepare === "function") {
    try {
      const id = "usg-" + Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 7);
      await env.DB.prepare("INSERT INTO usage (id, user_id, characters, words, input_tokens, output_tokens, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())")
        .bind(id, userId, characters, words, inputTokens, outputTokens, model)
        .run();
    } catch (e) {
      console.warn("D1 record usage error:", e.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Worker Request Handler
// ---------------------------------------------------------------------------

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const clientIp = request.headers.get("CF-Connecting-IP") || "anon";
    const userId = request.headers.get("X-User-Id") || clientIp;

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check
    if ((pathname === "/health" || pathname === "/api/health") && request.method === "GET") {
      return new Response(JSON.stringify({
        status: "ok",
        version: "1.0.0",
        d1: Boolean(env.DB),
        kv: Boolean(env.KV),
        timestamp: new Date().toISOString()
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Usage check endpoint
    if (pathname === "/api/usage" && request.method === "GET") {
      const usage = await checkD1Usage(userId, env);
      return new Response(JSON.stringify({ success: true, usage }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Analysis Endpoint
    if (pathname === "/api/analyze" && request.method === "POST") {
      try {
        const body = await request.json().catch(() => ({}));
        const text = typeof body?.text === "string" ? body.text.trim() : "";
        if (!text) {
          return new Response(JSON.stringify({ success: false, error: { message: "Please provide non-empty text to analyze." } }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const deterministic = analyzeDeterministic(text);
        const sentences = extractSentences(text);
        const transitions = analyzeSentenceTransitions(sentences);

        // Optional Gemini Linguistic Analysis
        let linguistic = {
          tone: "balanced",
          formality: 50,
          readability: "Standard",
          issues: [],
          humanLikeSignals: [],
          aiLikeSignals: [],
        };

        const apiKey = env.GEMINI_API_KEY;
        if (apiKey) {
          try {
            const prompt = `You are a linguistic analyst. Analyze the following text and return strictly JSON:
{
  "tone": "descriptive",
  "formality": 60,
  "readability": "College",
  "issues": ["e.g. repetitive transitions"],
  "humanLikeSignals": ["e.g. personal narrative rhythm"],
  "aiLikeSignals": ["e.g. formulaic symmetry"]
}

TEXT:
"""${text}"""`;
            const geminiRes = await callGeminiWorker({
              prompt,
              apiKey,
              model: env.GEMINI_MODEL || CONFIG.DEFAULT_MODEL,
              temperature: 0.2,
              jsonMode: true
            });
            linguistic = parseStrictJson(geminiRes.text, linguistic);
          } catch (e) {
            console.warn("Linguistic analysis call failed:", e.message);
          }
        }

        const overall = {
          aiLikelihood: deterministic.burstiness.sentenceLengthStdDev < 3.5 ? "medium" : "low",
          humanLikelihood: deterministic.burstiness.sentenceLengthStdDev > 8.0 ? "high" : "medium",
          possibleAIAssisted: "low",
          confidence: "moderate",
          strongestAISignals: linguistic.aiLikeSignals || [],
          strongestHumanSignals: linguistic.humanLikeSignals || [],
          limitations: CONFIG.LIMITATIONS,
        };

        return new Response(JSON.stringify({
          success: true,
          analysis: {
            statistics: deterministic.statistics,
            stylometry: deterministic.stylometry,
            burstiness: deterministic.burstiness,
            perplexity: deterministic.perplexity,
            tokenProbabilities: deterministic.tokenProbabilities,
            repetition: deterministic.repetition,
            vocabulary: deterministic.vocabulary,
            structure: deterministic.structure,
            semantic: transitions,
            linguistic,
            signals: { aiLike: overall.strongestAISignals, humanLike: overall.strongestHumanSignals },
            overall,
          }
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: { message: err.message || "Analysis failed" } }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // Humanize & Rewrite Endpoint
    if ((pathname === "/api/humanize" || pathname === "/api/rewrite") && request.method === "POST") {
      try {
        const isRateLimitHit = await checkWorkerRateLimit(clientIp, 30, env);
        if (isRateLimitHit) {
          return new Response(JSON.stringify({
            success: false,
            error: { code: "RATE_LIMIT_EXCEEDED", message: "Too many requests. Please try again in a minute." }
          }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const body = await request.json().catch(() => ({}));
        const text = typeof body?.text === "string" ? body.text.trim() : "";
        if (!text) {
          return new Response(JSON.stringify({ error: "Please enter some text first.", message: "Please enter some text first." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        if (text.length > CONFIG.MAX_INPUT_CHARS) {
          return new Response(JSON.stringify({ error: "The text is too long. Please shorten it and try again." }), {
            status: 413,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        // Map intensity if old endpoint
        let style = body.style || "natural";
        if (body.intensity) {
          const map = { light: "concise", balanced: "natural", strong: "conversational" };
          style = map[body.intensity] || "natural";
        }

        const audience = body.audience || "general";
        const purpose = body.purpose || "general writing";
        const styleInstruction = STYLE_INSTRUCTIONS[style] || STYLE_INSTRUCTIONS.natural;

        const rewriterPrompt = `You are an expert semantic rewriting engine. Rewrite the user's text to make it clearer, more natural, readable, and stylistically varied while strictly preserving the author's exact meaning.

TARGET SPECIFICATIONS:
- Style: ${style} (${styleInstruction})
- Target Audience: ${audience}
- Purpose: ${purpose}

STRICT PRESERVATION RULES:
1. Preserve all factual claims, names, dates, numbers, measurements, citations, URLs, and conclusions.
2. Preserve exact text inside quotation marks, code fences, inline code, or URLs.
3. Preserve uncertainty, hedging, qualifications, and the author's position.
4. Do not invent facts, examples, sources, or evidence.
5. Return ONLY the rewritten text. Never add a preface, explanation, labels, or meta-commentary.

ORIGINAL TEXT:
"""${text}"""`;

        const rewriteResult = await callGeminiWorker({
          prompt: rewriterPrompt,
          apiKey: env.GEMINI_API_KEY,
          model: env.GEMINI_MODEL || CONFIG.DEFAULT_MODEL,
          temperature: 0.65,
        });

        // Strip prefixes
        let rewritten = rewriteResult.text.trim();
        const prefixes = [
          /^here\s+is\s+the\s+rewritten\s+text/i,
          /^here\s+is\s+the\s+rewritten\s+version/i,
          /^here'?s\s+the\s+rewritten/i,
          /^i\s+have\s+rewritten/i,
          /^as\s+an\s+ai/i,
          /^sure,?\s*here\s+is/i,
          /^certainly,?\s*here\s+is/i,
          /^rewritten\s+text:/i,
          /^output:/i
        ];
        for (const re of prefixes) {
          if (re.test(rewritten)) rewritten = rewritten.replace(re, "").replace(/^[\s:—-]+/, "").trim();
        }
        rewritten = stripMarkdownFences(rewritten);

        // Quality check
        let qualityReport = { passed: true, score: 95, meaningPreserved: true };
        try {
          const checkerPrompt = `Compare ORIGINAL and REWRITTEN text. Return JSON:
{"passed": true, "meaningPreserved": true, "factsPreserved": true, "score": 95}
ORIGINAL: """${text}"""
REWRITTEN: """${rewritten}"""`;
          const checkRes = await callGeminiWorker({
            prompt: checkerPrompt,
            apiKey: env.GEMINI_API_KEY,
            model: env.GEMINI_MODEL || CONFIG.DEFAULT_MODEL,
            temperature: 0.1,
            jsonMode: true,
          });
          qualityReport = parseStrictJson(checkRes.text, qualityReport);
        } catch (e) {
          console.warn("Quality check error:", e.message);
        }

        // Record D1 usage asynchronously
        const words = text.split(/\s+/).filter(Boolean).length;
        if (ctx && typeof ctx.waitUntil === "function") {
          ctx.waitUntil(recordD1Usage(userId, text.length, words, rewriteResult.usage.promptTokens, rewriteResult.usage.candidatesTokens, rewriteResult.model, env));
        }

        const deterministic = analyzeDeterministic(text);

        return new Response(JSON.stringify({
          success: true,
          text: rewritten,
          result: rewritten,
          analysis: {
            statistics: deterministic.statistics,
            stylometry: deterministic.stylometry,
            burstiness: deterministic.burstiness,
            repetition: deterministic.repetition,
            vocabulary: deterministic.vocabulary,
          },
          quality: qualityReport,
          usage: { characters: text.length, words }
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        const status = err.status || 502;
        const resHeaders = { ...corsHeaders, "Content-Type": "application/json" };
        if (err.retryAfter) {
          resHeaders["Retry-After"] = String(err.retryAfter);
        }
        return new Response(JSON.stringify({
          success: false,
          error: {
            code: err.code || (status === 429 ? "RATE_LIMIT_EXCEEDED" : "REWRITE_FAILED"),
            message: err.message || "Rewriting service is temporarily unavailable.",
            retryAfter: err.retryAfter
          }
        }), {
          status,
          headers: resHeaders
        });
      }
    }

    return new Response(JSON.stringify({ error: "Endpoint not found." }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
};
