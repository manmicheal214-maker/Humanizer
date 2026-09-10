/* Public client for TextMy Platform. Never put API keys in client-side code. */
(function () {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem("textmy_api_url") : null;
  const configured = stored || window.TEXTMY_API_URL || "";
  const API_BASE_URL = configured.replace(/\/$/, "") || "/api";
  const REQUEST_TIMEOUT_MS = 55000;

  function getUserId() {
    let uid = localStorage.getItem("textmy_user_id");
    if (!uid) {
      uid = "usr-" + Math.random().toString(36).substring(2, 10) + "-" + Date.now().toString(36);
      localStorage.setItem("textmy_user_id", uid);
    }
    return uid;
  }

  async function makeRequest(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const userId = getUserId();

    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": userId,
          ...(options.headers || {})
        },
        signal: controller.signal
      });

      const text = await response.text();
      let data = {};
      try {
        data = JSON.parse(text);
      } catch {
        if (response.status === 404) {
          throw new Error(`Endpoint not found (HTTP 404 at ${API_BASE_URL}${path}). Please check backend status.`);
        }
        throw new Error(`The service returned an unexpected response (HTTP ${response.status}).`);
      }

      if (!response.ok) {
        const msg = data?.error?.message || data?.error || data?.message || `Request failed with status ${response.status}.`;
        const err = new Error(msg);
        err.status = response.status;
        err.code = data?.error?.code;
        throw err;
      }

      return data;
    } catch (error) {
      if (error.name === "AbortError") throw new Error("The request timed out. Please try again with shorter text or check connection.");
      if (error instanceof TypeError && error.message.includes("fetch")) {
        throw new Error(`Unable to reach backend service at ${API_BASE_URL}. Verify your connection or worker deployment.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  // POST /api/humanize
  async function humanize(payload) {
    try {
      const data = await makeRequest("/humanize", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      return data;
    } catch (err) {
      // Fallback to /rewrite if /humanize isn't supported on an older endpoint
      if (err.status === 404) {
        return rewrite(payload);
      }
      throw err;
    }
  }

  // POST /api/analyze
  async function analyze(payload) {
    return makeRequest("/analyze", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  // GET /api/usage
  async function getUsage() {
    return makeRequest("/usage", { method: "GET" });
  }

  // Backward-compatible rewrite method
  async function rewrite(payload) {
    const res = await makeRequest("/rewrite", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    return {
      text: res.result || res.text,
      result: res.result || res.text,
      analysis: res.analysis,
      quality: res.quality,
      usage: res.usage
    };
  }

  window.semanticClient = {
    humanize,
    analyze,
    getUsage,
    rewrite,
    API_BASE_URL,
    getUserId,
  };
})();
