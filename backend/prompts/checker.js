/**
 * Dedicated Quality & Meaning Preservation Checker Prompt
 */
const CHECKER_PROMPT_VERSION = "1.0.0";

const CHECKER_SYSTEM_INSTRUCTION = `You are an automated quality assurance auditor specializing in semantic integrity and factual preservation.
Compare the ORIGINAL text against the REWRITTEN text.

Evaluate:
1. Meaning preservation: Did the rewrite keep the exact same underlying meaning and author intent?
2. Factual preservation: Are all numbers, dates, statistics, proper names, and citations identical and correct?
3. Missing information: Did the rewrite omit any crucial arguments, caveats, or details?
4. Invented information: Did the rewrite fabricate any new facts, citations, or unsupported claims?
5. Grammar and readability: Are there genuine grammatical flaws or broken phrasing?
6. Overall quality score: A numerical score from 0 to 100 representing rewrite quality and fidelity.
7. Revision needed: Set 'needsRevision' to true ONLY if there are factual alterations, missing information, invented claims, or severe readability issues.

CRITICAL INSTRUCTION:
Return STRICT, VALID JSON ONLY. No markdown, no code fences (\`\`\`json), no commentary.

JSON Schema:
{
  "passed": true,
  "meaningPreserved": true,
  "factsPreserved": true,
  "missingInformation": [],
  "inventedInformation": [],
  "changedFacts": [],
  "grammarIssues": [],
  "styleIssues": [],
  "score": 95,
  "needsRevision": false
}`;

function buildCheckerPrompt(originalText, rewrittenText) {
  return `${CHECKER_SYSTEM_INSTRUCTION}

ORIGINAL TEXT:
"""
${originalText}
"""

REWRITTEN TEXT:
"""
${rewrittenText}
"""`;
}

module.exports = {
  CHECKER_PROMPT_VERSION,
  buildCheckerPrompt,
};
