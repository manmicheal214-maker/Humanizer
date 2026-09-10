# TextMy AI Humanizer

A semantic rewriting and readability application that rewrites text for clearer, more natural flow while preserving meaning, facts, and conclusions.

## Architecture

This repository is a self-contained full-stack Node.js & Express application:

```text
├── frontend/                  # Static web client (HTML, CSS, client-side JS)
│   ├── index.html             # Main application UI
│   ├── style.css              # Responsive theme and styling
│   ├── app.js                 # UI interactions, diff generation, character counting
│   └── semantic-client.js     # Client API connector (routes to /api)
├── backend/                   # Core rewriting and middleware logic
│   ├── semantic-rewriter.js   # Server-side Gemini AI rewriting engine
│   └── rate-limiter.js        # IP rate limiting
├── server.js                  # Unified Express server (serves frontend + /api)
├── package.json               # Dependencies and start scripts
├── .env.example               # Environment variable templates
└── scripts/
    └── smoke-test.sh          # Endpoint health, CORS, and rewrite verification
```

## Features

- **Semantic Rewriting**: Preserves facts, quotes, citations, numbers, URLs, and core conclusions while improving clarity and sentence variety.
- **Adjustable Intensity**: Light, Balanced, and Strong modes.
- **In-Browser Word Diff**: Live word-level changes view without sending diffs to the server.
- **Server-Side AI Protection**: API keys remain protected on the server using `@google/genai` with REST fallback.
- **Responsive Theme**: Light and dark mode support with accessible contrast.
- **Rate Limiting & Safety**: In-memory rate limiting and input sanitization.

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and set your Gemini API key:

```bash
cp .env.example .env
```

```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.8-flash
MAX_INPUT_CHARS=20000
RATE_LIMIT_PER_MINUTE=60
```

### 3. Run the Server

```bash
npm run dev
```

The application will be accessible at `http://localhost:3000`.

### 4. Run Smoke Tests

Verify the endpoints and rewriting service:

```bash
bash scripts/smoke-test.sh
```

## Pushing to a New GitHub Repository

You can export this project into a new repository using either method:

### Method 1: AI Studio Export (Recommended)
1. Open the **Settings / Menu** in AI Studio.
2. Select **Export to GitHub** (or Download ZIP).
3. Connect your GitHub account to publish directly into a new repository.

### Method 2: Git CLI
```bash
git remote add origin https://github.com/<your-username>/<new-repo-name>.git
git branch -M main
git push -u origin main
```
