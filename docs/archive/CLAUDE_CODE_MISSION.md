# CSE Dashboard — Claude Code Mission Brief
# Date: March 13, 2026 | Time-sensitive: 2–3 hour window
# Run with: claude --dangerously-skip-permissions

---

## CONTEXT & PRIORITY ORDER

You are working on a personal CSE (Colombo Stock Exchange) AI investment dashboard.
- Workspace: `~/workspace/cse-ai-dashboard/`
- Backend: NestJS on port 3001
- Frontend: Next.js on port 3000
- Stack: PostgreSQL (port 5433), Redis, Playwright, Claude Sonnet API
- GitHub: https://github.com/Azi023/cse-ai-dashboard.git
- The user has LKR 20,000 deposited in ATrad (HNB Stockbrokers) and wants to invest TODAY.
- Time constraint: 2–3 hours. Prioritize ruthlessly.

**EXECUTION ORDER — do not skip steps, do not reorder:**
1. Fix the runtime error (blocking the UI)
2. Verify servers are running + data is real-time
3. Check cron job log history
4. Run ATrad Playwright sync (LKR 20K confirmed deposited)
5. Run two verification agents in parallel
6. Generate today's investment plan (rich AI analysis, no token restriction)
7. Optimize token usage for non-investment endpoints
8. Final status report

---

## PHASE 1 — FIX RUNTIME ERROR (< 5 minutes)

There is a persistent "1 Issue" runtime error in the browser at `src/components/layout/header.tsx`.
Error: `aspiValue.toFixed is not a function`

**Step 1.1 — Inspect the ACTUAL compiled file on disk:**
```bash
grep -n "aspiValue\|aspiChange" ~/workspace/cse-ai-dashboard/src/frontend/src/components/layout/header.tsx
```

**Step 1.2 — If ANY line shows `.toFixed()` WITHOUT `Number()` wrapping, fix it:**
Every occurrence must follow this pattern:
- WRONG: `aspiValue.toFixed(2)` 
- RIGHT: `Number(aspiValue).toFixed(2)`
- WRONG: `aspiChange > 0`
- RIGHT: `Number(aspiChange) > 0`

Also check: is `aspiValue` typed as `number | null` in useState? If the API returns it as a string, the type is wrong. Fix the type to `string | number | null` OR parse it at the fetch point:

```typescript
// In the useEffect that fetches ASPI data, wrap the value:
setAspiValue(parseFloat(data.aspiValue) || null);
setAspiChange(parseFloat(data.aspiChange) || null);
```

Whichever approach you use — make sure it's consistent in ALL three places in the file (desktop ticker, mobile nav, any other occurrence).

**Step 1.3 — Clear the Turbopack cache and verify:**
```bash
cd ~/workspace/cse-ai-dashboard/src/frontend
rm -rf .next
npx tsc --noEmit 2>&1 && echo "TYPESCRIPT OK"
```

**Step 1.4 — Commit:**
```bash
cd ~/workspace/cse-ai-dashboard
git add src/frontend/src/components/layout/header.tsx
git commit -m "fix: definitively resolve aspiValue.toFixed runtime error"
git push origin master
```

---

## PHASE 2 — SERVER STATUS + DATA FRESHNESS CHECK (< 10 minutes)

**Step 2.1 — Check what is running:**
```bash
# Check backend
curl -s http://localhost:3001/api/health 2>/dev/null || echo "BACKEND DOWN"
lsof -i :3001 | head -5

# Check frontend  
curl -s http://localhost:3000 2>/dev/null | head -20 || echo "FRONTEND DOWN"
lsof -i :3000 | head -5

# Check Redis
redis-cli ping

# Check PostgreSQL
psql -h localhost -p 5433 -U postgres -d cse_dashboard -c "SELECT NOW();" 2>/dev/null || echo "DB CHECK FAILED"
```

**Step 2.2 — If backend is DOWN, start it:**
```bash
cd ~/workspace/cse-ai-dashboard/src/backend
npm run start:dev &
sleep 8
curl -s http://localhost:3001/api/health
```

**Step 2.3 — If frontend is DOWN, start it:**
```bash
# Kill any ghost processes first
fuser -k 3000/tcp 2>/dev/null
pkill -f "next dev" 2>/dev/null
sleep 2
cd ~/workspace/cse-ai-dashboard/src/frontend
npm run dev &
sleep 10
```

**Step 2.4 — DATA FRESHNESS AUDIT — critical check:**

```bash
# Check Redis cache timestamps
redis-cli GET "ai:signals:cache" | python3 -c "
import json, sys, datetime
data = json.load(sys.stdin)
if isinstance(data, list) and len(data) > 0:
    print(f'Signals cache: {len(data)} signals found')
    print(f'First signal: {data[0].get(\"symbol\",\"?\")}, generated: {data[0].get(\"generatedAt\",\"UNKNOWN\")}')
" 2>/dev/null || echo "Signals cache empty or unparseable"

redis-cli GET "ai:daily-brief:cache" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(f'Daily brief date: {data.get(\"date\",\"UNKNOWN\")}')
print(f'Sentiment: {data.get(\"marketSentiment\",\"UNKNOWN\")}')
" 2>/dev/null || echo "Daily brief cache empty"

# Check TTLs
echo "Signals TTL: $(redis-cli TTL 'ai:signals:cache') seconds"
echo "Daily brief TTL: $(redis-cli TTL 'ai:daily-brief:cache') seconds"

# Check database for last market data sync
psql -h localhost -p 5433 -U postgres -d cse_dashboard -c "
SELECT 
  'Last stock price sync' as check_name,
  MAX(updated_at) as last_updated,
  COUNT(*) as total_records
FROM stock_prices
UNION ALL
SELECT 
  'Last announcements sync',
  MAX(created_at),
  COUNT(*)
FROM announcements
WHERE created_at > NOW() - INTERVAL '24 hours';
" 2>/dev/null
```

**Step 2.5 — LIVE DATA VALIDATION — verify CSE API is returning real current values:**

```bash
# Hit the live stocks endpoint and compare a known stock
curl -s "http://localhost:3001/api/stocks?limit=5" | python3 -c "
import json, sys
stocks = json.load(sys.stdin)
if isinstance(stocks, list):
    for s in stocks[:3]:
        print(f\"{s.get('symbol')}: LKR {s.get('price')} | Change: {s.get('changePercent')}% | Updated: {s.get('updatedAt','UNKNOWN')}\")
elif isinstance(stocks, dict) and 'data' in stocks:
    for s in stocks['data'][:3]:
        print(f\"{s.get('symbol')}: LKR {s.get('price')} | Change: {s.get('changePercent')}%\")
"

# Cross-check: pull ASPI directly from CSE API endpoint
curl -s "http://localhost:3001/api/market/indices" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(f'ASPI: {data.get(\"aspi\",{}).get(\"value\",\"N/A\")}')
print(f'S&P SL20: {data.get(\"sp20\",{}).get(\"value\",\"N/A\")}')
"
```

**Step 2.6 — If data is STALE (older than today):**
Trigger a manual refresh:
```bash
curl -s -X POST http://localhost:3001/api/market/refresh
curl -s -X POST http://localhost:3001/api/shariah/refresh-whitelist
sleep 5
echo "Refresh triggered. Waiting for data to populate..."
```

---

## PHASE 3 — CRON JOB AUDIT (< 5 minutes)

**Step 3.1 — Check if cron jobs actually ran:**
```bash
# Check cron is active
crontab -l

# Check all log files
echo "=== EOD Signals Log ==="
cat ~/workspace/cse-ai-dashboard/logs/eod-signals.log 2>/dev/null | tail -30 || echo "LOG FILE MISSING"

echo "=== Shariah Refresh Log ==="
cat ~/workspace/cse-ai-dashboard/logs/shariah.log 2>/dev/null | tail -20 || echo "LOG FILE MISSING"

echo "=== Start/Stop Script Logs ==="
ls -la ~/workspace/cse-ai-dashboard/logs/ 2>/dev/null

# Check system cron log
grep "cse-ai-dashboard\|start-dashboard\|eod-signals\|shariah" /var/log/syslog 2>/dev/null | tail -20 || \
grep "cse-ai-dashboard\|start-dashboard" /var/log/cron.log 2>/dev/null | tail -20 || \
journalctl -u cron --since "3 days ago" 2>/dev/null | grep -i "cse\|dashboard\|signals" | tail -20 || \
echo "No cron logs found in standard locations"

# Check if log directory even exists
ls -la ~/workspace/cse-ai-dashboard/logs/ 2>/dev/null || echo "logs/ directory does not exist"
```

**Step 3.2 — Fix cron configuration if broken:**

If logs directory is missing or logs are empty, the cron jobs never ran. Fix:

```bash
# Create logs directory
mkdir -p ~/workspace/cse-ai-dashboard/logs

# Verify start script is executable and correct
cat ~/workspace/cse-ai-dashboard/scripts/start-dashboard.sh
chmod +x ~/workspace/cse-ai-dashboard/scripts/start-dashboard.sh
chmod +x ~/workspace/cse-ai-dashboard/scripts/stop-dashboard.sh

# Test the EOD signal generation manually RIGHT NOW
echo "Testing EOD signal generation..."
curl -s -X POST http://localhost:3001/api/ai/signals/generate-eod 2>&1 | head -100
echo "EOD test complete"

# Re-install crontab properly with absolute paths and logging
crontab -l > /tmp/current_cron.txt 2>/dev/null

# Write a verified crontab
cat > /tmp/new_cron.txt << 'CRONEOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/home/atheeque/.nvm/bin

# CSE Dashboard — Market hours Mon-Fri
# Start backend + frontend at 9:30 AM
30 9 * * 1-5 /home/atheeque/workspace/cse-ai-dashboard/scripts/start-dashboard.sh >> /home/atheeque/workspace/cse-ai-dashboard/logs/cron-start.log 2>&1

# EOD signal generation at 2:35 PM (after market close at 2:30 PM)
35 14 * * 1-5 curl -s -X POST http://localhost:3001/api/ai/signals/generate-eod >> /home/atheeque/workspace/cse-ai-dashboard/logs/eod-signals.log 2>&1

# Shariah whitelist refresh at 9:25 AM (before market open)
25 9 * * 1-5 curl -s -X POST http://localhost:3001/api/shariah/refresh-whitelist >> /home/atheeque/workspace/cse-ai-dashboard/logs/shariah.log 2>&1

# Stop at 2:30 PM
30 14 * * 1-5 /home/atheeque/workspace/cse-ai-dashboard/scripts/stop-dashboard.sh >> /home/atheeque/workspace/cse-ai-dashboard/logs/cron-stop.log 2>&1
CRONEOF

crontab /tmp/new_cron.txt
echo "Crontab installed:"
crontab -l
```

---

## PHASE 4 — ATRAD PLAYWRIGHT SYNC (< 15 minutes)

The user has LKR 20,000 confirmed deposited (visible in ATrad account statement as Direct Receipt SD8506668 on 2026-03-13). Run the sync to pull this into the dashboard.

**Step 4.1 — Check environment variables are set:**
```bash
grep -E "ATRAD_URL|ATRAD_USERNAME|ATRAD_PASSWORD" ~/workspace/cse-ai-dashboard/src/backend/.env | sed 's/=.*/=***REDACTED***/'
```

**Step 4.2 — Run the ATrad sync endpoint:**
```bash
echo "Triggering ATrad sync..."
curl -s -X POST http://localhost:3001/api/atrad/sync | python3 -c "
import json, sys
try:
    result = json.load(sys.stdin)
    print(f'Sync status: {result.get(\"status\", result)}')
    print(f'Holdings found: {result.get(\"holdingsCount\", \"N/A\")}')
    print(f'Cash balance: LKR {result.get(\"cashBalance\", \"N/A\")}')
except:
    print('Raw response:', sys.stdin.read())
" 2>/dev/null
```

**Step 4.3 — If API sync fails, run the Playwright recon script directly:**
```bash
cd ~/workspace/cse-ai-dashboard
npx ts-node scripts/test-atrad-connection.ts 2>&1 | tail -50
```

**Step 4.4 — Inspect the HTML dump to find stock holding selectors:**
```bash
# Check if HTML dump exists from last recon
ls -la ~/workspace/cse-ai-dashboard/data/atrad-sync/

# If stock-holding-dump.html exists, extract the table structure
python3 -c "
from html.parser import HTMLParser
import re

try:
    with open('/home/atheeque/workspace/cse-ai-dashboard/data/atrad-sync/stock-holding-dump.html', 'r', errors='ignore') as f:
        content = f.read()
    
    # Find table-like structures
    tables = re.findall(r'<table[^>]*id=[\"\'](.*?)[\"\'](.*?)</table>', content, re.DOTALL)
    print(f'Found {len(tables)} tables with IDs:')
    for t in tables[:10]:
        print(f'  ID: {t[0]}')
    
    # Look for equity/holding divs
    divs = re.findall(r'id=[\"\'](.*?equity.*?|.*?holding.*?|.*?portfolio.*?)[\"\']()', content, re.IGNORECASE)
    print(f'Equity-related IDs: {[d[0] for d in divs[:10]]}')
except FileNotFoundError:
    print('HTML dump not found — sync needs to run first')
"
```

**Step 4.5 — Update portfolio with cash balance even if no holdings yet:**

Check the portfolio_holdings table and update cash balance:
```bash
psql -h localhost -p 5433 -U postgres -d cse_dashboard -c "
-- Check current portfolio state
SELECT * FROM portfolio_holdings LIMIT 10;

-- Check if cash/deposit tracking table exists
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE '%portfolio%' OR table_name LIKE '%wallet%' OR table_name LIKE '%balance%';
"
```

If the deposit (LKR 20,000) is not reflected in the dashboard portfolio, insert it manually:
```bash
psql -h localhost -p 5433 -U postgres -d cse_dashboard -c "
-- Update or insert cash balance for the ATrad account
INSERT INTO portfolio_settings (key, value, updated_at) 
VALUES ('cash_balance', '20000', NOW())
ON CONFLICT (key) DO UPDATE SET value = '20000', updated_at = NOW();
" 2>/dev/null || echo "portfolio_settings table may not exist — check schema"
```

---

## PHASE 5 — DUAL VERIFICATION AGENTS

Run both verification checks. Report ALL failures clearly.

### AGENT A — Data Accuracy Verification

**A1 — Cross-check stock prices against CSE live feed:**
```bash
python3 << 'PYEOF'
import urllib.request
import json
import time

BASE = "http://localhost:3001"

def fetch(url):
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            return json.loads(r.read())
    except Exception as e:
        return {"error": str(e)}

print("=" * 60)
print("AGENT A: DATA ACCURACY VERIFICATION")
print("=" * 60)

# 1. Check ASPI matches what ATrad shows (21,636.75 area from screenshot)
indices = fetch(f"{BASE}/api/market/indices")
aspi = indices.get("aspi", {}).get("value") or indices.get("aspi")
print(f"\n[ASPI Check]")
print(f"  Dashboard reports: {aspi}")
print(f"  ATrad showed: ~21,636 (from your screenshot)")
if aspi:
    diff = abs(float(str(aspi).replace(',','')) - 21636)
    status = "✅ MATCH" if diff < 100 else "⚠️  DRIFT (could be time difference)"
    print(f"  Status: {status} (diff: {diff:.0f} pts)")

# 2. Check a few specific stocks from ATrad market watch
CHECK_STOCKS = ["JKH.N0000", "GLAS.N0000", "DFCC.N0000"]
print(f"\n[Stock Price Spot-Check]")
stocks_resp = fetch(f"{BASE}/api/stocks?limit=50")
stocks = stocks_resp if isinstance(stocks_resp, list) else stocks_resp.get("data", [])
stock_map = {s.get("symbol"): s for s in stocks}

for sym in CHECK_STOCKS:
    s = stock_map.get(sym)
    if s:
        print(f"  {sym}: LKR {s.get('price')} | {s.get('changePercent')}% | Updated: {s.get('updatedAt','?')[:19]}")
    else:
        print(f"  {sym}: NOT FOUND in API response")

# 3. Verify signals are dated today
print(f"\n[Signals Freshness Check]")
signals = fetch(f"{BASE}/api/ai/signals")
if isinstance(signals, list):
    for sig in signals[:3]:
        gen_at = sig.get("generatedAt", sig.get("timestamp", "UNKNOWN"))
        print(f"  {sig.get('symbol')}: {sig.get('direction')} | Generated: {gen_at}")
else:
    print(f"  Unexpected signals format: {type(signals)}")

# 4. Check news is recent
print(f"\n[News Freshness Check]")
news = fetch(f"{BASE}/api/news?limit=3")
news_items = news if isinstance(news, list) else news.get("data", [])
for item in news_items[:3]:
    print(f"  [{item.get('publishedAt','?')[:10]}] {item.get('title','?')[:60]}")

print("\n" + "=" * 60)
PYEOF
```

**A2 — Check Shariah data accuracy:**
```bash
curl -s http://localhost:3001/api/shariah/overview | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(f'Shariah overview:')
print(f'  Total screened: {data.get(\"totalScreened\", \"?\")} / {data.get(\"totalStocks\", 295)}')
print(f'  Compliant: {data.get(\"compliant\", \"?\")}')
print(f'  Non-compliant: {data.get(\"nonCompliant\", \"?\")}')
print(f'  Pending: {data.get(\"pending\", \"?\")}')
print(f'  Last updated: {data.get(\"lastUpdated\", \"UNKNOWN\")}')
"
```

### AGENT B — Feature Health Check

```bash
python3 << 'PYEOF'
import urllib.request
import json

BASE = "http://localhost:3001"

def check(name, url, method="GET", expect_key=None):
    try:
        req = urllib.request.Request(url, method=method)
        if method == "POST":
            req.add_header("Content-Type", "application/json")
            req.data = b"{}"
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read())
            if expect_key:
                val = data.get(expect_key, "KEY_MISSING")
                status = "✅" if val != "KEY_MISSING" else "⚠️"
                print(f"  {status} {name}: key '{expect_key}' = {str(val)[:50]}")
            else:
                print(f"  ✅ {name}: OK ({type(data).__name__})")
    except Exception as e:
        print(f"  ❌ {name}: FAILED — {str(e)[:80]}")

print("=" * 60)
print("AGENT B: FEATURE HEALTH CHECK")
print("=" * 60)

print("\n[Core Data Endpoints]")
check("Market Indices", f"{BASE}/api/market/indices")
check("All Stocks (295)", f"{BASE}/api/stocks?limit=10")
check("News Feed", f"{BASE}/api/news?limit=5")
check("Announcements", f"{BASE}/api/announcements?limit=5")
check("Shariah Overview", f"{BASE}/api/shariah/overview")

print("\n[AI Endpoints — Cache Served]")
check("Trading Signals", f"{BASE}/api/ai/signals")
check("Daily Brief", f"{BASE}/api/ai/daily-brief")

print("\n[Portfolio Endpoints]")
check("Portfolio Holdings", f"{BASE}/api/portfolio/holdings")
check("Portfolio Summary", f"{BASE}/api/portfolio/summary")
check("ATrad Sync Status", f"{BASE}/api/atrad/status")

print("\n[Analysis Endpoints]")
check("Stock Analysis - JKH", f"{BASE}/api/ai/analyze/JKH.N0000")
check("Backtester", f"{BASE}/api/backtester/symbols")

print("\n[Settings / Meta]")
check("Health", f"{BASE}/api/health")

print("\n" + "=" * 60)
PYEOF
```

**If ANY endpoint returns ❌ — fix it before moving to Phase 6.**

---

## PHASE 6 — TODAY'S INVESTMENT ANALYSIS (NO TOKEN RESTRICTIONS)

This is the most important phase. The user has LKR 20,000 to invest today. 
**Do NOT cache these results. Do NOT restrict tokens. Use full Claude Sonnet analysis.**

### Step 6.1 — Force-regenerate fresh signals for today

```bash
echo "Forcing fresh EOD signal generation for today..."
# Bypass cache and force new analysis
curl -s -X POST "http://localhost:3001/api/ai/signals/generate-eod" \
  -H "Content-Type: application/json" \
  -d '{"forceRefresh": true}' | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    print(f'Generated {len(data) if isinstance(data, list) else \"?\"} fresh signals')
except:
    print(sys.stdin.read()[:200])
"
sleep 5
```

### Step 6.2 — Generate investment plan via AI chat endpoint

Make a rich AI call for the investment plan. Use max_tokens: 4000 for this call specifically:

Check `src/backend/src/modules/ai-engine/ai-engine.service.ts` — find or create an investment planning endpoint. If no dedicated endpoint exists, use the chat endpoint with this payload:

```bash
curl -s -X POST http://localhost:3001/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "I have LKR 20,000 to invest today on the CSE. I am a beginner investor following a Shariah-compliant, conservative, long-term strategy. My plan is Rupee Cost Averaging (RCA) with LKR 10,000 per month. I do NOT want to put all money in one stock. Give me: 1) Which 2-4 Shariah-compliant stocks are best to invest in TODAY based on current market data, 2) How much LKR to allocate to each stock and how many shares to buy at current prices, 3) Step-by-step how to place the order on ATrad platform, 4) My KPIs to track: expected return %, breakeven point, and 12-month forecast, 5) Red flags or risks I should know about these stocks, 6) How this fits into a monthly RCA strategy going forward. Base your response on current CSE data, ASPI trend, and today market sentiment.",
    "context": "beginner_investor_lkr_20000_shariah_rca"
  }' | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    content = data.get('content') or data.get('message') or data.get('response') or str(data)
    print(content)
except:
    raw = sys.stdin.read()
    print(raw[:3000])
"
```

### Step 6.3 — Stock-specific deep analysis for top candidates

After Step 6.2 identifies candidates, run deep analysis on each. Example for top 3 Shariah-compliant picks:

```bash
for SYMBOL in "COMB.N0000" "SAMP.N0000" "HNB.N0000"; do
  echo ""
  echo "========== DEEP ANALYSIS: $SYMBOL =========="
  curl -s "http://localhost:3001/api/ai/analyze/$SYMBOL" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    print(f'Symbol: {data.get(\"symbol\",\"?\")}')
    print(f'Shariah: {data.get(\"shariahStatus\",\"?\")}')
    print(f'Recommendation: {data.get(\"recommendation\",\"?\")}')
    print(f'Target Price: LKR {data.get(\"targetPrice\",\"?\")}')
    print(f'Analysis: {str(data.get(\"analysis\",\"\"))[:500]}')
except:
    print(sys.stdin.read()[:500])
  "
  sleep 2
done
```

### Step 6.4 — Generate KPIs and Goals

```bash
curl -s -X POST http://localhost:3001/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Based on a LKR 20,000 initial investment on CSE today with LKR 10,000 monthly top-up (RCA strategy), Shariah-compliant stocks only, 5-year horizon: 1) What are realistic return KPIs? (3-month, 6-month, 1-year, 3-year, 5-year targets in LKR and %) 2) What portfolio value milestones should I set? 3) What is the expected dividend income annually if I pick dividend-paying Shariah stocks? 4) What is my break-even timeline? 5) Generate a monthly investment calendar for the next 6 months showing: date to buy, which stocks to buy, how much to add each month. Base everything on current CSE data and actual stock prices.",
    "context": "kpi_goals_forecast_lkr_rca"
  }' | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    print(data.get('content') or data.get('message') or data.get('response') or str(data)[:3000])
except:
    print(sys.stdin.read()[:3000])
"
```

### Step 6.5 — Save the investment plan to a file

All the output from Steps 6.2–6.4 must be saved to:
```bash
mkdir -p ~/workspace/cse-ai-dashboard/data/investment-plans
PLAN_FILE=~/workspace/cse-ai-dashboard/data/investment-plans/plan-$(date +%Y-%m-%d).md
echo "# Investment Plan — $(date '+%B %d, %Y')" > $PLAN_FILE
echo "## Generated at: $(date)" >> $PLAN_FILE
echo "" >> $PLAN_FILE
# Append all analysis output to this file
echo "Plan saved to: $PLAN_FILE"
```

---

## PHASE 7 — TOKEN OPTIMIZATION (Don't touch investment analysis endpoints)

**DO NOT restrict tokens for:** signals, daily-brief (investment), stock analysis, chat, KPIs, portfolio assessment

**DO optimize tokens for:** news fetching, announcements, stock list metadata, health checks

**Step 7.1 — Audit current max_tokens settings:**
```bash
grep -n "max_tokens" ~/workspace/cse-ai-dashboard/src/backend/src/modules/ai-engine/ai-engine.service.ts
```

**Step 7.2 — Apply these specific limits (only if wrong):**

Open `src/backend/src/modules/ai-engine/ai-engine.service.ts` and verify:

| Endpoint/Function | Correct max_tokens | Rationale |
|---|---|---|
| `getSignals()` / signal generator | **1500** | Already fixed — don't change |
| `getDailyBrief()` | **2000** | Market brief needs detail |
| `analyzeStock()` | **2000** | Deep analysis needs room |
| `chat()` | **3000** | Conversational needs flexibility |
| Any news summarization | **500** | Brief summaries only |
| Any metadata/classification | **200** | Structured output only |

**Step 7.3 — Add this check to prevent API calls for already-cached signals:**

In `getLiveSignals()`, verify this guard is present AT THE TOP of the function (before ANY Anthropic client instantiation):

```typescript
// This must be the FIRST thing in getLiveSignals()
const cached = await this.redis.get('ai:signals:cache');
if (cached && !forceRefresh) {
  this.logger.log('Signals served from Redis cache — skipping Claude call');
  return JSON.parse(cached);
}
```

**Step 7.4 — Add request deduplication for concurrent callers:**

If multiple users hit the signals endpoint simultaneously before cache is warm, they'll all trigger Claude calls. Add a Redis lock:

```typescript
// In getLiveSignals(), after the cache check:
const lockKey = 'ai:signals:generating';
const isGenerating = await this.redis.get(lockKey);
if (isGenerating) {
  this.logger.warn('Signal generation already in progress — waiting for cache...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  const retryCache = await this.redis.get('ai:signals:cache');
  if (retryCache) return JSON.parse(retryCache);
}
// Set lock before calling Claude
await this.redis.set(lockKey, '1', 'EX', 120); // 2 min lock
// ... call Claude ...
// After getting response, delete lock
await this.redis.del(lockKey);
```

**Step 7.5 — TypeScript compile check after any changes:**
```bash
cd ~/workspace/cse-ai-dashboard/src/backend && npx tsc --noEmit 2>&1 && echo "BACKEND OK"
cd ~/workspace/cse-ai-dashboard/src/frontend && npx tsc --noEmit 2>&1 && echo "FRONTEND OK"
```

---

## PHASE 8 — FINAL STATUS REPORT

After completing all phases, generate this report:

```bash
python3 << 'PYEOF'
import urllib.request, json, subprocess, os
from datetime import datetime

def fetch(url, timeout=10):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return json.loads(r.read()), None
    except Exception as e:
        return None, str(e)

print("=" * 70)
print(f"  CSE DASHBOARD — FINAL STATUS REPORT")
print(f"  Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print("=" * 70)

print("\n🔧 SERVICES")
for name, url in [("Backend API", "http://localhost:3001/api/health"),
                   ("Frontend", "http://localhost:3000")]:
    data, err = fetch(url)
    print(f"  {'✅' if not err else '❌'} {name}: {'UP' if not err else 'DOWN — ' + str(err)[:50]}")

print("\n📊 DATA FRESHNESS")
data, _ = fetch("http://localhost:3001/api/market/indices")
if data:
    print(f"  ✅ Market indices: ASPI {data.get('aspi',{}).get('value','?') if isinstance(data.get('aspi'),dict) else data.get('aspi','?')}")

data, _ = fetch("http://localhost:3001/api/ai/signals")
if data and isinstance(data, list):
    print(f"  ✅ Trading signals: {len(data)} active signals cached")

data, _ = fetch("http://localhost:3001/api/ai/daily-brief")
if data:
    print(f"  ✅ Daily brief: {data.get('date','?')[:10]} | {data.get('marketSentiment','?')}")

print("\n💰 INVESTMENT READINESS")
data, _ = fetch("http://localhost:3001/api/portfolio/summary")
if data:
    print(f"  Cash available: LKR {data.get('cashBalance', 'Check manually')}")
    print(f"  Holdings: {data.get('holdingsCount', 0)} positions")
else:
    print("  ⚠️  Portfolio API not responding — check manually")

print("\n📋 CRON JOBS")
logs = [
    ("EOD Signals", "/home/atheeque/workspace/cse-ai-dashboard/logs/eod-signals.log"),
    ("Shariah Refresh", "/home/atheeque/workspace/cse-ai-dashboard/logs/shariah.log"),
]
for name, path in logs:
    if os.path.exists(path):
        size = os.path.getsize(path)
        print(f"  ✅ {name}: log exists ({size} bytes)")
    else:
        print(f"  ❌ {name}: log file MISSING")

print("\n🚨 ACTION REQUIRED BEFORE INVESTING")
print("  1. Verify ASPI on ATrad matches dashboard ASPI")
print("  2. Check investment plan at: ~/workspace/cse-ai-dashboard/data/investment-plans/")
print("  3. Confirm Shariah status of chosen stocks is COMPLIANT (not Pending)")
print("  4. Verify stock prices match ATrad before placing orders")
print("  5. Use ATrad 'Stock Holding' after purchase to confirm execution")
print("  6. Dashboard URL: http://localhost:3000")
print("=" * 70)
PYEOF
```

---

## IMPORTANT REMINDERS FOR CLAUDE CODE

1. **Commit after every phase that makes code changes** — use descriptive messages
2. **Never hardcode investment data** — all data must come from live CSE API or ATrad Playwright
3. **The investment plan (Phase 6) is time-sensitive** — today's market data only
4. **If Playwright ATrad login fails** — check `.env` for `ATRAD_URL`, `ATRAD_USERNAME`, `ATRAD_PASSWORD`
5. **PostgreSQL is on port 5433** (not default 5432) — always use `-p 5433`
6. **Redis must be running** — `redis-cli ping` should return `PONG`
7. **The Shariah filter is non-negotiable** — never recommend a Non-Compliant or Pending stock for purchase
8. **ATrad credentials are in `.env`** — do not print them, do not log them
9. **All investment advice must include disclaimer** — "for educational purposes, not financial advice"
10. **Push to GitHub at the end** — `git push origin master`

---

## DONE CRITERIA

Claude Code session is complete when ALL of these are true:
- [ ] Runtime error ("aspiValue.toFixed is not a function") is gone
- [ ] Both servers running (3000 + 3001)
- [ ] Data confirmed real-time (today's date on ASPI, signals, brief)
- [ ] Cron logs exist OR crontab is fixed and verified
- [ ] ATrad sync attempted (success or documented failure reason)
- [ ] Investment plan generated and saved to file
- [ ] KPIs and goals generated
- [ ] All feature health checks pass (Agent B green)
- [ ] Token optimizations applied without breaking investment endpoints
- [ ] Final status report printed
- [ ] All changes committed and pushed to GitHub
