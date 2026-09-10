/**
 * Input Validation Module
 */
const CONFIG = require("./config");

function validateHumanizeInput(body, maxChars = CONFIG.MAX_INPUT_CHARS) {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Request body must be a valid JSON object." };
  }

  const { text, style = "natural", audience = "general", purpose = "general writing", language = "en", preserveFormatting = true } = body;

  if (typeof text !== "string" || !text.trim()) {
    return { valid: false, error: "Please provide non-empty text to rewrite." };
  }

  if (text.length > maxChars) {
    return { valid: false, error: `Text length (${text.length.toLocaleString()} characters) exceeds maximum limit of ${maxChars.toLocaleString()} characters.` };
  }

  const sanitizedStyle = CONFIG.SUPPORTED_STYLES.includes(style) ? style : "natural";
  const sanitizedAudience = CONFIG.SUPPORTED_AUDIENCES.includes(audience) ? audience : "general";
  const sanitizedPurpose = CONFIG.SUPPORTED_PURPOSES.includes(purpose) ? purpose : "general writing";
  const sanitizedLang = CONFIG.SUPPORTED_LANGUAGES.includes(language) ? language : "en";
  const sanitizedPreserveFormatting = Boolean(preserveFormatting);

  return {
    valid: true,
    data: {
      text: text.trim(),
      style: sanitizedStyle,
      audience: sanitizedAudience,
      purpose: sanitizedPurpose,
      language: sanitizedLang,
      preserveFormatting: sanitizedPreserveFormatting,
    }
  };
}

function validateAnalyzeInput(body, maxChars = CONFIG.MAX_INPUT_CHARS) {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Request body must be a valid JSON object." };
  }

  const { text } = body;

  if (typeof text !== "string" || !text.trim()) {
    return { valid: false, error: "Please provide non-empty text to analyze." };
  }

  if (text.length > maxChars) {
    return { valid: false, error: `Text length exceeds maximum limit of ${maxChars.toLocaleString()} characters.` };
  }

  return {
    valid: true,
    data: {
      text: text.trim()
    }
  };
}

module.exports = {
  validateHumanizeInput,
  validateAnalyzeInput,
};
