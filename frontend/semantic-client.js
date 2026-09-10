/* Public client only. Never put API keys in this file. */
(function () {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem("textmy_api_url") : null;
  const configured = stored || window.TEXTMY_API_URL || "";
  const API_BASE_URL = configured.replace(/\/$/, "") || "/api";
  const REQUEST_TIMEOUT_MS = 45000;

  async function rewrite(payload) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${API_BASE_URL}/rewrite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      let data;
      const textResponse = await response.text();
      try {
        data = JSON.parse(textResponse);
      } catch {
        if (response.status === 404) {
          throw new Error(`Backend API endpoint not found (HTTP 404 at ${API_BASE_URL}/rewrite). When hosted on static platforms like GitHub Pages, please configure a live backend API URL.`);
        }
        throw new Error(`The rewriting service returned an unexpected response (HTTP ${response.status}).`);
      }

      if (!response.ok) {
        throw new Error(data?.error || `The rewriting service returned an error (HTTP ${response.status}).`);
      }

      if (!data || typeof data.text !== "string" || !data.text.trim()) {
        throw new Error("The rewriting service returned no usable text.");
      }

      return data;
    } catch (error) {
      if (error.name === "AbortError") throw new Error("The request timed out. Please try again.");
      if (error instanceof TypeError) throw new Error(`Unable to reach the rewriting service at ${API_BASE_URL}/rewrite. Check your connection or API URL.`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  window.semanticClient = { rewrite, API_BASE_URL };
})();
