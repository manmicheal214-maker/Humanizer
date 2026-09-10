const { GoogleGenAI } = require("@google/genai");

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;

const intensityInstructions = {
  light: "Make minimal stylistic changes (roughly 10–20%). Fix awkward wording, obvious repetition, and overly formal phrasing without restructuring unnecessarily.",
  balanced: "Make noticeable but conservative changes (roughly 20–40%). Improve sentence structure, paragraph flow, transitions, repetition, vocabulary, readability, and sentence-length variety.",
  strong: "Make substantial stylistic changes while preserving meaning. Restructure sentences and paragraphs, combine or split sentences where natural, and reduce repetitive patterns. Never invent, omit, or reinterpret information."
};

const SYSTEM_PROMPT = `You are a semantic rewriting engine. Rewrite the user's text to make it clearer, more natural, readable, and stylistically varied while preserving the author's intended meaning.

STRICT RULES:
1. Preserve factual claims, names, dates, numbers, measurements, technical terms, citations, references, URLs, and conclusions.
2. Preserve quotations exactly. Never rewrite text inside quotation marks, code fences, inline code, or URLs.
3. Preserve negation, uncertainty, hedging, qualifications, modality, and the author's position.
4. Do not invent facts, examples, sources, citations, or evidence. Do not add information.
5. Do not remove important information or materially shorten the substance.
6. Do not change mathematical values, equations, identifiers, or code.
7. Maintain the original language unless explicitly requested otherwise.
8. Avoid synonym substitution when it makes the writing less natural or changes technical meaning.
9. Return ONLY the rewritten text. Never add a preface, explanation, labels, or meta-commentary.

Improve sentence variety, natural phrasing, readability, transitions, clarity, conciseness, paragraph flow, and unnecessary repetition. Avoid inflated vocabulary, generic filler, repetitive sentence openings, excessive formal language, and formulaic conclusions.`;

const META_PREFIXES = [
  /^here\s+is\s+the\s+rewritten\s+text/i,
  /^here\s+is\s+the\s+rewritten\s+version/i,
  /^here'?s\s+the\s+rewritten/i,
  /^i\s+have\s+rewritten/i,
  /^as\s+an\s+ai/i,
  /^sure,?\s*here\s+is/i,
  /^certainly,?\s*here\s+is/i,
  /^of\s+course,?\s*here\s+is/i,
  /^below\s+is\s+the\s+rewritten/i,
  /^the\s+rewritten\s+text\s+is/i,
  /^rewritten\s+text:/i,
  /^rewritten\s+version:/i,
  /^output:/i,
  /^result:/i,
];

function stripMetaPrefix(text) {
  for (const re of META_PREFIXES) {
    if (re.test(text)) {
      text = text.replace(re, "").replace(/^[\s:—-]+/, "").trim();
    }
  }
  return text;
}

function cleanRewrittenOutput(raw) {
  if (!raw || typeof raw !== "string") return "";
  let text = raw.trim();
  text = stripMetaPrefix(text);
  if (text.startsWith("```") && text.endsWith("```")) {
    text = text.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
  }
  return text;
}

let aiClient = null;
function getAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("AI service is not configured. GEMINI_API_KEY is missing.");
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function rewriteText(text, intensity = "balanced") {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("AI service is not configured. Please set the GEMINI_API_KEY environment variable.");
  }

  const prompt = `${SYSTEM_PROMPT}\n\nREWRITE INTENSITY:\n${intensityInstructions[intensity] || intensityInstructions.balanced}\n\nUSER TEXT:\n${text}`;

  // Try @google/genai SDK first
  try {
    const ai = getAIClient();
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        temperature: intensity === "strong" ? 0.8 : 0.65,
        topP: 0.9,
        maxOutputTokens: 8192,
      },
    });

    const output = cleanRewrittenOutput(response?.text || "");
    if (output) return output;
  } catch (sdkError) {
    console.warn("SDK generation failed, falling back to direct REST fetch:", sdkError.message);
  }

  // Fallback to direct REST fetch with retry
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response;
    try {
      response = await fetch(`${API_URL}?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: intensity === "strong" ? 0.8 : 0.65,
            topP: 0.9,
            maxOutputTokens: 8192,
          },
        }),
      });
    } catch (error) {
      if (attempt === 0) {
        await sleep(500);
        continue;
      }
      throw error;
    }

    if (response.ok) {
      const data = await response.json();
      const raw = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim();
      const output = cleanRewrittenOutput(raw);
      if (!output) throw new Error("The rewriting service returned no usable text.");
      return output;
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt === 0) {
      await sleep(500);
      continue;
    }

    let detail = "";
    try {
      detail = (await response.json())?.error?.message || "";
    } catch {}
    console.error("Gemini request failed:", response.status, detail.slice(0, 160));
    throw new Error("The rewriting service is temporarily unavailable.");
  }

  throw new Error("The rewriting service is temporarily unavailable.");
}

module.exports = { rewriteText };
