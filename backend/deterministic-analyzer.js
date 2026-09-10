/**
 * Deterministic Text Analysis Engine
 * Pure mathematical, statistical, and lexical analysis without model hallucinations.
 */

const COMMON_TRANSITIONS = [
  "furthermore",
  "moreover",
  "additionally",
  "however",
  "in conclusion",
  "therefore",
  "nevertheless",
  "consequently",
  "further",
  "thus",
  "hence",
  "in summary",
  "overall",
  "on the other hand",
  "specifically",
  "for example",
  "for instance",
  "in particular",
  "notably",
  "significantly",
  "meanwhile",
  "subsequently",
  "as a result",
  "ultimately",
  "to summarize",
  "in light of this",
  "it follows that",
  "first and foremost"
];

const FORMULAIC_PHRASES = [
  "it is important to note",
  "it is worth noting",
  "delve into",
  "delves into",
  "a testament to",
  "testament to",
  "in today's fast-paced world",
  "plays a crucial role",
  "plays a pivotal role",
  "rich tapestry",
  "tapestry of",
  "beacon of",
  "revolutionize the way",
  "game-changer",
  "fosters a sense",
  "at its core",
  "shed light on",
  "navigating the complexities",
  "dive deep into",
  "in summary,",
  "in conclusion,",
  "unravel the mysteries",
  "vital role",
  "paramount importance",
  "a wide array of"
];

// Split text into paragraphs
function extractParagraphs(text) {
  if (!text || typeof text !== "string") return [];
  return text
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

// Split text into sentences using boundary heuristics
function extractSentences(text) {
  if (!text || typeof text !== "string") return [];
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  // Protect internal dots in two-letter abbreviations like a.m. or i.e.
  let protectedText = normalized
    .replace(/\b([a-z])\.(?=[a-z]\.)/gi, "$1\u2024")
    .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|vol|no|fig|approx|dept|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\./gi, "$1\u2024")
    .replace(/\b([A-Z])\./g, "$1\u2024"); // initials like J. K.

  const rawMatches = protectedText.match(/[^.!?\n]+(?:[.!?]+(?=["'\s]|$)|$)/g) || [protectedText];

  return rawMatches
    .map((s) => s.replace(/\u2024/g, ".").trim())
    .filter((s) => s.length > 0);
}

// Extract words (tokens)
function extractWords(text) {
  if (!text || typeof text !== "string") return [];
  // Match word characters, allowing internal apostrophes and hyphens
  const matches = text.match(/[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*/g) || [];
  return matches;
}

// Calculate standard deviation and variance
function calculateVarianceAndStdDev(numbers, mean) {
  if (!numbers || numbers.length <= 1) {
    return { variance: 0, stdDev: 0 };
  }
  const sumSquares = numbers.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0);
  const variance = sumSquares / numbers.length;
  const stdDev = Math.sqrt(variance);
  return {
    variance: Math.round(variance * 100) / 100,
    stdDev: Math.round(stdDev * 100) / 100
  };
}

// Compute n-grams
function computeNgrams(words, n) {
  if (words.length < n) return {};
  const counts = {};
  for (let i = 0; i <= words.length - n; i++) {
    const gram = words.slice(i, i + n).join(" ");
    counts[gram] = (counts[gram] || 0) + 1;
  }
  return counts;
}

/**
 * Main Deterministic Analyzer
 */
function analyzeText(rawText) {
  const text = typeof rawText === "string" ? rawText : "";
  const trimmed = text.trim();

  // Basic character metrics
  const characterCount = text.length;
  const characterCountNoSpaces = text.replace(/\s+/g, "").length;

  // Structural breakdown
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

  // Sentence length metrics (in words)
  const sentenceLengths = sentences.map((s) => extractWords(s).length).filter((len) => len > 0);
  const minSentenceLength = sentenceLengths.length > 0 ? Math.min(...sentenceLengths) : 0;
  const maxSentenceLength = sentenceLengths.length > 0 ? Math.max(...sentenceLengths) : 0;
  const totalSentenceWords = sentenceLengths.reduce((a, b) => a + b, 0);
  const avgSentenceLength = sentenceLengths.length > 0 ? Math.round((totalSentenceWords / sentenceLengths.length) * 10) / 10 : 0;

  const { variance: sentenceLengthVariance, stdDev: sentenceLengthStdDev } = calculateVarianceAndStdDev(sentenceLengths, avgSentenceLength);

  // Average word length
  const totalWordChars = words.reduce((acc, w) => acc + w.length, 0);
  const averageWordLength = wordCount > 0 ? Math.round((totalWordChars / wordCount) * 10) / 10 : 0;

  // Paragraph length statistics
  const paragraphWordCounts = paragraphs.map((p) => extractWords(p).length);
  const minParagraphLength = paragraphWordCounts.length > 0 ? Math.min(...paragraphWordCounts) : 0;
  const maxParagraphLength = paragraphWordCounts.length > 0 ? Math.max(...paragraphWordCounts) : 0;
  const avgParagraphLength = paragraphWordCounts.length > 0 ? Math.round((wordCount / paragraphCount) * 10) / 10 : 0;

  // Sentence length distribution buckets
  const sentenceDistribution = {
    short: 0,      // <= 10 words
    medium: 0,     // 11 - 25 words
    long: 0,       // 26 - 40 words
    veryLong: 0,   // > 40 words
  };
  sentenceLengths.forEach((len) => {
    if (len <= 10) sentenceDistribution.short++;
    else if (len <= 25) sentenceDistribution.medium++;
    else if (len <= 40) sentenceDistribution.long++;
    else sentenceDistribution.veryLong++;
  });

  // Punctuation distribution
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

  // Repeated words (frequency >= 3 for non-trivial words)
  const wordFrequencies = {};
  const stopWords = new Set([
    "the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for", "not", "on", "with",
    "he", "as", "you", "do", "at", "this", "but", "his", "by", "from", "they", "we", "say", "her",
    "she", "or", "an", "will", "my", "one", "all", "would", "there", "their", "what", "so", "up",
    "out", "if", "about", "who", "get", "which", "go", "me", "when", "make", "can", "like", "time",
    "no", "just", "him", "know", "take", "person", "into", "year", "your", "good", "some", "could",
    "them", "see", "other", "than", "then", "now", "look", "only", "come", "its", "over", "think",
    "also", "back", "after", "use", "two", "how", "our", "work", "first", "well", "way", "even",
    "new", "want", "because", "any", "these", "give", "day", "most", "us", "is", "are", "was", "were"
  ]);

  lowerWords.forEach((w) => {
    if (!stopWords.has(w) && w.length > 2) {
      wordFrequencies[w] = (wordFrequencies[w] || 0) + 1;
    }
  });

  const repeatedWords = Object.entries(wordFrequencies)
    .filter(([_, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([word, count]) => ({ word, count }));

  // N-gram repetitions
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

  // Longer repeated phrases (5+ words)
  const fivegramCounts = computeNgrams(lowerWords, 5);
  const repeatedLongerPhrases = Object.entries(fivegramCounts)
    .filter(([_, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([phrase, count]) => ({ phrase, count }));

  // Repetition rate: percentage of words in repeated bigrams
  const repeatedBigramTokens = repeatedBigrams.reduce((acc, item) => acc + (item.count * 2), 0);
  const repetitionRate = wordCount > 0 ? Math.min(1, Math.round((repeatedBigramTokens / wordCount) * 100) / 100) : 0;

  // Transition word frequencies
  const lowerText = trimmed.toLowerCase();
  const transitionFrequencies = [];
  COMMON_TRANSITIONS.forEach((phrase) => {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "gi");
    const matches = lowerText.match(regex);
    if (matches && matches.length > 0) {
      transitionFrequencies.push({ phrase, count: matches.length });
    }
  });
  transitionFrequencies.sort((a, b) => b.count - a.count);

  // Common formulaic phrases
  const detectedFormulaicPhrases = [];
  FORMULAIC_PHRASES.forEach((phrase) => {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}`, "gi");
    const matches = lowerText.match(regex);
    if (matches && matches.length > 0) {
      detectedFormulaicPhrases.push({ phrase, count: matches.length });
    }
  });

  // Sentence openings repetition check
  const sentenceOpenings = {};
  sentences.forEach((s) => {
    const sWords = extractWords(s);
    if (sWords.length >= 2) {
      const opening = sWords.slice(0, 2).join(" ").toLowerCase();
      sentenceOpenings[opening] = (sentenceOpenings[opening] || 0) + 1;
    }
  });
  const repeatedOpenings = Object.entries(sentenceOpenings)
    .filter(([_, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([opening, count]) => ({ opening, count }));

  // Burstiness Interpretation
  let burstinessInterpretation = "Moderate variation across sentence lengths.";
  if (sentenceCount <= 2) {
    burstinessInterpretation = "Sample size too small for statistical sentence-length variation.";
  } else if (sentenceLengthStdDev < 4.0) {
    burstinessInterpretation = "Low variation; sentences follow a very consistent, uniform length.";
  } else if (sentenceLengthStdDev > 10.0) {
    burstinessInterpretation = "High variation with a dynamic, irregular rhythm between short and long sentences.";
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
      explanation: "Token-level probabilities were not available from the active language model. True perplexity PP = exp(-(1/N) * sum(log(P(w_i | w_<i)))) requires internal decoder log-probabilities."
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
      repeatedWords,
      ngrams: {
        bigrams: repeatedBigrams,
        trigrams: repeatedTrigrams,
        fourgrams: repeatedFourgrams,
        repeatedPhrases: repeatedLongerPhrases,
        repetitionRate,
      },
      repeatedOpenings,
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
      repeatedOpenings,
    },
  };
}

module.exports = {
  analyzeText,
  extractParagraphs,
  extractSentences,
  extractWords,
  calculateVarianceAndStdDev,
  computeNgrams,
};
