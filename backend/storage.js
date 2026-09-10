/**
 * Storage & Usage Engine
 * Interacts with Cloudflare D1 when available, with in-memory fallback for local development.
 */
const CONFIG = require("./config");

// In-memory fallback stores
const memoryStore = {
  users: new Map(),
  usage: [],
  history: [],
};

// Generate UUID
function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "id-" + Math.random().toString(36).substring(2, 15) + "-" + Date.now().toString(36);
}

// Get or initialize user record
async function getUser(userId = "anonymous", env = {}) {
  const defaultPlan = env.DEFAULT_PLAN || "free";

  if (env.DB && typeof env.DB.prepare === "function") {
    try {
      const stmt = env.DB.prepare("SELECT id, email, plan, created_at FROM users WHERE id = ?");
      const user = await stmt.bind(userId).first();
      if (user) return user;

      // Create new user in D1
      const insert = env.DB.prepare("INSERT INTO users (id, plan, created_at) VALUES (?, ?, unixepoch())");
      await insert.bind(userId, defaultPlan).run();
      return { id: userId, plan: defaultPlan };
    } catch (e) {
      console.warn("D1 getUser error, falling back to memory:", e.message);
    }
  }

  // Memory fallback
  if (!memoryStore.users.has(userId)) {
    memoryStore.users.set(userId, {
      id: userId,
      plan: defaultPlan,
      createdAt: Math.floor(Date.now() / 1000)
    });
  }
  return memoryStore.users.get(userId);
}

// Check monthly character usage against plan limit
async function checkUsageLimit(userId = "anonymous", additionalChars = 0, env = {}) {
  const user = await getUser(userId, env);
  const planKey = user.plan || "free";
  const plan = CONFIG.PLANS[planKey] || CONFIG.PLANS.free;
  const startOfMonth = Math.floor(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() / 1000);

  let currentMonthlyChars = 0;

  if (env.DB && typeof env.DB.prepare === "function") {
    try {
      const stmt = env.DB.prepare(
        "SELECT SUM(characters) as totalChars FROM usage WHERE user_id = ? AND created_at >= ?"
      );
      const res = await stmt.bind(userId, startOfMonth).first();
      currentMonthlyChars = Number(res?.totalChars || 0);
    } catch (e) {
      console.warn("D1 usage query failed, using memory fallback:", e.message);
    }
  } else {
    // Memory fallback
    currentMonthlyChars = memoryStore.usage
      .filter(u => u.userId === userId && u.createdAt >= startOfMonth)
      .reduce((sum, u) => sum + u.characters, 0);
  }

  const remaining = Math.max(0, plan.monthlyChars - currentMonthlyChars);
  const hasQuota = (currentMonthlyChars + additionalChars) <= plan.monthlyChars;

  return {
    allowed: hasQuota,
    plan: plan.name,
    limit: plan.monthlyChars,
    used: currentMonthlyChars,
    remaining,
    resetDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
  };
}

// Record usage after processing
async function recordUsage({ userId = "anonymous", characters = 0, words = 0, inputTokens = 0, outputTokens = 0, model = "gemini", env = {} }) {
  const id = generateId();
  const now = Math.floor(Date.now() / 1000);

  if (env.DB && typeof env.DB.prepare === "function") {
    try {
      const stmt = env.DB.prepare(
        "INSERT INTO usage (id, user_id, characters, words, input_tokens, output_tokens, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      );
      await stmt.bind(id, userId, characters, words, inputTokens, outputTokens, model, now).run();
      return { success: true, id };
    } catch (e) {
      console.warn("D1 recordUsage error:", e.message);
    }
  }

  memoryStore.usage.push({
    id,
    userId,
    characters,
    words,
    inputTokens,
    outputTokens,
    model,
    createdAt: now,
  });
  return { success: true, id };
}

// Save history record (optional)
async function saveHistory({ userId = "anonymous", originalText, resultText, style = "natural", env = {} }) {
  const id = generateId();
  const now = Math.floor(Date.now() / 1000);

  if (env.DB && typeof env.DB.prepare === "function") {
    try {
      const stmt = env.DB.prepare(
        "INSERT INTO history (id, user_id, original_text, result_text, style, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      );
      await stmt.bind(id, userId, originalText, resultText, style, now).run();
      return { success: true, id };
    } catch (e) {
      console.warn("D1 saveHistory error:", e.message);
    }
  }

  memoryStore.history.unshift({
    id,
    userId,
    originalText,
    resultText,
    style,
    createdAt: now,
  });
  if (memoryStore.history.length > 50) memoryStore.history.pop();
  return { success: true, id };
}

// Get user history
async function getHistory(userId = "anonymous", limit = 10, env = {}) {
  if (env.DB && typeof env.DB.prepare === "function") {
    try {
      const stmt = env.DB.prepare(
        "SELECT id, original_text, result_text, style, created_at FROM history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?"
      );
      const rows = await stmt.bind(userId, limit).all();
      return rows?.results || [];
    } catch (e) {
      console.warn("D1 getHistory error:", e.message);
    }
  }

  return memoryStore.history
    .filter(h => h.userId === userId)
    .slice(0, limit);
}

module.exports = {
  getUser,
  checkUsageLimit,
  recordUsage,
  saveHistory,
  getHistory,
};
