/**
 * Centralized Configuration for TextMy Platform
 */
const CONFIG = {
  DEFAULT_MODEL: "gemini-3.1-flash-lite",
  FALLBACK_MODELS: ["gemini-3.1-flash-lite", "gemini-2.5-flash", "gemini-3.8-flash"],
  MAX_INPUT_CHARS: 20000,
  DEFAULT_TIMEOUT_MS: 45000,

  // Usage Plans with monthly character allowances
  PLANS: {
    free: {
      id: "free",
      name: "Free Tier",
      monthlyChars: 50000,
      rateLimitPerMin: 20,
    },
    pro: {
      id: "pro",
      name: "Pro Tier",
      monthlyChars: 1000000,
      rateLimitPerMin: 60,
    },
    business: {
      id: "business",
      name: "Business Tier",
      monthlyChars: 10000000,
      rateLimitPerMin: 200,
    },
  },

  // Supported Rewrite Styles
  SUPPORTED_STYLES: [
    "natural",
    "conversational",
    "professional",
    "academic",
    "business",
    "marketing",
    "casual",
    "concise",
  ],

  // Supported Audiences
  SUPPORTED_AUDIENCES: [
    "general",
    "professionals",
    "academics",
    "executives",
    "students",
    "customers",
    "beginners",
  ],

  // Supported Purposes
  SUPPORTED_PURPOSES: [
    "general writing",
    "blog post",
    "essay",
    "email",
    "report",
    "technical document",
    "creative article",
  ],

  // Supported Languages
  SUPPORTED_LANGUAGES: [
    "en",
    "es",
    "fr",
    "de",
    "pt",
    "it",
    "nl",
    "auto",
  ],

  // Mandatory Limitations Warning
  LIMITATIONS: [
    "AI detectors and stylistic models are probabilistic and cannot conclusively prove authorship.",
    "Perplexity scores depend on the specific training distribution of the evaluated language model.",
    "Human writing frequently exhibits low perplexity, tight symmetry, or concise cadence in formal domains.",
    "AI-generated text can exhibit high burstiness and varied vocabulary through prompt instructions.",
    "Human editing, proofreading, and paraphrasing alter detectable statistical signatures.",
    "Non-native English writers often use repetitive or formulaic transitions that automated tools mistake for machine generation.",
    "No stylistic or statistical analysis alone constitutes definitive proof of human or synthetic authorship."
  ],
};

module.exports = CONFIG;
