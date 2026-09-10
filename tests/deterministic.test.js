const test = require("node:test");
const assert = require("node:assert/strict");
const {
  analyzeText,
  extractSentences,
  extractParagraphs,
  extractWords,
  calculateVarianceAndStdDev,
  computeNgrams,
} = require("../backend/deterministic-analyzer");
const { validateHumanizeInput, validateAnalyzeInput } = require("../backend/validator");
const { cosineSimilarity, lexicalJaccardSimilarity } = require("../backend/embeddings");

test("extractSentences handles abbreviations and punctuation properly", () => {
  const sample = "Dr. Smith arrived at 8 a.m. He delivered the report. Was it accurate? Yes, it was!";
  const sentences = extractSentences(sample);
  assert.equal(sentences.length, 4);
  assert.match(sentences[0], /Dr\.\s*Smith/);
  assert.equal(sentences[2], "Was it accurate?");
});

test("calculateVarianceAndStdDev calculates correct mathematical values", () => {
  const values = [10, 10, 10, 10];
  const res = calculateVarianceAndStdDev(values, 10);
  assert.equal(res.variance, 0);
  assert.equal(res.stdDev, 0);

  const varied = [2, 4, 4, 4, 5, 5, 7, 9];
  // mean = 40 / 8 = 5
  // sum sq diff = (9 + 1 + 1 + 1 + 0 + 0 + 4 + 16) = 32
  // variance = 32 / 8 = 4, stdDev = 2
  const res2 = calculateVarianceAndStdDev(varied, 5);
  assert.equal(res2.variance, 4);
  assert.equal(res2.stdDev, 2);
});

test("computeNgrams correctly computes bigrams and trigrams", () => {
  const words = ["the", "quick", "brown", "fox", "the", "quick", "brown"];
  const bigrams = computeNgrams(words, 2);
  assert.equal(bigrams["the quick"], 2);
  assert.equal(bigrams["quick brown"], 2);
  assert.equal(bigrams["brown fox"], 1);

  const trigrams = computeNgrams(words, 3);
  assert.equal(trigrams["the quick brown"], 2);
});

test("analyzeText produces comprehensive deterministic metrics", () => {
  const sampleText = `
In today's fast-paced world, it is important to note that technology plays a crucial role in our lives. Furthermore, we must understand the core implications of this trend.

However, artificial intelligence presents unique challenges. We must proceed with care.
  `.trim();

  const report = analyzeText(sampleText);

  // Structural counts
  assert.ok(report.statistics.characterCount > 100);
  assert.ok(report.statistics.wordCount > 25);
  assert.equal(report.statistics.paragraphCount, 2);
  assert.equal(report.statistics.sentenceCount, 4);

  // Vocabulary & Type Token Ratio
  assert.ok(report.statistics.vocabularySize > 15);
  assert.ok(report.statistics.typeTokenRatio > 0 && report.statistics.typeTokenRatio <= 1);

  // Punctuation
  assert.ok(report.stylometry.punctuationDistribution.commas >= 2);
  assert.ok(report.stylometry.punctuationDistribution.periods >= 3);

  // Formulaic phrases detection
  const formulaic = report.vocabulary.commonFormulaicPhrases.map((p) => p.phrase);
  assert.ok(formulaic.includes("in today's fast-paced world"));
  assert.ok(formulaic.includes("it is important to note"));
  assert.ok(formulaic.includes("plays a crucial role"));

  // Transition frequencies
  const transitions = report.vocabulary.transitionFrequencies.map((t) => t.phrase);
  assert.ok(transitions.includes("furthermore"));
  assert.ok(transitions.includes("however"));

  // Perplexity is explicitly marked unavailable (never fabricated!)
  assert.equal(report.perplexity.available, false);
  assert.equal(report.perplexity.value, null);
  assert.ok(report.perplexity.explanation.includes("probabilities"));

  // Burstiness metrics exist
  assert.ok(report.burstiness.sentenceLengthStdDev >= 0);
  assert.ok(typeof report.burstiness.interpretation === "string");
});

test("cosineSimilarity and lexical similarity behave correctly", () => {
  const vecA = [1, 0, 1];
  const vecB = [1, 0, 1];
  assert.equal(Math.round(cosineSimilarity(vecA, vecB) * 100) / 100, 1);

  const vecC = [0, 1, 0];
  assert.equal(cosineSimilarity(vecA, vecC), 0);

  const jaccard = lexicalJaccardSimilarity(
    "The economic impact was significant and widespread.",
    "The economic consequences were widespread across markets."
  );
  assert.ok(jaccard > 0);
});

test("validator enforces schema constraints and default fallbacks", () => {
  const valid = validateHumanizeInput({
    text: "Here is a test paragraph for validation.",
    style: "academic",
    audience: "students",
    purpose: "essay"
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.data.style, "academic");
  assert.equal(valid.data.audience, "students");

  const invalidEmpty = validateHumanizeInput({ text: "   " });
  assert.equal(invalidEmpty.valid, false);

  const invalidType = validateHumanizeInput(null);
  assert.equal(invalidType.valid, false);

  const analyzeRes = validateAnalyzeInput({ text: "Analyze this sentence." });
  assert.equal(analyzeRes.valid, true);
});

test("cleanRewrittenText strips conversational AI preambles and code fences", () => {
  const { cleanRewrittenText } = require("../backend/prompts/rewriter");
  const raw = "Here is the rewritten text:\n\nThe project finished ahead of schedule in Q3.";
  assert.equal(cleanRewrittenText(raw), "The project finished ahead of schedule in Q3.");

  const withFences = "```markdown\nThis is pure text.\n```";
  assert.equal(cleanRewrittenText(withFences), "This is pure text.");
});
