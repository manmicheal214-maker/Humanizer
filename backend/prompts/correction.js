/**
 * Dedicated Correction Pass Prompt
 */
const CORRECTION_PROMPT_VERSION = "1.0.0";

function buildCorrectionPrompt(originalText, rewrittenText, qualityReport) {
  const issues = [];
  if (qualityReport.changedFacts?.length) {
    issues.push(`RESTORE ALTERED FACTS: ${qualityReport.changedFacts.join("; ")}`);
  }
  if (qualityReport.missingInformation?.length) {
    issues.push(`RESTORE MISSING INFO: ${qualityReport.missingInformation.join("; ")}`);
  }
  if (qualityReport.inventedInformation?.length) {
    issues.push(`REMOVE INVENTED CLAIMS: ${qualityReport.inventedInformation.join("; ")}`);
  }
  if (qualityReport.grammarIssues?.length) {
    issues.push(`FIX GRAMMATICAL FLAWS: ${qualityReport.grammarIssues.join("; ")}`);
  }

  return `You are performing a targeted correction pass on a rewritten document.
A quality inspection detected specific fidelity issues in the draft rewrite compared to the original text.

SPECIFIC ISSUES TO FIX:
${issues.map(i => `- ${i}`).join("\n")}

STRICT INSTRUCTIONS:
- Fix ONLY the identified issues. Do not re-write parts that are already fluent and accurate.
- Strictly restore all original facts, names, numbers, or omitted information.
- Remove any unverified or invented claims.
- Return ONLY the corrected rewritten text. Never include explanations, apologies, or meta-notes.

ORIGINAL REFERENCE TEXT:
"""
${originalText}
"""

CURRENT REWRITTEN DRAFT:
"""
${rewrittenText}
"""`;
}

module.exports = {
  CORRECTION_PROMPT_VERSION,
  buildCorrectionPrompt,
};
