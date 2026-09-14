/**
 * Targeted AI-Signal Reduction Pass Prompt
 *
 * Runs after the initial rewrite when deterministic post-rewrite analysis
 * shows the output still reads as AI-like (low sentence-length variance,
 * surviving formulaic phrases, elevated n-gram repetition). Unlike the
 * initial rewrite, this pass targets the SPECIFIC surviving metrics rather
 * than issuing generic "sound more natural" instructions again.
 */
const DEAI_PASS_PROMPT_VERSION = "1.0.0";

function buildDeAiPassPrompt(rewrittenText, postRewriteAssessment) {
  const issues = [];
  const det = postRewriteAssessment?.deterministic || {};

  const stdDev = det?.burstiness?.sentenceLengthStdDev;
  if (typeof stdDev === "number" && stdDev < 3.5) {
    issues.push(
      `SENTENCE RHYTHM IS STILL TOO UNIFORM (std dev: ${stdDev}). Deliberately mix very short sentences (3-6 words) with longer, more complex ones. Break up any run of similarly-sized sentences.`
    );
  }

  const repRate = det?.repetition?.ngrams?.repetitionRate;
  if (typeof repRate === "number" && repRate > 0.35) {
    issues.push(
      `PHRASE REPETITION IS STILL ELEVATED (${Math.round(repRate * 100)}%). Reword repeated multi-word phrases so the same construction does not recur.`
    );
  }

  const stockPhrases = det?.vocabulary?.commonFormulaicPhrases || [];
  if (stockPhrases.length > 0) {
    issues.push(
      `THESE FORMULAIC PHRASES ARE STILL PRESENT: ${stockPhrases.map((p) => `"${p.phrase}"`).join(", ")}. Replace each with a contextual, non-formulaic transition or remove it if the sentence reads fine without one.`
    );
  }

  const openings = det?.repetition?.repeatedOpenings || [];
  if (openings.length > 0) {
    issues.push(
      `THESE SENTENCE OPENINGS ARE STILL REPEATED: ${openings.map((o) => `"${o.opening}"`).join(", ")}. Vary how sentences begin.`
    );
  }

  if (issues.length === 0) {
    issues.push(
      "The text still reads as mechanically uniform. Increase natural variation in sentence length, structure, and phrasing throughout."
    );
  }

  return `You are performing a targeted stylistic pass on a draft that has already been rewritten once. Deterministic analysis of THIS DRAFT (not the original) found it still carries specific AI-like statistical patterns, listed below. Fix ONLY these patterns.

SPECIFIC PATTERNS STILL PRESENT IN THIS DRAFT:
${issues.map((i) => `- ${i}`).join("\n")}

STRICT RULES:
- Do NOT change any facts, numbers, names, dates, quotations, URLs, or citations from this draft.
- Do NOT introduce typos, grammatical errors, or slang to fake imperfection.
- Do NOT add new claims or remove existing information.
- Focus changes narrowly on sentence rhythm, phrase repetition, and formulaic transitions — leave everything else as-is.
- Return ONLY the revised text. No explanations, no meta-commentary.

CURRENT DRAFT:
"""
${rewrittenText}
"""`;
}

module.exports = {
  DEAI_PASS_PROMPT_VERSION,
  buildDeAiPassPrompt,
};