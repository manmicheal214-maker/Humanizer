# TextMy Content Analysis & Humanization Platform

A production-ready content analysis and rewriting platform built with **Cloudflare Workers**, **Cloudflare D1**, **Cloudflare KV**, and the **Gemini API**.

TextMy combines deterministic mathematical analysis (burstiness, sentence distribution, repeated n-grams, stock transition markers) with semantic rewriting that rigorously preserves all original facts, names, dates, citations, and conclusions.

---

## Key Features

- **Deterministic Statistical Analysis**: Real-time evaluation of word counts, paragraph counts, sentence length standard deviation (burstiness), type-token ratio (lexical diversity), and n-gram phrase repetition without language model hallucination.
- **Semantic & Factual Preservation**: Rewrites for organic cadence and natural flow while strictly maintaining factual data, proper nouns, quotations, measurements, and the author's exact positions.
- **Probabilistic Calibration**: Clear labeling of perplexity and detector limitations. Avoids misleading binary claims (e.g. "100% human score") or fabricated error injection.
- **Linguistic Insights**: Deep style, formality, and section-by-section analysis powered by Gemini.
- **Cloudflare Edge Deployment**: Serverless runtime on Cloudflare Workers, persistent user and usage tracking on Cloudflare D1, and high-speed rate limiting on Cloudflare KV.
- **Flexible Styling & Audiences**: Supports 8 writing styles (natural, conversational, professional, academic, business, marketing, casual, concise), 7 target audiences, and multiple languages.
- **Word-Level Visual Diff**: In-browser comparison view showing exact additions and deletions.

---

## Architectural Pipeline

```
[User Text]
     │
     ▼
┌─────────────────────────────────────────────────────────┐
│ 1. Deterministic Statistical Analysis                   │
│    • Word/char counts, sentence length std dev          │
│    • Lexical diversity (TTR) & n-gram repetition        │
│    • Transition markers & formulaic phrase detection    │
└───────────────────────────┬─────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│ 2. Semantic & Sentence Transition Analysis              │
│    • Lexical Jaccard overlap / vector embeddings        │
│    • Flag potential redundant or abrupt transitions     │
└───────────────────────────┬─────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│ 3. Semantic Rewriting Engine (Gemini)                   │
│    • Dynamic sentence pacing & rhythm                   │
│    • Eliminates stock transitions & passive drag        │
│    • Zero fact alteration or manufactured errors        │
└───────────────────────────┬─────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│ 4. Quality & Meaning Preservation Checker               │
│    • Automated comparison of original vs rewritten text │
│    • Verifies facts, numbers, dates, and conclusions    │
│    • Optional targeted correction pass if needed        │
└───────────────────────────┬─────────────────────────────┘
                            │
                            ▼
[Rewritten Content + Comprehensive Analysis Dashboard]
```

---

## Project Structure

```text
├── cloudflare-worker.js         # Production Cloudflare Worker entry point
├── wrangler.toml                # Cloudflare Worker, D1, and KV configuration
├── migrations/
│   └── 0001_initial_schema.sql  # Cloudflare D1 SQL schema (users, usage, history)
├── backend/
│   ├── config.js                # Global configuration, models, usage plans
│   ├── deterministic-analyzer.js# Statistical analyzer (variance, n-grams, transitions)
│   ├── embeddings.js            # Semantic & lexical similarity engine
│   ├── gemini-client.js         # Resilient Gemini client with multi-model fallback
│   ├── pipeline.js              # Orchestrator (analysis -> rewrite -> quality check)
│   ├── rate-limiter.js          # Distributed rate limiting (KV and in-memory)
│   ├── storage.js               # Storage abstraction (D1 / SQLite / in-memory)
│   ├── validator.js             # Schema validation and input sanitation
│   └── prompts/
│       ├── analyzer.js          # Linguistic analysis prompt
│       ├── rewriter.js          # Meaning-preserving rewriter prompt
│       ├── checker.js           # Quality audit prompt
│       └── correction.js        # Targeted correction prompt
├── frontend/
│   ├── index.html               # Web interface and analysis dashboard
│   ├── style.css                # Dark/light theme styling with WCAG contrast
│   ├── app.js                   # UI logic, diff calculation, metrics visualization
│   └── semantic-client.js       # Client API connector
├── server.js                    # Node.js/Express server for local development
├── tests/
│   └── deterministic.test.js    # Unit tests for text analyzer & pipeline
└── scripts/
    └── smoke-test.sh            # Automated verification test script
```

---

## Cloudflare Deployment

### 1. Configure Cloudflare Wrangler

Ensure you are logged into Wrangler:

```bash
npx wrangler login
```

### 2. Create D1 Database and KV Namespace

```bash
# Create D1 database
npx wrangler d1 create textmy-db

# Initialize database schema
npx wrangler d1 execute textmy-db --file=migrations/0001_initial_schema.sql

# Create KV namespace for rate limiting
npx wrangler kv namespace create RATE_LIMIT_KV
```

Update `wrangler.toml` with the generated `database_id` and `id` values.

### 3. Set Cloudflare Secret

```bash
npx wrangler secret put GEMINI_API_KEY
```

### 4. Deploy to Cloudflare Workers

```bash
npx wrangler deploy
```

> **Direct Cloudflare Dashboard Option:**
> You can also copy and paste `cloudflare-worker.js` directly into the Cloudflare Worker Web Editor. It is completely self-contained, includes all deterministic analyzers, fallback models, and D1/KV bindings, and runs without any build steps.

---

## Local Development (Node.js)

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Set your `GEMINI_API_KEY` in `.env`:

```env
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.1-flash-lite
```

### 3. Run Development Server

```bash
npm run dev
```

Visit `http://localhost:3000` in your browser.

### 4. Run Tests

```bash
npm test
```

---

## API Endpoints

### `POST /api/analyze`
Accepts `{ "text": "..." }` and returns complete deterministic statistics, burstiness, n-gram repetitions, formulaic phrases, sentence transition scores, linguistic profile, and probabilistic signals.

### `POST /api/humanize`
Accepts:
```json
{
  "text": "Original text...",
  "style": "natural",
  "audience": "general",
  "purpose": "general writing",
  "language": "en",
  "preserveFormatting": true
}
```
Executes the full pipeline: deterministic analysis → Gemini rewrite → quality check → usage recording. Returns rewritten text, quality score, and analytical profile.

### `POST /api/rewrite`
Backward-compatible endpoint for existing integrations. Accepts `{ "text": "...", "intensity": "balanced" }`.

### `GET /api/usage`
Returns monthly character allowance, current character usage, and reset date for the authenticated or anonymous user.

### `GET /health` or `GET /api/health`
Returns service status, version, and binding status.

---

## Ethical Disclosure & Limitations

1. **Probabilistic Nature**: Stylometric metrics and AI detectors are probabilistic classifiers. They cannot definitively prove or disprove human authorship.
2. **Perplexity Constraints**: Perplexity is model-dependent and requires token log-probabilities. It is never fabricated.
3. **Domain Normalization**: Formal, academic, legal, technical, and non-native English writing naturally exhibit lower burstiness and formal transition patterns without being AI-generated.
4. **Factual Fidelity**: TextMy does NOT intentionally inject spelling errors, grammatical mistakes, or typos. High-quality humanization focuses on dynamic rhythm, organic transitions, and expressive vocabulary while keeping all facts intact.
