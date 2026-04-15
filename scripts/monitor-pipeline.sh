#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────
# monitor-pipeline.sh — Real-time pipeline monitoring for CSE AI Dashboard
#
# Monitors the 2:35–2:50 PM SLT afternoon cron pipeline.
# Watches PM2 logs for each cron to fire in sequence.
#
# Usage:
#   bash /opt/cse-ai-dashboard/scripts/monitor-pipeline.sh
#
# Output:
#   /tmp/pipeline-monitor-YYYY-MM-DD.log
# ──────────────────────────────────────────────────────────────────────────

set -euo pipefail

DATE=$(date +%F)
LOG_FILE="/tmp/pipeline-monitor-${DATE}.log"
PM2_LOG="/root/.pm2/logs/cse-backend-out.log"

# Pipeline steps in expected order with their log signatures
declare -A PIPELINE_STEPS
PIPELINE_STEPS=(
  ["2:35"]="postCloseSnapshot|post-close|Post-close snapshot"
  ["2:36"]="captureEODSnapshot|EOD snapshot|Demo.*EOD"
  ["2:37"]="updateBenchmarks|benchmark|Demo.*benchmark"
  ["2:38"]="requestATradSync|ATrad sync flag|sync_requested"
  ["2:39"]="runTechnicalAnalysis|technical analysis|SMA.*RSI"
  ["2:40"]="saveDailySnapshots|saveMarketSnapshot|market snapshot|portfolio snapshot"
  ["2:41"]="detectMarketRegime|market regime|ASPI regime"
  ["2:42"]="runStockScoring|stock scoring|composite score"
  ["2:43"]="generateSignals|strategy.*signal|buy.*signal|sell.*signal"
  ["2:44"]="runRiskAnalysis|risk analysis|position risk"
  ["2:45"]="generateDailyDigest|daily digest|Haiku.*digest"
  ["2:46"]="checkExitSignals|exit signal|stop.loss|take.profit"
  ["2:47"]="autoSuggestTpSl|TP.*SL|suggest.*order"
  ["2:48"]="queueBuySignals|queue.*buy|processHighConfidence"
)

# Ordered keys for display
ORDERED_TIMES=("2:35" "2:36" "2:37" "2:38" "2:39" "2:40" "2:41" "2:42" "2:43" "2:44" "2:45" "2:46" "2:47" "2:48")

log() {
  local msg="[$(date '+%H:%M:%S')] $1"
  echo "$msg"
  echo "$msg" >> "$LOG_FILE"
}

header() {
  echo ""
  echo "══════════════════════════════════════════════════════════════"
  echo "  CSE AI Dashboard — Pipeline Monitor"
  echo "  Date: ${DATE}"
  echo "  Log: ${LOG_FILE}"
  echo "══════════════════════════════════════════════════════════════"
  echo ""
}

# ── Wait for pipeline start ──────────────────────────────────────────────

wait_for_pipeline() {
  local current_hour
  current_hour=$(date +%H)
  local current_min
  current_min=$(date +%M)

  if (( current_hour < 14 || (current_hour == 14 && current_min < 34) )); then
    log "Waiting for pipeline to start (2:35 PM SLT)..."
    log "Current time: $(date '+%H:%M:%S %Z')"

    while true; do
      current_hour=$(date +%H)
      current_min=$(date +%M)
      if (( current_hour == 14 && current_min >= 34 )); then
        break
      fi
      if (( current_hour > 14 )); then
        break
      fi
      sleep 10
    done
  fi

  log "Pipeline monitoring started"
}

# ── Monitor PM2 logs ─────────────────────────────────────────────────────

declare -A DETECTED_TIMES

monitor_logs() {
  log "Tailing PM2 logs: ${PM2_LOG}"

  # Get file position at start of monitoring
  local start_pos
  start_pos=$(wc -c < "$PM2_LOG" 2>/dev/null || echo 0)

  local timeout_at
  timeout_at=$(($(date +%s) + 20 * 60))  # 20 minutes max

  while (( $(date +%s) < timeout_at )); do
    # Read new lines since last check
    local current_size
    current_size=$(wc -c < "$PM2_LOG" 2>/dev/null || echo 0)

    if (( current_size > start_pos )); then
      local new_lines
      new_lines=$(tail -c +"$((start_pos + 1))" "$PM2_LOG" 2>/dev/null || true)
      start_pos=$current_size

      # Check each line against pipeline patterns
      while IFS= read -r line; do
        for time_slot in "${ORDERED_TIMES[@]}"; do
          if [[ -n "${DETECTED_TIMES[$time_slot]:-}" ]]; then
            continue  # Already detected
          fi

          local patterns="${PIPELINE_STEPS[$time_slot]}"
          IFS='|' read -ra PATTERNS <<< "$patterns"

          for pattern in "${PATTERNS[@]}"; do
            if echo "$line" | grep -qi "$pattern"; then
              DETECTED_TIMES[$time_slot]=$(date '+%H:%M:%S')
              log "✓ [${time_slot} PM] ${pattern} — detected at ${DETECTED_TIMES[$time_slot]}"
              break 2
            fi
          done
        done
      done <<< "$new_lines"
    fi

    # Check if all steps detected
    local all_done=true
    for time_slot in "${ORDERED_TIMES[@]}"; do
      if [[ -z "${DETECTED_TIMES[$time_slot]:-}" ]]; then
        all_done=false
        break
      fi
    done

    if $all_done; then
      log "All pipeline steps detected!"
      break
    fi

    sleep 5
  done
}

# ── Summary ──────────────────────────────────────────────────────────────

print_summary() {
  echo ""
  echo "══════════════════════════════════════════════════════════════"
  echo "  PIPELINE SUMMARY — ${DATE}"
  echo "══════════════════════════════════════════════════════════════"

  local passed=0
  local failed=0

  for time_slot in "${ORDERED_TIMES[@]}"; do
    local patterns="${PIPELINE_STEPS[$time_slot]}"
    # Get first pattern as label
    local label
    label=$(echo "$patterns" | cut -d'|' -f1)

    if [[ -n "${DETECTED_TIMES[$time_slot]:-}" ]]; then
      echo "  ✓ ${time_slot} PM — ${label} — fired at ${DETECTED_TIMES[$time_slot]}"
      ((passed++))
    else
      echo "  ✗ ${time_slot} PM — ${label} — NOT DETECTED"
      ((failed++))
    fi
  done

  echo ""
  echo "  Total: ${passed} passed, ${failed} failed out of ${#ORDERED_TIMES[@]}"
  echo "══════════════════════════════════════════════════════════════"

  # Log summary
  log "SUMMARY: ${passed}/${#ORDERED_TIMES[@]} pipeline steps detected"
  if (( failed > 0 )); then
    log "WARNING: ${failed} pipeline steps were NOT detected"
  fi
}

# ── Data Verification Queries ────────────────────────────────────────────

verify_data() {
  echo ""
  echo "══════════════════════════════════════════════════════════════"
  echo "  DATA VERIFICATION — ${DATE}"
  echo "══════════════════════════════════════════════════════════════"

  local DB_NAME="cse_dashboard"
  local DB_USER="cse_user"

  echo ""
  echo "--- Daily Prices (AEL.N0000) ---"
  psql -U "$DB_USER" -d "$DB_NAME" -c \
    "SELECT date, symbol, close_price FROM daily_prices WHERE symbol='AEL.N0000' ORDER BY date DESC LIMIT 3;" 2>/dev/null || echo "  (query failed)"

  echo ""
  echo "--- Technical Signals (AEL.N0000) ---"
  psql -U "$DB_USER" -d "$DB_NAME" -c \
    "SELECT date, symbol, close_price, sma_20, rsi_14 FROM technical_signals WHERE symbol='AEL.N0000' ORDER BY date DESC LIMIT 3;" 2>/dev/null || echo "  (query failed)"

  echo ""
  echo "--- Stock Scores (AEL.N0000) ---"
  psql -U "$DB_USER" -d "$DB_NAME" -c \
    "SELECT date, symbol, composite_score FROM stock_scores WHERE symbol='AEL.N0000' ORDER BY date DESC LIMIT 3;" 2>/dev/null || echo "  (query failed)"

  echo ""
  echo "--- Market Regime ---"
  psql -U "$DB_USER" -d "$DB_NAME" -c \
    "SELECT regime, confidence, detected_at FROM market_regime ORDER BY detected_at DESC LIMIT 3;" 2>/dev/null || echo "  (query failed)"

  echo ""
  echo "══════════════════════════════════════════════════════════════"
}

# ── Main ─────────────────────────────────────────────────────────────────

header
log "Pipeline monitor started"

# Initialize detection tracking
for time_slot in "${ORDERED_TIMES[@]}"; do
  DETECTED_TIMES[$time_slot]=""
done

wait_for_pipeline
monitor_logs
print_summary
verify_data

log "Pipeline monitor complete"
