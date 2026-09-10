/**
 * Dedicated Rewriter Prompt
 */
const REWRITER_PROMPT_VERSION = "1.0.0";

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

function buildRewriterPrompt(text, { style = "natural", audience = "general", purpose = "general writing", language = "en", preserveFormatting = true, profile = {} }) {
  const styleGuide = STYLE_INSTRUCTIONS[style] || STYLE_INSTRUCTIONS.natural;

  // Summarize issues to address if profile is provided
  const issuesToAvoid = [];
  if (profile?.linguistic?.issues?.length) {
    issuesToAvoid.push(...profile.linguistic.issues.slice(0, 4));
  }
  if (profile?.vocabulary?.commonFormulaicPhrases?.length) {
    issuesToAvoid.push(`Avoid formulaic clichés like: ${profile.vocabulary.commonFormulaicPhrases.map(p => `"${p.phrase}"`).join(", ")}`);
  }
  if (profile?.repetition?.repeatedOpenings?.length) {
    issuesToAvoid.push(`Vary sentence openings (previously repeated: ${profile.repetition.repeatedOpenings.map(o => `"${o.opening}"`).join(", ")})`);
  }

  const issuesSection = issuesToAvoid.length > 0
    ? `\nPRIORITY ISSUES IDENTIFIED IN ORIGINAL TEXT:\n${issuesToAvoid.map(i => `- ${i}`).join("\n")}`
    : "";

  return `You are an elite semantic rewriting engine. Your mission is to rewrite the user's content so that it flows naturally, clearly, and engagingly for the target audience while rigorously preserving every factual claim and the author's exact intent.

TARGET SPECIFICATIONS:
- Style: ${style} (${styleGuide})
- Target Audience: ${audience}
- Document Purpose: ${purpose}
- Language: ${language}
- Preserve Formatting: ${preserveFormatting ? "Yes (preserve paragraphs, bullet points, headers, and code fences)" : "Standardize into clean paragraphs"}
${issuesSection}

STRICT PRESERVATION RULES (ZERO COMPROMISE):
1. FACTS & NUMBERS: Preserve all factual claims, data points, statistics, dates, quantities, and mathematical statements.
2. NAMES & CITATIONS: Preserve all proper nouns, author names, brand names, technical identifiers, and bibliographic citations.
3. QUOTATIONS: Preserve exact text within quotation marks, code blocks, or URLs without altering a single character.
4. MODALITY & QUALIFICATIONS: Preserve author position, hedging, doubts, hypotheses, and conclusions. Never invent new facts or alter arguments.
5. NO FABRICATED IMPERFECTIONS: Do NOT deliberately introduce typos, grammatical mistakes, or slang to mimic human flaws. Natural writing is well-crafted, not sloppy.
6. NO METADATA OR COMMENTARY: Return ONLY the rewritten content. Never output phrases like "Here is your rewritten text", "Sure!", or summary notes.

IMPROVEMENT OBJECTIVES:
- Vary sentence length dynamically (intermix punchy short sentences with complex compound thoughts).
- Replace clichéd formulaic transitions ("Furthermore", "Moreover", "In conclusion", "At its core") with organic contextual transitions.
- Eliminate throat-clearing fluff, passive-voice drag, and robotic symmetry.

ORIGINAL TEXT:
"""
${text}
"""`;
}

function cleanRewrittenText(text) {
  if (!text || typeof text !== "string") return "";
  let cleaned = text.trim();

  // Strip conversational AI prefixes
  const prefixes = [
    /^here\s+is\s+the\s+rewritten\s+text[:\s—-]*/i,
    /^here\s+is\s+the\s+rewritten\s+version[:\s—-]*/i,
    /^here'?s\s+the\s+rewritten[:\s—-]*/i,
    /^i\s+have\s+rewritten[:\s—-]*/i,
    /^as\s+an\s+ai[:\s—-]*/i,
    /^sure,?\s*here\s+is[:\s—-]*/i,
    /^certainly,?\s*here\s+is[:\s—-]*/i,
    /^rewritten\s+text:?\s*/i,
    /^output:?\s*/i
  ];
  for (const p of prefixes) {
    if (p.test(cleaned)) {
      cleaned = cleaned.replace(p, "").trim();
    }
  }

  // Strip markdown fences if present
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z0-9_-]*\n?/, "").replace(/\n?```$/, "").trim();
  }

  return cleaned;
}

module.exports = {
  REWRITER_PROMPT_VERSION,
  buildRewriterPrompt,
  cleanRewrittenText,
};
