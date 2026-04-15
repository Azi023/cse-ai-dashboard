#!/usr/bin/env bash
# Tier 4 — feature smoke tests. Hits every critical endpoint, reports
# pass/fail per feature area.
#
# Not a full functional test — just confirms endpoints respond with
# reasonable-shaped data. Designed to run in ~30s.
#
# Usage:  ./scripts/test-features.sh [base_url]

set -uo pipefail

BASE="${1:-https://csedash.xyz}"
ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env"
PASS=0
FAIL=0
FAILED_TESTS=()

run_test() {
  local name="$1"
  local path="$2"
  local expect_field="${3:-}"
  local token="${4:-}"

  local auth_header=""
  [ -n "$token" ] && auth_header="Cookie: access_token=$token"

  local body code
  if [ -n "$auth_header" ]; then
    body=$(curl -sS -w "\n%{http_code}" "$BASE$path" -H "$auth_header" 2>&1)
  else
    body=$(curl -sS -w "\n%{http_code}" "$BASE$path" 2>&1)
  fi
  code=$(echo "$body" | tail -1)
  body=$(echo "$body" | head -n -1)

  if [ "$code" != "200" ]; then
    printf "  \e[31m✗\e[0m %-40s  HTTP %s\n" "$name" "$code"
    FAIL=$((FAIL+1))
    FAILED_TESTS+=("$name (HTTP $code)")
    return
  fi

  if [ -n "$expect_field" ]; then
    if ! echo "$body" | grep -q "\"$expect_field\""; then
      printf "  \e[33m?\e[0m %-40s  missing field: %s\n" "$name" "$expect_field"
      FAIL=$((FAIL+1))
      FAILED_TESTS+=("$name (no $expect_field)")
      return
    fi
  fi

  printf "  \e[32m✓\e[0m %-40s  HTTP 200\n" "$name"
  PASS=$((PASS+1))
}

# ── 1. Login to get a JWT ────────────────────────────────────────────
TOKEN=""
if [ -f "$ENV_FILE" ]; then
  USERNAME=$(grep '^DASHBOARD_USERNAME=' "$ENV_FILE" | cut -d= -f2-)
  PASSWORD=$(grep '^DASHBOARD_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)
  if [ -n "${USERNAME:-}" ] && [ -n "${PASSWORD:-}" ]; then
    H=$(mktemp)
    curl -sS -o /dev/null -D "$H" -X POST "$BASE/api/auth/login" \
      -H 'Content-Type: application/json' \
      -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}" >/dev/null 2>&1 || true
    TOKEN=$(grep -i '^set-cookie: access_token=' "$H" 2>/dev/null | sed 's/.*access_token=\([^;]*\).*/\1/' | tr -d '\r' || true)
    rm -f "$H"
  fi
fi

echo ""
echo "=== Public endpoints ==="
run_test "stocks list"              "/api/stocks"                  "symbol"
run_test "stocks shariah compliant" "/api/shariah/compliant"       ""
run_test "market summary"           "/api/market/summary"          ""
run_test "signals (strategy engine)" "/api/strategy-engine/signals" ""
run_test "portfolio summary"        "/api/portfolio/summary"       "total_value"
run_test "atrad status"             "/api/atrad/status"            "lastSynced"
run_test "crypto BTC ticker"        "/api/crypto/ticker/BTC-USDT"  ""
run_test "crypto DCA plans"         "/api/crypto/dca/plans"        ""
run_test "paper portfolio (human)"  "/api/paper-trading/portfolio?type=paper_human&asset=stock" "portfolio_type"
run_test "paper portfolio (ai)"     "/api/paper-trading/portfolio?type=ai_demo&asset=stock"     "portfolio_type"
run_test "debates — this week"      "/api/debates/this-week"       ""
run_test "debate — AEL"             "/api/debates/AEL.N0000"       "symbol"

echo ""
echo "=== Protected endpoints (JWT) ==="
if [ -z "$TOKEN" ]; then
  echo "  (skipped — no DASHBOARD creds in .env)"
else
  run_test "auth/me"              "/api/auth/me"                 "authenticated" "$TOKEN"
  run_test "journey kpis"         "/api/journey/kpis"            "totalDeposited" "$TOKEN"
  run_test "notifications/usage"  "/api/notifications/usage"     "tokens_used"    "$TOKEN"
fi

echo ""
if [ $FAIL -eq 0 ]; then
  printf "\e[32mAll %d tests passed.\e[0m\n" "$PASS"
  exit 0
fi
printf "\e[31m%d passed, %d failed.\e[0m\n" "$PASS" "$FAIL"
for t in "${FAILED_TESTS[@]}"; do
  echo "  - $t"
done
exit 1
