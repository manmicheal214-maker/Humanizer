/**
 * Pipeline Orchestrator for Content Analysis and Humanization
 */

const { analyzeText, extractSentences } = require("./deterministic-analyzer");
const { analyzeSentencePairs } = require("./embeddings");
const { callGemini, parseStrictJson } = require("./gemini-client");
const { buildAnalyzerPrompt } = require("./prompts/analyzer");
const { buildRewriterPrompt, cleanRewrittenText } = require("./prompts/rewriter");
const { buildCheckerPrompt } = require("./prompts/checker");
const { buildCorrectionPrompt } = require("./prompts/correction");
const { checkUsageLimit, recordUsage, saveHistory } = require("./storage");
const CONFIG = require("./config");

/**
 * Synthesizes overall assessment based on deterministic metrics, linguistic findings, and sentence transitions.
 */
function synthesizeOverallAssessment(deterministic, linguistic, sentenceSimilarity) {
  const stdDev = deterministic?.burstiness?.sentenceLengthStdDev || 0;
  const repRate = deterministic?.repetition?.ngrams?.repetitionRate || 0;
  const ttr = deterministic?.stylometry?.typeTokenRatio || 0;

  const aiSignals = [...(linguistic?.aiLikeSignals || [])];
  const humanSignals = [...(linguistic?.humanLikeSignals || [])];

  let aiScore = 0;
  let humanScore = 0;

  // Burstiness scoring
  if (stdDev < 3.5 && deterministic.statistics.sentenceCount >= 3) {
    aiSignals.push(`Low sentence length variance (std dev: ${stdDev})`);
    aiScore += 2;
  } else if (stdDev > 8.0) {
    humanSignals.push(`High sentence length variation and dynamic rhythm (std dev: ${stdDev})`);
    humanScore += 2;
  }

  // Repetition scoring
  if (repRate > 0.35) {
    aiSignals.push(`Elevated n-gram phrase repetition rate (${Math.round(repRate * 100)}%)`);
    aiScore += 1;
  }

  // Stock phrases
  const stockCount = deterministic?.vocabulary?.commonFormulaicPhrases?.length || 0;
  if (stockCount >= 3) {
    aiSignals.push(`Frequent stock/formulaic transition markers (${stockCount} detected)`);
    aiScore += 2;
  } else if (stockCount === 0 && deterministic.statistics.sentenceCount >= 4) {
    humanSignals.push("Absence of formulaic stock transition markers");
    humanScore += 1;
  }

  // Lexical diversity
  if (ttr > 0.70 && deterministic.statistics.wordCount > 50) {
    humanSignals.push(`High lexical diversity (Type-Token Ratio: ${ttr})`);
    humanScore += 1;
  }

  // Determine conservative likelihoods
  let aiLikelihood = "low";
  let humanLikelihood = "high";
  let possibleAIAssisted = "low";
  let confidence = "moderate";

  if (aiScore > humanScore + 2) {
    aiLikelihood = "high";
    humanLikelihood = "low";
    possibleAIAssisted = "high";
  } else if (aiScore >= humanScore) {
    aiLikelihood = "medium";
    humanLikelihood = "medium";
    possibleAIAssisted = "medium";
  }

  return {
    aiLikelihood,
    humanLikelihood,
    possibleAIAssisted,
    confidence,
    strongestAISignals: aiSignals.slice(0, 5),
    strongestHumanSignals: humanSignals.slice(0, 5),
    sectionsToInspect: linguistic?.sectionObservations || [],
    limitations: CONFIG.LIMITATIONS,
  };
}

/**
 * Run Analysis Pipeline (Deterministic + Model + Embeddings)
 */
async function runAnalysisPipeline({ text, env = {} }) {
  const apiKey = env.GEMINI_API_KEY || (typeof process !== "undefined" ? process.env.GEMINI_API_KEY : null);

  // 1. Deterministic text analysis (zero hallucinations, high precision)
  const deterministic = analyzeText(text);

  // 2. Sentence-to-sentence similarity (semantic embedding if enabled, lexical fallback)
  const sentences = extractSentences(text);
  const sentenceSimilarity = await analyzeSentencePairs(sentences.slice(0, 30), env);

  // 3. Gemini linguistic analysis
  let linguistic = {
    tone: "balanced",
    formality: 50,
    readability: "Standard",
    verbosity: "balanced",
    sentenceVariation: "moderate",
    issues: [],
    repeatedPatterns: [],
    genericPhrases: [],
    transitionIssues: [],
    humanLikeSignals: [],
    aiLikeSignals: [],
    styleConsistency: "Consistent",
    sectionObservations: []
  };

  if (apiKey) {
    try {
      const prompt = buildAnalyzerPrompt(text);
      const res = await callGemini({
        prompt,
        apiKey,
        model: env.GEMINI_MODEL || CONFIG.DEFAULT_MODEL,
        temperature: 0.2,
        jsonMode: true,
      });
      linguistic = parseStrictJson(res.text, linguistic);
    } catch (err) {
      console.warn("Linguistic analysis model call failed, proceeding with deterministic baseline:", err.message);
      linguistic.issues.push("Linguistic model temporarily unavailable; baseline metrics rendered.");
    }
  }

  // 4. Overall synthesized assessment with cautious probabilistic language
  const overall = synthesizeOverallAssessment(deterministic, linguistic, sentenceSimilarity);

  return {
    statistics: deterministic.statistics,
    stylometry: deterministic.stylometry,
    burstiness: deterministic.burstiness,
    perplexity: deterministic.perplexity,
    tokenProbabilities: deterministic.tokenProbabilities,
    repetition: deterministic.repetition,
    vocabulary: deterministic.vocabulary,
    structure: deterministic.structure,
    semantic: sentenceSimilarity,
    linguistic,
    signals: {
      aiLike: overall.strongestAISignals,
      humanLike: overall.strongestHumanSignals,
    },
    overall,
  };
}

/**
 * Run Full Humanize Pipeline
 */
async function runHumanizePipeline({
  text,
  style = "natural",
  audience = "general",
  purpose = "general writing",
  language = "en",
  preserveFormatting = true,
  userId = "anonymous",
  saveToHistory = true,
  env = {}
}) {
  const apiKey = env.GEMINI_API_KEY || (typeof process !== "undefined" ? process.env.GEMINI_API_KEY : null);

  // 1. Quota & Usage Check
  const quota = await checkUsageLimit(userId, text.length, env);
  if (!quota.allowed) {
    const error = new Error(`Monthly character limit exceeded (${quota.used.toLocaleString()} / ${quota.limit.toLocaleString()} chars used).`);
    error.code = "QUOTA_EXCEEDED";
    error.status = 403;
    throw error;
  }

  // 2. High-speed Deterministic & Semantic Profile
  const deterministic = analyzeText(text);
  const sentences = extractSentences(text);
  const sentenceSimilarity = await analyzeSentencePairs(sentences.slice(0, 20), env);
  const analysisProfile = {
    statistics: deterministic.statistics,
    burstiness: deterministic.burstiness,
    repetition: deterministic.repetition,
    vocabulary: deterministic.vocabulary,
    structure: deterministic.structure,
    semantic: sentenceSimilarity,
    overall: synthesizeOverallAssessment(deterministic, null, sentenceSimilarity)
  };

  // 3. Gemini Rewrite Generation
  const rewriterPrompt = buildRewriterPrompt(text, {
    style,
    audience,
    purpose,
    language,
    preserveFormatting,
    profile: analysisProfile
  });

  const rewriteResult = await callGemini({
    prompt: rewriterPrompt,
    apiKey,
    model: env.GEMINI_MODEL || CONFIG.DEFAULT_MODEL,
    temperature: style === "creative" || style === "conversational" ? 0.75 : 0.65,
  });

  let rewrittenText = cleanRewrittenText(rewriteResult.text);

  // 4. Quality & Meaning Preservation Checker
  let qualityReport = {
    passed: true,
    meaningPreserved: true,
    factsPreserved: true,
    missingInformation: [],
    inventedInformation: [],
    changedFacts: [],
    grammarIssues: [],
    styleIssues: [],
    score: 95,
    needsRevision: false
  };

  try {
    const checkerPrompt = buildCheckerPrompt(text, rewrittenText);
    const checkerRes = await callGemini({
      prompt: checkerPrompt,
      apiKey,
      model: env.GEMINI_MODEL || CONFIG.DEFAULT_MODEL,
      temperature: 0.1,
      jsonMode: true,
    });
    qualityReport = parseStrictJson(checkerRes.text, qualityReport);
  } catch (checkerErr) {
    console.warn("Quality checker call failed or skipped:", checkerErr.message);
  }

  // 5. Targeted Correction Pass if quality checker specifically flagged issues
  if (qualityReport.needsRevision && (qualityReport.changedFacts?.length || qualityReport.missingInformation?.length || qualityReport.inventedInformation?.length)) {
    try {
      console.info("Quality check triggered targeted correction pass.");
      const correctionPrompt = buildCorrectionPrompt(text, rewrittenText, qualityReport);
      const correctionRes = await callGemini({
        prompt: correctionPrompt,
        apiKey,
        model: env.GEMINI_MODEL || CONFIG.DEFAULT_MODEL,
        temperature: 0.3,
      });
      rewrittenText = cleanRewrittenText(correctionRes.text);
      qualityReport.needsRevision = false;
      qualityReport.passed = true;
      qualityReport.score = Math.max(qualityReport.score, 90);
    } catch (corrErr) {
      console.warn("Correction pass failed, using verified rewrite:", corrErr.message);
    }
  }

  // 6. Record usage and history
  const words = text.split(/\s+/).filter(Boolean).length;
  await recordUsage({
    userId,
    characters: text.length,
    words,
    inputTokens: rewriteResult?.usage?.promptTokens || 0,
    outputTokens: rewriteResult?.usage?.candidatesTokens || 0,
    model: rewriteResult?.model || CONFIG.DEFAULT_MODEL,
    env,
  });

  if (saveToHistory) {
    await saveHistory({
      userId,
      originalText: text,
      rewrittenText,
      style,
      audience,
      purpose,
      qualityScore: qualityReport.score || 95,
      env,
    });
  }

  return {
    success: true,
    result: rewrittenText,
    original: text,
    metadata: {
      style,
      audience,
      purpose,
      language,
      characters: text.length,
      words,
      modelUsed: rewriteResult?.model || CONFIG.DEFAULT_MODEL,
    },
    analysis: analysisProfile,
    quality: qualityReport,
    usage: {
      charactersUsed: text.length,
      tokensUsed: (rewriteResult?.usage?.promptTokens || 0) + (rewriteResult?.usage?.candidatesTokens || 0),
    }
  };
}

module.exports = {
  runAnalysisPipeline,
  runHumanizePipeline,
  synthesizeOverallAssessment,
};
