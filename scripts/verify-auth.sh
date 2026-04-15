#!/usr/bin/env bash
# Tier 2 — login + JWT verification.
#
# Reads DASHBOARD_USERNAME/DASHBOARD_PASSWORD from project-root .env and
# exercises the full auth cookie flow:
#   POST /api/auth/login   → drops access_token + refresh_token cookies
#   GET  /api/auth/me      → should return {authenticated:true,...}
#   GET  /api/atrad/status → a real JWT-protected endpoint
#
# Exits 0 on all-pass, non-zero on any failure.
#
# Usage:  ./scripts/verify-auth.sh [base_url]
#   default base_url = https://csedash.xyz

set -euo pipefail

BASE="${1:-https://csedash.xyz}"
ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "FAIL — .env not found at $ENV_FILE"
  exit 1
fi

USERNAME="$(grep '^DASHBOARD_USERNAME=' "$ENV_FILE" | cut -d= -f2-)"
PASSWORD="$(grep '^DASHBOARD_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)"

if [ -z "$USERNAME" ] || [ -z "$PASSWORD" ]; then
  echo "FAIL — DASHBOARD_USERNAME or DASHBOARD_PASSWORD missing in .env"
  exit 1
fi

HEADERS=$(mktemp)
trap "rm -f $HEADERS" EXIT

echo "→ POST $BASE/api/auth/login"
code=$(curl -sS -o /dev/null -D "$HEADERS" -w "%{http_code}" \
  -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}")
if [ "$code" != "200" ]; then
  echo "FAIL — login returned HTTP $code (expected 200)"
  exit 1
fi

TOKEN=$(grep -i '^set-cookie: access_token=' "$HEADERS" | sed 's/.*access_token=\([^;]*\).*/\1/' | tr -d '\r')
if [ -z "$TOKEN" ]; then
  echo "FAIL — no access_token cookie in login response"
  exit 1
fi
echo "✓ login OK, token length=${#TOKEN}"

echo "→ GET $BASE/api/auth/me"
resp=$(curl -sS -w "\n%{http_code}" "$BASE/api/auth/me" -H "Cookie: access_token=$TOKEN")
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | head -1)
if [ "$code" != "200" ]; then
  echo "FAIL — /auth/me returned HTTP $code: $body"
  exit 1
fi
echo "✓ /auth/me OK: $body"

echo "→ GET $BASE/api/atrad/status (JWT-protected read)"
code=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE/api/atrad/status" -H "Cookie: access_token=$TOKEN")
if [ "$code" != "200" ]; then
  echo "FAIL — /atrad/status returned HTTP $code"
  exit 1
fi
echo "✓ /atrad/status OK"

echo ""
echo "All auth checks passed."
