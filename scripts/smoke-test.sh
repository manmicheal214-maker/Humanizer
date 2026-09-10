#!/usr/bin/env bash
set -euo pipefail

API_URL="${TEXTMY_API_URL:-}"
ORIGIN="${TEXTMY_ORIGIN:-https://manmicheal214-maker.github.io}"

if [[ -z "$API_URL" ]]; then
  API_URL="$(python3 - <<'PY'
from pathlib import Path
import re
text = Path('frontend/index.html').read_text(encoding='utf-8')
m = re.search(r'window\.TEXTMY_API_URL\s*=\s*[\"\x27]([^\"\x27]+)', text)
if not m:
    raise SystemExit('ERROR: Could not find window.TEXTMY_API_URL in frontend/index.html')
print(m.group(1).rstrip('/'))
PY
)"
fi

if [[ "$API_URL" == /* ]]; then
  API_URL="http://localhost:3000${API_URL}"
fi

HEALTH_URL="${API_URL%/}/health"
REWRITE_URL="${API_URL%/}/rewrite"
ANALYZE_URL="${API_URL%/}/analyze"
USAGE_URL="${API_URL%/}/usage"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command '$1' is not installed."
}

require_command curl
require_command python3

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# 1. Health check
health_headers="$TMP_DIR/health.headers"
health_body="$TMP_DIR/health.body"
health_code="$(curl -sS -D "$health_headers" -o "$health_body" -w '%{http_code}' "$HEALTH_URL" || true)"
if [[ "$health_code" != "200" ]]; then
  HEALTH_URL="${API_URL%/}/api/health"
  health_code="$(curl -sS -D "$health_headers" -o "$health_body" -w '%{http_code}' "$HEALTH_URL" || true)"
fi
[[ "$health_code" == "200" ]] || fail "Health check failed: $HEALTH_URL returned HTTP $health_code. Body: $(cat "$health_body" 2>/dev/null || true)"

python3 - "$health_body" <<'PY'
import json, sys
p = sys.argv[1]
try:
    data = json.load(open(p, encoding='utf-8'))
except Exception as exc:
    raise SystemExit(f'ERROR: Health endpoint did not return valid JSON: {exc}')
if data.get('status') != 'ok':
    raise SystemExit(f"ERROR: Health endpoint returned unexpected JSON: {data}")
PY

echo "PASS: Health check returned HTTP 200 with status=ok"

# 2. CORS Preflight
preflight_headers="$TMP_DIR/preflight.headers"
preflight_body="$TMP_DIR/preflight.body"
preflight_code="$(curl -sS -D "$preflight_headers" -o "$preflight_body" -X OPTIONS "$REWRITE_URL" \
  -H "Origin: $ORIGIN" \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type' \
  -w '%{http_code}' || true)"

allow_origin="$(awk 'tolower($0) ~ /^access-control-allow-origin:/ {sub(/^[^:]*:[[:space:]]*/, ""); print; exit}' "$preflight_headers" | tr -d '\r')"
[[ -n "$allow_origin" ]] || fail "CORS preflight failed: no Access-Control-Allow-Origin header. HTTP $preflight_code."
[[ "$allow_origin" == "$ORIGIN" || "$allow_origin" == "*" ]] || fail "CORS preflight failed: Access-Control-Allow-Origin was '$allow_origin', expected '$ORIGIN' or '*'."

echo "PASS: CORS preflight allowed origin: $allow_origin"

# 3. Analyze endpoint check (deterministic statistical verification)
analyze_body="$TMP_DIR/analyze.body"
analyze_code="$(curl -sS -D "$TMP_DIR/analyze.headers" -o "$analyze_body" -X POST "$ANALYZE_URL" \
  -H "Origin: $ORIGIN" \
  -H 'Content-Type: application/json' \
  --data '{"text":"In today'\''s fast-paced world, artificial intelligence plays a crucial role. Furthermore, we must understand its impact."}' \
  -w '%{http_code}' || true)"

if [[ "$analyze_code" == "404" ]]; then
  ANALYZE_URL="${API_URL%/}/api/analyze"
  analyze_code="$(curl -sS -D "$TMP_DIR/analyze.headers" -o "$analyze_body" -X POST "$ANALYZE_URL" \
    -H "Origin: $ORIGIN" \
    -H 'Content-Type: application/json' \
    --data '{"text":"In today'\''s fast-paced world, artificial intelligence plays a crucial role. Furthermore, we must understand its impact."}' \
    -w '%{http_code}' || true)"
fi

if [[ "$analyze_code" == "200" ]]; then
  python3 - "$analyze_body" <<'PY'
import json, sys
data = json.load(open(sys.argv[1], encoding='utf-8'))
if not data.get('success'):
    raise SystemExit(f'ERROR: Analyze endpoint success!=true: {data}')
analysis = data.get('analysis', {})
stats = analysis.get('statistics', {})
if stats.get('wordCount', 0) < 5:
    raise SystemExit(f'ERROR: Unexpected word count: {stats}')
print(f"PASS: analyze endpoint returned word count {stats.get('wordCount')} with burstiness stdDev {analysis.get('burstiness', {}).get('sentenceLengthStdDev')}")
PY
else
  echo "INFO: Analyze endpoint returned HTTP $analyze_code (continuing rewrite test)"
fi

# 4. Rewrite / Humanize check
rewrite_body="$TMP_DIR/rewrite.body"
rewrite_code="$(curl -sS -D "$TMP_DIR/rewrite.headers" -o "$rewrite_body" -X POST "$REWRITE_URL" \
  -H "Origin: $ORIGIN" \
  -H 'Content-Type: application/json' \
  --data '{"text":"The system was developed by the engineering team.","intensity":"balanced"}' \
  -w '%{http_code}' || true)"

if [[ "$rewrite_code" == "404" ]]; then
  REWRITE_URL="${API_URL%/}/api/rewrite"
  rewrite_code="$(curl -sS -D "$TMP_DIR/rewrite.headers" -o "$rewrite_body" -X POST "$REWRITE_URL" \
    -H "Origin: $ORIGIN" \
    -H 'Content-Type: application/json' \
    --data '{"text":"The system was developed by the engineering team.","intensity":"balanced"}' \
    -w '%{http_code}' || true)"
fi

[[ "$rewrite_code" == "200" ]] || fail "Rewrite smoke test failed: $REWRITE_URL returned HTTP $rewrite_code. Body: $(cat "$rewrite_body" 2>/dev/null || true)"

python3 - "$rewrite_body" <<'PY'
import json, sys
p = sys.argv[1]
try:
    data = json.load(open(p, encoding='utf-8'))
except Exception as exc:
    raise SystemExit(f'ERROR: Rewrite endpoint did not return valid JSON: {exc}')
text = data.get('rewrittenText') or data.get('text') or data.get('result')
if not isinstance(text, str) or not text.strip():
    raise SystemExit(f'ERROR: Rewrite endpoint returned no rewritten text: {data}')
print(f'PASS: rewrite returned text: {text}')
PY

echo "SUCCESS: All smoke tests passed."
