const $ = (id) => document.getElementById(id);

// Elements
const inputText = $("inputText");
const outputText = $("outputText");
const humanizeBtn = $("humanizeBtn");
const analyzeBtn = $("analyzeBtn");
const loadSampleBtn = $("loadSampleBtn");
const copyBtn = $("copyBtn");
const downloadBtn = $("downloadBtn");
const clearBtn = $("clearBtn");
const statusMsg = $("status");
const qualityBadge = $("qualityBadge");
const usageText = $("usageText");
const themeToggle = $("themeToggle");

// Options
const styleSelect = $("styleSelect");
const audienceSelect = $("audienceSelect");
const purposeSelect = $("purposeSelect");
const languageSelect = $("languageSelect");
const preserveFormattingCheckbox = $("preserveFormattingCheckbox");

// Diff View
const diffSection = $("diffSection");
const diffToggle = $("diffToggle");
const diffView = $("diffView");

// Dashboard
const analysisDashboard = $("analysisDashboard");
const closeReportBtn = $("closeReportBtn");

const SAMPLE_AI_TEXT = `In today's fast-paced world, artificial intelligence plays a crucial role in modern technological innovation. Furthermore, it is important to note that machine learning algorithms have revolutionized the way organizations approach data analysis. At its core, this rich tapestry of digital tools fosters a sense of seamless collaboration.

Moreover, organizations must navigate the complexities of digital transformation. It is worth noting that rigorous data management is paramount to achieving long-term sustainability. In conclusion, embracing these innovative solutions serves as a beacon of progress for forward-thinking enterprises.`;

function countWords(value) {
  const t = value.trim();
  return t ? t.split(/\s+/).length : 0;
}

function updateCounts() {
  $("inputCount").textContent = `${inputText.value.length.toLocaleString()} characters`;
  $("inputWords").textContent = `${countWords(inputText.value).toLocaleString()} words`;
  $("outputCount").textContent = `${outputText.value.length.toLocaleString()} characters`;
  $("outputWords").textContent = `${countWords(outputText.value).toLocaleString()} words`;
}

function setStatus(message, type = "default") {
  statusMsg.textContent = message;
  statusMsg.dataset.type = type;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// Lightweight word-level LCS diff
function wordDiff(original, rewritten) {
  const a = original.match(/\s+|[^\s]+/g) || [];
  const b = rewritten.match(/\s+|[^\s]+/g) || [];
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "same", text: a[i] });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "removed", text: a[i++] });
    } else {
      out.push({ type: "added", text: b[j++] });
    }
  }
  while (i < n) out.push({ type: "removed", text: a[i++] });
  while (j < m) out.push({ type: "added", text: b[j++] });
  return out;
}

function renderDiff(original, rewritten) {
  const parts = wordDiff(original, rewritten);
  diffView.innerHTML = parts
    .map((p) => p.type === "same"
      ? escapeHtml(p.text)
      : `<mark class="diff-${p.type}">${escapeHtml(p.text)}</mark>`)
    .join("");
  diffSection.hidden = false;
  diffView.hidden = true;
  diffToggle.textContent = "Show changes";
  diffToggle.setAttribute("aria-expanded", "false");
}

function renderTagCloud(container, items, labelKey = "phrase", countKey = "count", emptyText = "None detected") {
  if (!items || items.length === 0) {
    container.innerHTML = `<span class="tag-empty">${emptyText}</span>`;
    return;
  }
  container.innerHTML = items.map(item => {
    const label = typeof item === "string" ? item : item[labelKey];
    const count = typeof item === "object" && item[countKey] ? `<span class="tag-count">${item[countKey]}×</span>` : "";
    return `<span class="tag-item">${escapeHtml(label)}${count}</span>`;
  }).join("");
}

// Render Analysis Dashboard
function renderAnalysisReport(analysis) {
  if (!analysis) return;
  analysisDashboard.hidden = false;

  const {
    statistics = {},
    burstiness = {},
    perplexity = {},
    stylometry = {},
    repetition = {},
    vocabulary = {},
    semantic = {},
    linguistic = {},
    overall = {}
  } = analysis;

  // 1. Overall Assessment
  const aiList = $("aiSignalsList");
  const humanList = $("humanSignalsList");

  const aiSignals = overall.strongestAISignals || [];
  if (aiSignals.length > 0) {
    aiList.innerHTML = aiSignals.map(s => `<li>${escapeHtml(s)}</li>`).join("");
  } else {
    aiList.innerHTML = `<li class="signal-empty">No synthetic signals detected.</li>`;
  }

  const humanSignals = overall.strongestHumanSignals || [];
  if (humanSignals.length > 0) {
    humanList.innerHTML = humanSignals.map(s => `<li>${escapeHtml(s)}</li>`).join("");
  } else {
    humanList.innerHTML = `<li class="signal-empty">Standard baseline cadence.</li>`;
  }

  const overallBadge = $("overallBadge");
  overallBadge.textContent = `Confidence: ${overall.confidence || "Moderate"}`;

  // 2. Perplexity & Burstiness
  $("perplexityValue").textContent = perplexity.available
    ? `${perplexity.value}`
    : "Unavailable (Token-level probabilities required)";
  $("perplexityNote").textContent = perplexity.explanation || "True perplexity requires internal model log-probabilities.";

  $("meanSentenceLength").textContent = `${burstiness.sentenceLengthMean || statistics.averageSentenceLength || 0} words`;
  $("stdDevSentenceLength").textContent = `${burstiness.sentenceLengthStdDev || 0}`;
  $("burstinessInterpretation").textContent = burstiness.interpretation || "Evaluated based on sentence-length distribution.";

  // 3. Sentence-to-Sentence Transitions & Semantics
  $("semanticMethodBadge").textContent = semantic.method === "cosine_vector_embedding" ? "Cosine Vector Embeddings" : "Lexical Overlap (Jaccard)";
  $("semanticExplanation").textContent = semantic.explanation || "";

  const transContainer = $("transitionIssuesContainer");
  if (semantic.pairs && semantic.pairs.length > 0) {
    const flagged = semantic.pairs.filter(p => p.potentialIssue);
    if (flagged.length > 0) {
      transContainer.innerHTML = flagged.map(p => `
        <div class="obs-item">
          <span class="obs-title">Pair #${p.index} (${Math.round(p.similarityScore * 100)}% overlap):</span>
          <span>${escapeHtml(p.potentialIssue)}</span>
        </div>
      `).join("");
    } else {
      transContainer.innerHTML = `<div class="empty-notice">Adjacent transitions demonstrate balanced, organic progression.</div>`;
    }
  } else {
    transContainer.innerHTML = `<div class="empty-notice">Single or short passage; transition pairs not evaluated.</div>`;
  }

  // 4. Stylometry & Readability
  $("ttrValue").textContent = `${statistics.typeTokenRatio || stylometry.typeTokenRatio || 0}`;
  $("avgWordLength").textContent = `${statistics.averageWordLength || 0} chars`;
  $("vocabSizeValue").textContent = `${(statistics.vocabularySize || 0).toLocaleString()} words`;
  $("paragraphCountValue").textContent = `${statistics.paragraphCount || 1}`;

  const dist = statistics.sentenceLengthDistribution || {};
  $("distroShort").textContent = `Short (≤10): ${dist.short || 0}`;
  $("distroMedium").textContent = `Med (11-25): ${dist.medium || 0}`;
  $("distroLong").textContent = `Long (26-40): ${dist.long || 0}`;
  $("distroVeryLong").textContent = `40+: ${dist.veryLong || 0}`;

  // 5. Repetition & N-Grams
  const ngrams = repetition.ngrams || {};
  const repRate = Math.round((ngrams.repetitionRate || 0) * 100);
  $("repetitionRateBadge").textContent = `Repetition: ${repRate}%`;

  renderTagCloud($("bigramList"), ngrams.bigrams, "phrase", "count", "No repeated bigrams");
  renderTagCloud($("trigramList"), ngrams.trigrams, "phrase", "count", "No repeated trigrams");
  renderTagCloud($("fourgramList"), ngrams.fourgrams, "phrase", "count", "No repeated 4-grams");

  // 6. Vocabulary & Transitions
  renderTagCloud($("formulaicPhrasesList"), vocabulary.commonFormulaicPhrases, "phrase", "count", "No stock phrases detected");
  renderTagCloud($("transitionWordsList"), vocabulary.transitionFrequencies, "phrase", "count", "No generic transitions detected");

  // 7. Section Observations
  const obsList = $("sectionObservationsList");
  const observations = linguistic.sectionObservations || [];
  if (observations.length > 0) {
    obsList.innerHTML = observations.map((obs, idx) => `
      <div class="obs-item">
        <span class="obs-title">Section ${obs.sectionIndex || (idx + 1)}${obs.summary ? ` (${escapeHtml(obs.summary)})` : ""}:</span>
        <span>${escapeHtml(obs.observation || obs)}</span>
      </div>
    `).join("");
  } else {
    obsList.innerHTML = `<div class="empty-notice">Structural cadence is consistent across sections.</div>`;
  }
}

// Fetch Usage Quota
async function loadUsage() {
  try {
    const res = await semanticClient.getUsage();
    if (res?.usage) {
      const u = res.usage;
      usageText.textContent = `${u.plan}: ${(u.remaining || 0).toLocaleString()} chars remaining`;
    }
  } catch {
    usageText.textContent = "Quota: Free Tier";
  }
}

// Event Listeners
inputText.addEventListener("input", updateCounts);

clearBtn.addEventListener("click", () => {
  inputText.value = "";
  outputText.value = "";
  diffSection.hidden = true;
  analysisDashboard.hidden = true;
  qualityBadge.hidden = true;
  setStatus("Cleared.");
  updateCounts();
  inputText.focus();
});

loadSampleBtn.addEventListener("click", () => {
  inputText.value = SAMPLE_AI_TEXT;
  updateCounts();
  setStatus("Sample AI-formulaic text loaded. Click 'Analyze Text Only' or 'Rewrite & Humanize'.");
});

diffToggle.addEventListener("click", () => {
  const show = diffView.hidden;
  diffView.hidden = !show;
  diffToggle.textContent = show ? "Hide changes" : "Show changes";
  diffToggle.setAttribute("aria-expanded", String(show));
});

closeReportBtn.addEventListener("click", () => {
  analysisDashboard.hidden = true;
});

let rateLimitCountdown = null;

function handleRateLimitError(error) {
  let seconds = error.retryAfter;
  if (!seconds) {
    const match = (error.message || "").match(/retry in\s+([0-9.]+)\s*s/i);
    if (match) seconds = Math.ceil(parseFloat(match[1]));
  }
  if (!seconds) {
    const secMatch = (error.message || "").match(/([0-9]+)\s*seconds?/i);
    if (secMatch) seconds = parseInt(secMatch[1], 10);
  }
  if (!seconds || isNaN(seconds)) seconds = 30;

  if (rateLimitCountdown) clearInterval(rateLimitCountdown);

  let remaining = seconds;
  setStatus(`AI quota limit reached on provider. Cooldown in progress: ready in ${remaining}s…`, "error");
  humanizeBtn.disabled = true;

  rateLimitCountdown = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(rateLimitCountdown);
      rateLimitCountdown = null;
      humanizeBtn.disabled = false;
      setStatus("Cooldown complete. Ready to retry rewriting.", "default");
    } else {
      setStatus(`AI quota limit reached on provider. Cooldown in progress: ready in ${remaining}s…`, "error");
    }
  }, 1000);
}

// Humanize Action
humanizeBtn.addEventListener("click", async () => {
  if (rateLimitCountdown) {
    setStatus("Please wait for the current rate-limit cooldown to finish.", "error");
    return;
  }
  const text = inputText.value.trim();
  if (!text) {
    setStatus("Please enter some text first.", "error");
    inputText.focus();
    return;
  }
  if (text.length > 20000) {
    setStatus("Text is too long (max 20,000 characters). Please shorten it and try again.", "error");
    return;
  }

  humanizeBtn.disabled = true;
  analyzeBtn.disabled = true;
  humanizeBtn.innerHTML = '<span class="spinner"></span> Humanizing…';
  setStatus("Analyzing structure, rewriting with dynamic cadence, and auditing factual fidelity…", "loading");

  try {
    const payload = {
      text,
      style: styleSelect.value,
      audience: audienceSelect.value,
      purpose: purposeSelect.value,
      language: languageSelect.value,
      preserveFormatting: preserveFormattingCheckbox.checked,
    };

    const res = await semanticClient.humanize(payload);
    const rewritten = res.result || res.text || "";
    outputText.value = rewritten;
    updateCounts();

    renderDiff(text, rewritten);

    if (res.quality?.score) {
      qualityBadge.textContent = `Fidelity: ${res.quality.score}%`;
      qualityBadge.hidden = false;
    }

    if (res.analysis) {
      renderAnalysisReport(res.analysis);
    }

    setStatus("Rewritten with preserved meaning. Review changes before publishing.", "success");
    loadUsage();
  } catch (error) {
    console.error("Humanize failed:", error.message);
    const isRateLimit = error.status === 429 ||
      /quota|rate limit|429|retry in/i.test(error.message || "");
    if (isRateLimit) {
      handleRateLimitError(error);
    } else {
      setStatus(error.message || "Rewriting service is temporarily unavailable.", "error");
    }
  } finally {
    if (!rateLimitCountdown) {
      humanizeBtn.disabled = false;
    }
    analyzeBtn.disabled = false;
    humanizeBtn.innerHTML = "<span>✦</span> Rewrite &amp; Humanize";
  }
});

// Analyze Action
analyzeBtn.addEventListener("click", async () => {
  const text = inputText.value.trim();
  if (!text) {
    setStatus("Please enter text to analyze.", "error");
    inputText.focus();
    return;
  }

  analyzeBtn.disabled = true;
  humanizeBtn.disabled = true;
  analyzeBtn.innerHTML = '<span class="spinner"></span> Analyzing…';
  setStatus("Running deterministic and linguistic analysis…", "loading");

  try {
    const res = await semanticClient.analyze({ text });
    if (res.analysis) {
      renderAnalysisReport(res.analysis);
      setStatus("Analysis complete. Detailed metrics displayed below.", "success");
    } else {
      setStatus("Analysis completed with baseline metrics.", "default");
    }
  } catch (error) {
    console.error("Analysis failed:", error.message);
    const isRateLimit = error.status === 429 ||
      /quota|rate limit|429|retry in/i.test(error.message || "");
    if (isRateLimit) {
      handleRateLimitError(error);
    } else {
      setStatus(error.message || "Failed to analyze text.", "error");
    }
  } finally {
    analyzeBtn.disabled = false;
    humanizeBtn.disabled = false;
    analyzeBtn.innerHTML = "<span>🔍</span> Analyze Text Only";
  }
});

// Copy Action
copyBtn.addEventListener("click", async () => {
  const text = outputText.value.trim();
  if (!text) {
    setStatus("No rewritten text to copy.", "error");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    outputText.focus();
    outputText.select();
    document.execCommand("copy");
  }
  setStatus("Copied to clipboard.", "success");
});

// Download Action
downloadBtn.addEventListener("click", () => {
  const text = outputText.value.trim();
  if (!text) {
    setStatus("No text to download.", "error");
    return;
  }
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `humanized-text-${Date.now()}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  setStatus("File downloaded.", "success");
});

// Theme Toggle
const savedTheme = localStorage.getItem("textmy-theme");
if (savedTheme === "light") {
  document.documentElement.dataset.theme = "light";
  themeToggle.textContent = "☾";
}
themeToggle.addEventListener("click", () => {
  const isLight = document.documentElement.dataset.theme === "light";
  document.documentElement.dataset.theme = isLight ? "" : "light";
  localStorage.setItem("textmy-theme", isLight ? "dark" : "light");
  themeToggle.textContent = isLight ? "☼" : "☾";
});

// Initialize
updateCounts();
loadUsage();
