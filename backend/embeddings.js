/**
 * Embeddings and Sentence-to-Sentence Similarity Engine
 */

// Cosine similarity between two numerical vectors
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) {
    return 0;
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Token-based Jaccard Lexical Similarity (deterministic fallback)
function lexicalJaccardSimilarity(sentenceA, sentenceB) {
  const getTokens = (str) => new Set((str.toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => w.length > 2));
  const setA = getTokens(sentenceA);
  const setB = getTokens(sentenceB);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  setA.forEach(token => {
    if (setB.has(token)) intersection++;
  });
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? Math.round((intersection / union) * 100) / 100 : 0;
}

/**
 * Get embedding vector using configured provider (Gemini or Workers AI)
 */
async function getEmbedding(text, env = {}) {
  const apiKey = env.GEMINI_API_KEY || (typeof process !== "undefined" ? process.env.GEMINI_API_KEY : null);

  // If Cloudflare Workers AI binding is available
  if (env.AI && typeof env.AI.run === "function") {
    try {
      const response = await env.AI.run("@cf/baai/bge-base-en-v1.5", { text: [text] });
      if (response && response.data && response.data[0]) {
        return { available: true, vector: response.data[0], provider: "cloudflare-workers-ai" };
      }
    } catch (e) {
      console.warn("Workers AI embedding failed, falling back:", e.message);
    }
  }

  // If Gemini Embedding API is configured
  if (apiKey && env.ENABLE_EMBEDDINGS === "true") {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/text-embedding-004",
          content: { parts: [{ text }] }
        })
      });
      if (res.ok) {
        const data = await res.json();
        const values = data?.embedding?.values;
        if (Array.isArray(values) && values.length > 0) {
          return { available: true, vector: values, provider: "gemini-text-embedding-004" };
        }
      }
    } catch (e) {
      console.warn("Gemini embedding request failed:", e.message);
    }
  }

  // Never pretend embeddings were calculated
  return {
    available: false,
    vector: null,
    provider: null,
    explanation: "Semantic embedding provider is not active or not explicitly enabled. Lexical fallback similarity is used for sentence-to-sentence comparison."
  };
}

/**
 * Analyze similarity between adjacent sentences
 */
async function analyzeSentencePairs(sentences, env = {}) {
  if (!sentences || sentences.length < 2) {
    return {
      available: false,
      method: "none",
      pairs: [],
      highSimilarityPairs: [],
      summary: "Insufficient sentences to evaluate neighbor transitions."
    };
  }

  const embeddingCheck = await getEmbedding(sentences[0], env);
  const isSemantic = embeddingCheck.available;

  const pairs = [];
  const highSimilarityPairs = [];

  for (let i = 0; i < sentences.length - 1; i++) {
    const s1 = sentences[i];
    const s2 = sentences[i + 1];

    let score = 0;
    if (isSemantic) {
      const emb1 = await getEmbedding(s1, env);
      const emb2 = await getEmbedding(s2, env);
      if (emb1.available && emb2.available) {
        score = Math.round(cosineSimilarity(emb1.vector, emb2.vector) * 100) / 100;
      } else {
        score = lexicalJaccardSimilarity(s1, s2);
      }
    } else {
      score = lexicalJaccardSimilarity(s1, s2);
    }

    const pairData = {
      index: i + 1,
      sentenceA: s1.length > 90 ? s1.slice(0, 87) + "…" : s1,
      sentenceB: s2.length > 90 ? s2.slice(0, 87) + "…" : s2,
      similarityScore: score,
      potentialIssue: score > 0.65 ? "Potential redundant restatement or high semantic overlap" : (score < 0.05 ? "Abrupt contextual transition" : null)
    };

    pairs.push(pairData);
    if (pairData.potentialIssue) {
      highSimilarityPairs.push(pairData);
    }
  }

  return {
    available: isSemantic,
    method: isSemantic ? "cosine_vector_embedding" : "lexical_jaccard_overlap",
    provider: isSemantic ? embeddingCheck.provider : "deterministic_lexical",
    pairs: pairs.slice(0, 15),
    highSimilarityPairs,
    explanation: isSemantic
      ? "Semantic vector embeddings were successfully computed and compared via cosine similarity."
      : "Semantic vector embeddings were not enabled. Lexical word overlap (Jaccard index) was calculated and labeled explicitly as lexical similarity."
  };
}

module.exports = {
  cosineSimilarity,
  lexicalJaccardSimilarity,
  getEmbedding,
  analyzeSentencePairs,
};
