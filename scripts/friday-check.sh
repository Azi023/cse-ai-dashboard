#!/bin/bash
# Run this AFTER 3:30 PM SLT on Friday to verify the full pipeline ran.
# Usage: ssh hetzner-vps "bash /opt/cse-ai-dashboard/scripts/friday-check.sh"

echo "═══════════════════════════════════════════════════════"
echo "  FRIDAY PIPELINE CHECK — $(date '+%Y-%m-%d %H:%M SLT')"
echo "═══════════════════════════════════════════════════════"

TODAY=$(date '+%Y-%m-%d')
# ISO week start (Monday) — used by calculateWeeklyMetrics
WEEK_START=$(date -d "last monday" '+%Y-%m-%d' 2>/dev/null || date -v-Mon '+%Y-%m-%d')
PSQL="sudo -u postgres psql -d cse_dashboard -t -A -c"

FAIL=0

check() {
  local label="$1"
  local result="$2"
  local expected="$3"

  printf "%-40s " "$label"
  if [ -n "$result" ]; then
    echo "OK  — $result"
  else
    echo "MISSING — expected $expected"
    FAIL=1
  fi
}

echo ""
echo "--- Core daily data (prerequisites for Friday pipeline) ---"
echo ""

DAILY_COUNT=$($PSQL "SELECT COUNT(*) FROM daily_prices WHERE trade_date = '$TODAY';" 2>/dev/null)
check "Daily prices today" "${DAILY_COUNT:+$DAILY_COUNT stocks}" "~280+ stocks"

SCORE_COUNT=$($PSQL "SELECT COUNT(*) FROM stock_scores WHERE date = '$TODAY';" 2>/dev/null)
check "Stock scores today" "${SCORE_COUNT:+$SCORE_COUNT stocks scored}" "~260 stocks"

SIG_COUNT=$($PSQL "SELECT COUNT(*) FROM technical_signals WHERE date = '$TODAY';" 2>/dev/null)
check "Technical signals today" "${SIG_COUNT:+$SIG_COUNT signals}" "~260 stocks"

SNAPSHOT=$($PSQL "SELECT aspi_close FROM market_snapshots WHERE date = '$TODAY' LIMIT 1;" 2>/dev/null)
check "Market snapshot today" "${SNAPSHOT:+ASPI $SNAPSHOT}" "market_snapshots row"

PORT_SNAP=$($PSQL "SELECT total_value FROM portfolio_snapshots WHERE date = '$TODAY' LIMIT 1;" 2>/dev/null)
check "Portfolio snapshot today" "${PORT_SNAP:+LKR $PORT_SNAP}" "portfolio_snapshots row"

REGIME=$($PSQL "SELECT regime || ' (' || confidence || '% conf)' FROM market_regimes ORDER BY detected_at DESC LIMIT 1;" 2>/dev/null)
check "Market regime (latest)" "$REGIME" "market_regimes row"

echo ""
echo "--- Friday-specific pipeline jobs ---"
echo ""

WEEKLY_METRICS=$($PSQL "SELECT 'week_start=' || week_start || ' aspi_return=' || COALESCE(aspi_return_pct::text, 'null') FROM weekly_metrics WHERE week_start = '$WEEK_START' LIMIT 1;" 2>/dev/null)
check "Weekly metrics (2:50 PM)" "$WEEKLY_METRICS" "week_start=$WEEK_START"

REC=$($PSQL "SELECT recommended_stock || ' (' || confidence || ' confidence)' FROM ai_recommendations WHERE week_start = '$WEEK_START' LIMIT 1;" 2>/dev/null)
check "AI recommendation (2:55 PM)" "$REC" "week_start=$WEEK_START"

BRIEF=$($PSQL "SELECT 'week_start=' || week_start FROM weekly_briefs WHERE week_start = '$WEEK_START' LIMIT 1;" 2>/dev/null)
check "Weekly brief (3:00 PM)" "$BRIEF" "week_start=$WEEK_START"

DIGEST=$($PSQL "SELECT 'date=' || date FROM daily_digests WHERE date = '$TODAY' LIMIT 1;" 2>/dev/null)
check "Daily digest (2:45 PM)" "$DIGEST" "date=$TODAY"

echo ""
echo "--- Data integrity spot-check ---"
echo ""

ZERO_PRICES=$($PSQL "SELECT COUNT(*) FROM daily_prices WHERE trade_date = '$TODAY' AND (close = 0 OR close IS NULL);" 2>/dev/null)
if [ "$ZERO_PRICES" = "0" ]; then
  echo "Zero-price check                         OK  — no zero/null close prices"
else
  echo "Zero-price check                         WARN — $ZERO_PRICES records with zero/null close"
  FAIL=1
fi

WEEKEND_LEAK=$($PSQL "SELECT COUNT(*) FROM daily_prices WHERE trade_date = '$TODAY' AND EXTRACT(DOW FROM trade_date) IN (0,6);" 2>/dev/null)
if [ "$WEEKEND_LEAK" = "0" ]; then
  echo "Weekend guard                            OK  — no weekend records for today"
else
  echo "Weekend guard                            WARN — $WEEKEND_LEAK weekend records found"
fi

echo ""
echo "═══════════════════════════════════════════════════════"
if [ $FAIL -eq 0 ]; then
  echo "  RESULT: ALL CHECKS PASSED — pipeline ran successfully"
else
  echo "  RESULT: ONE OR MORE CHECKS FAILED — review missing items above"
fi
echo "═══════════════════════════════════════════════════════"
