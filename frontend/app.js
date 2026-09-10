const $ = (id) => document.getElementById(id);
const inputText = $("inputText");
const outputText = $("outputText");
const rewriteBtn = $("humanizeBtn");
const copyBtn = $("copyBtn");
const clearBtn = $("clearBtn");
const status = $("status");
const intensityHelp = $("intensityHelp");
const diffSection = $("diffSection");
const diffToggle = $("diffToggle");
const diffView = $("diffView");
const intensityInputs = [...document.querySelectorAll('input[name="intensity"]')];
const INTENSITY_KEY = "textmy-intensity";

const intensityDescriptions = {
  light: "Minimal changes focused on awkward wording and repetition.",
  balanced: "Noticeable improvements with conservative restructuring.",
  strong: "Substantial stylistic restructuring while preserving meaning."
};

function countWords(value) { const t = value.trim(); return t ? t.split(/\s+/).length : 0; }
function updateCounts() {
  $("inputCount").textContent = `${inputText.value.length.toLocaleString()} characters`;
  $("inputWords").textContent = `${countWords(inputText.value).toLocaleString()} words`;
  $("outputCount").textContent = `${outputText.value.length.toLocaleString()} characters`;
  $("outputWords").textContent = `${countWords(outputText.value).toLocaleString()} words`;
}
function setStatus(message, type = "default") { status.textContent = message; status.dataset.type = type; }
function selectedIntensity() { return document.querySelector('input[name="intensity"]:checked')?.value || "balanced"; }
function escapeHtml(value) { return value.replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }

// Lightweight word-level LCS diff. It runs locally and never sends the diff to the server.
function wordDiff(original, rewritten) {
  const a = original.match(/\s+|[^\s]+/g) || [];
  const b = rewritten.match(/\s+|[^\s]+/g) || [];
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ type: "same", text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: "removed", text: a[i++] }); }
    else { out.push({ type: "added", text: b[j++] }); }
  }
  while (i < n) out.push({ type: "removed", text: a[i++] });
  while (j < m) out.push({ type: "added", text: b[j++] });
  return out;
}
function renderDiff(original, rewritten) {
  const parts = wordDiff(original, rewritten);
  diffView.innerHTML = parts.map((part) => part.type === "same" ? escapeHtml(part.text) : `<mark class="diff-${part.type}">${escapeHtml(part.text)}</mark>`).join("");
  diffSection.hidden = false;
  diffView.hidden = true;
  diffToggle.textContent = "Show changes";
  diffToggle.setAttribute("aria-expanded", "false");
}

intensityInputs.forEach((radio) => radio.addEventListener("change", () => {
  localStorage.setItem(INTENSITY_KEY, radio.value);
  intensityHelp.textContent = intensityDescriptions[selectedIntensity()];
}));
const savedIntensity = localStorage.getItem(INTENSITY_KEY);
if (intensityInputs.some((r) => r.value === savedIntensity)) document.querySelector(`input[name="intensity"][value="${savedIntensity}"]`).checked = true;
intensityHelp.textContent = intensityDescriptions[selectedIntensity()];

inputText.addEventListener("input", updateCounts);
clearBtn.addEventListener("click", () => { inputText.value = ""; outputText.value = ""; diffSection.hidden = true; setStatus("Cleared."); updateCounts(); inputText.focus(); });
diffToggle.addEventListener("click", () => {
  const show = diffView.hidden;
  diffView.hidden = !show;
  diffToggle.textContent = show ? "Hide changes" : "Show changes";
  diffToggle.setAttribute("aria-expanded", String(show));
});

rewriteBtn.addEventListener("click", async () => {
  const text = inputText.value.trim();
  if (!text) { setStatus("Please enter some text first.", "error"); inputText.focus(); return; }
  if (text.length > 20000) { setStatus("The text is too long. Please shorten it and try again.", "error"); return; }
  rewriteBtn.disabled = true;
  intensityInputs.forEach((radio) => { radio.disabled = true; });
  rewriteBtn.innerHTML = '<span class="spinner"></span> Rewriting…';
  setStatus("Preserving meaning and improving flow…", "loading");
  try {
    const result = await semanticClient.rewrite({ text, intensity: selectedIntensity() });
    outputText.value = result.text;
    updateCounts();
    renderDiff(text, result.text);
    setStatus("Rewritten successfully. Review the result before publishing.", "success");
  } catch (error) {
    console.error("Rewrite request failed:", error.message);
    setStatus(error.message || "The rewriting service is temporarily unavailable.", "error");
  } finally {
    rewriteBtn.disabled = false;
    intensityInputs.forEach((radio) => { radio.disabled = false; });
    rewriteBtn.innerHTML = "<span>✦</span> Rewrite text";
  }
});

copyBtn.addEventListener("click", async () => {
  const text = outputText.value.trim();
  if (!text) { setStatus("There is no output to copy.", "error"); return; }
  try { await navigator.clipboard.writeText(text); } catch { outputText.focus(); outputText.select(); document.execCommand("copy"); }
  setStatus("Copied to clipboard.", "success");
});

const themeToggle = $("themeToggle");
const savedTheme = localStorage.getItem("textmy-theme");
if (savedTheme === "light") document.documentElement.dataset.theme = "light";
themeToggle.addEventListener("click", () => {
  const light = document.documentElement.dataset.theme === "light";
  document.documentElement.dataset.theme = light ? "" : "light";
  localStorage.setItem("textmy-theme", light ? "dark" : "light");
  themeToggle.textContent = light ? "☼" : "☾";
});
if (savedTheme === "light") themeToggle.textContent = "☾";
updateCounts();
