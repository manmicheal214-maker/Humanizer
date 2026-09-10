/**
 * TextMy AI Humanizer - Cloudflare Worker
 * 100% Free Tier compatible (100,000 requests/day).
 *
 * Setup in Cloudflare Dashboard:
 * 1. Go to Workers & Pages -> your worker (latesttextmy-api)
 * 2. Click "Edit code" and replace with this file.
 * 3. Go to Settings -> Variables and Secrets -> Add secret: GEMINI_API_KEY
 * 4. Click "Deploy"
 */

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

Improve sentence variety, natural phrasing, readability, transitions, clarity, conciseness, paragraph flow, and unnecessary repetition.`;

const intensityInstructions = {
  light: "Make minimal stylistic changes (roughly 10–20%). Fix awkward wording, obvious repetition, and overly formal phrasing without restructuring unnecessarily.",
  balanced: "Make noticeable but conservative changes (roughly 20–40%). Improve sentence structure, paragraph flow, transitions, repetition, vocabulary, readability, and sentence-length variety.",
  strong: "Make substantial stylistic changes while preserving meaning. Restructure sentences and paragraphs, combine or split sentences where natural, and reduce repetitive patterns. Never invent, omit, or reinterpret information."
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function stripMetaPrefix(text) {
  const prefixes = [
    /^here\s+is\s+the\s+rewritten\s+text/i,
    /^here\s+is\s+the\s+rewritten\s+version/i,
    /^here'?s\s+the\s+rewritten/i,
    /^i\s+have\s+rewritten/i,
    /^as\s+an\s+ai/i,
    /^sure,?\s*here\s+is/i,
    /^certainly,?\s*here\s+is/i,
    /^below\s+is\s+the\s+rewritten/i,
    /^rewritten\s+text:/i,
    /^output:/i
  ];
  let cleaned = text.trim();
  for (const re of prefixes) {
    if (re.test(cleaned)) {
      cleaned = cleaned.replace(re, "").replace(/^[\s:—-]+/, "").trim();
    }
  }
  if (cleaned.startsWith("```") && cleaned.endsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
  }
  return cleaned;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Health check endpoint
    if ((path === "/api/health" || path === "/health" || path === "/") && request.method === "GET") {
      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Rewrite endpoint
    if ((path === "/api/rewrite" || path === "/rewrite") && request.method === "POST") {
      try {
        const apiKey = env.GEMINI_API_KEY;
        if (!apiKey) {
          return new Response(
            JSON.stringify({ error: "GEMINI_API_KEY is not configured in Cloudflare Worker secrets." }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const body = await request.json().catch(() => ({}));
        const text = typeof body.text === "string" ? body.text.trim() : "";
        const intensity = body.intensity || "balanced";

        if (!text) {
          return new Response(
            JSON.stringify({ error: "Please enter some text first." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (text.length > 20000) {
          return new Response(
            JSON.stringify({ error: "The text is too long (max 20,000 characters)." }),
            { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const prompt = `${SYSTEM_PROMPT}\n\nREWRITE INTENSITY:\n${intensityInstructions[intensity] || intensityInstructions.balanced}\n\nUSER TEXT:\n${text}`;

        const modelsToTry = [
          env.GEMINI_MODEL,
          "gemini-2.5-flash",
          "gemini-3.8-flash"
        ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

        let rewritten = "";
        let lastError = "";

        for (const model of modelsToTry) {
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
              const geminiResponse = await fetch(geminiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [{ role: "user", parts: [{ text: prompt }] }],
                  generationConfig: {
                    temperature: intensity === "strong" ? 0.8 : 0.65,
                    topP: 0.9,
                    maxOutputTokens: 8192
                  }
                })
              });

              if (geminiResponse.ok) {
                const data = await geminiResponse.json();
                const raw = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim();
                rewritten = stripMetaPrefix(raw || "");
                if (rewritten) break;
              }

              let detail = "";
              try {
                const errJson = await geminiResponse.json();
                detail = errJson?.error?.message || "";
              } catch {
                detail = await geminiResponse.text().catch(() => "");
              }

              lastError = detail || `HTTP ${geminiResponse.status}`;

              if (geminiResponse.status === 503 || geminiResponse.status === 429) {
                await new Promise((resolve) => setTimeout(resolve, 800));
                continue;
              }
              break;
            } catch (networkErr) {
              lastError = networkErr.message;
              if (attempt === 0) {
                await new Promise((resolve) => setTimeout(resolve, 500));
                continue;
              }
            }
          }

          if (rewritten) break;
        }

        if (!rewritten) {
          return new Response(
            JSON.stringify({ error: `AI provider error: ${lastError || "The model is temporarily unavailable. Please try again in a few seconds."}` }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ text: rewritten }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        console.error("Worker error:", err);
        return new Response(
          JSON.stringify({ error: "Internal server error: " + err.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(JSON.stringify({ error: "Not found." }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
};
