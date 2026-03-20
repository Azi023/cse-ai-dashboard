# MEGA MISSION — CSE Dashboard: Fixes, Data, PDF Import & Improvements

⚠️ CRITICAL: `.env` must NEVER be touched, modified, read, or deleted under ANY circumstances. ⚠️
⚠️ SAFETY: Do NOT delete any database tables, drop schemas, or remove production data. ⚠️
⚠️ SAFETY: Do NOT stop PM2 services or modify ecosystem.config.js. ⚠️
⚠️ SAFETY: Only CREATE or MODIFY files — never delete files in ~/workspace/. ⚠️

Read `CLAUDE.md` in `~/workspace/cse-ai-dashboard/` FIRST for full project context.

## Execution Rules (READ THESE)

1. Complete tasks IN ORDER (1 → 14)
2. After EACH task: `cd ~/workspace/cse-ai-dashboard/src/backend && npx tsc --noEmit` — fix any errors before proceeding
3. Commit after every successful task with a descriptive message
4. If a task fails after 3 attempts, log the error in `tasks/mega-mission-report.md` and SKIP to next
5. Do NOT ask for input — make reasonable decisions and document them
6. For database access: use the backend API endpoints (curl localhost:3001/api/...) whenever possible. If raw SQL is needed, check if `psql` connects without password first (`psql -p 5432 -U cse_user -d cse_dashboard -h 127.0.0.1`). If it asks for password, try using TypeORM CLI or writing a quick NestJS script instead. NEVER read .env.
7. For external HTTP requests (CSE API, downloading PDFs): add 1-second delays between requests to be respectful
8. Log progress to `tasks/mega-mission-report.md` as you go — append after each task completion

---

## PHASE A: BUG FIXES (Tasks 1–3)

### TASK 1: Fix /stocks Page 404 Error (5 min)

The stocks page at localhost:3000/stocks throws Console AxiosError "Request failed with status code 404".

1. Read `src/frontend/app/stocks/page.tsx` — find what API endpoint(s) it calls
2. For each endpoint the frontend calls, verify it exists:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/stocks
   curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/stocks/search
   ```
3. If 404: check if the controller route exists in `src/backend/src/`. Search with:
   ```bash
   grep -rn "'/stocks'" src/backend/src/ --include="*.ts" | grep -v node_modules
   grep -rn "StocksController\|StocksModule" src/backend/src/ --include="*.ts" | grep -v node_modules
   ```
4. If the module/controller exists but isn't registered in `app.module.ts`, add it
5. If the route path is wrong, fix it
6. Test: `curl -s http://localhost:3001/api/stocks | head -c 200` — must return JSON
7. Verify in browser: hard refresh localhost:3000/stocks

### TASK 2: Full Endpoint Health Audit (10 min)

Test EVERY known backend endpoint. Fix any 404s or 500s.

```bash
echo "=== ENDPOINT HEALTH AUDIT ===" > /tmp/endpoint-audit.txt
for endpoint in \
  market/summary market/indices market/gainers market/losers market/active market/snapshot \
  stocks "stocks?page=1&limit=10" \
  portfolio portfolio/holdings portfolio/summary \
  signals signals/performance \
  analysis/brief analysis/recommendations \
  shariah/stats shariah/compliant shariah/non-compliant shariah/pending \
  notifications/daily-digest notifications/weekly-brief notifications/usage \
  alerts alerts/unread-count \
  orders orders/suggested orders/history \
  demo/accounts demo/accounts/1 demo/holdings/1 demo/trades "demo/trades?demo_account_id=1" \
  demo/performance/1 demo/benchmarks/1 demo/snapshots/1 demo/ai-log/1 \
  news announcements sectors sectors/summary \
  backtester/symbols \
  atrad/status \
  analysis/technical/AEL.N0000 analysis/stock/AEL.N0000 \
  dividends/calendar dividends/purification; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3001/api/$endpoint" 2>/dev/null)
  if [ "$STATUS" != "200" ]; then
    echo "❌ /api/$endpoint → $STATUS" | tee -a /tmp/endpoint-audit.txt
  else
    echo "✅ /api/$endpoint → 200" >> /tmp/endpoint-audit.txt
  fi
done
echo "=== AUDIT COMPLETE ===" >> /tmp/endpoint-audit.txt
cat /tmp/endpoint-audit.txt | grep "❌" | wc -l
echo "^ endpoints with errors (fix these)"
```

For each failing endpoint:
1. Check if the controller/route exists
2. If missing, create it or fix the route
3. If it's a service error (500), read the backend PM2 logs: `pm2 logs cse-backend --lines 20`
4. Fix and retest

### TASK 3: Frontend Page Rendering Check (10 min)

Verify all frontend pages load without errors:

```bash
for page in "" stocks portfolio signals orders demo demo/performance \
  shariah sectors news announcements compare performance backtester \
  dividends admin/financials settings journey alerts; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/$page" 2>/dev/null)
  echo "Page /$page → $STATUS"
done
```

Any non-200 page needs investigation. Check for:
- Missing page.tsx files in `src/frontend/app/`
- API calls to non-existent endpoints
- Import errors in components

---

## PHASE B: DATA ENRICHMENT (Tasks 4–8)

### TASK 4: Shariah Compliance Bulk Screening (20 min)

Current state: 11 compliant, 34 non-compliant, 242 PENDING. We need to reduce PENDING significantly.

**Step 1:** Get all sectors and their stock counts:
```bash
curl -s http://localhost:3001/api/sectors/summary | python3 -m json.tool
# OR query directly if that endpoint doesn't exist:
# Use a quick script or the analysis endpoints
```

**Step 2:** Bulk-screen by sector. Write a NestJS script or use raw SQL through an API endpoint.

Create `src/backend/src/scripts/seed-shariah.ts` (or add a POST endpoint):

**CONFIRMED COMPLIANT** (from Almas Equities Whitelist / Investment Brief):
- AEL.N0000 (Access Engineering — construction/infrastructure)
- TJL.N0000 (Teejay Lanka — textiles/manufacturing)  
- TKYO.X0000 (Tokyo Cement non-voting — cement/materials)
- LLUB.N0000 (Chevron Lubricants — lubricants)
- TILE.N0000 (Lanka Tiles — manufacturing)
- RCL.N0000 (Royal Ceramics — manufacturing)
- KVAL.N0000 (Kelani Valley Plantations — plantations/agriculture)
- COCO.N0000 (Renuka Foods — food processing)
- GRAN.N0000 (Granoland — food processing)
- DIPD.N0000 (Dipped Products — rubber manufacturing)
- HAYL.N0000 (Hayleys — diversified manufacturing — VERIFY parent company)

**CONFIRMED NON-COMPLIANT** — entire sectors:

Banks (conventional interest-based):
COMB.N0000, HNB.N0000, SAMP.N0000, SEYB.N0000, NDB.N0000, DFCC.N0000, 
PABC.N0000, UBC.N0000, NTB.N0000

Insurance (conventional):
AAIC.N0000, CTCE.N0000, HNBA.N0000, SLNS.N0000, CINS.N0000, JINS.N0000,
SINS.N0000, AMSL.N0000

Finance/Leasing (conventional interest):
LOLC.N0000, LFIN.N0000, CFIN.N0000, SFCL.N0000, LLFL.N0000, CRSF.N0000,
LFCL.N0000, BFIN.N0000, CFVF.N0000, LDEV.N0000, SMLL.N0000, PMIC.N0000,
AMF.N0000, COCR.N0000, HASU.N0000, LOFC.N0000, MBSL.N0000, MVIL.N0000,
PLC.N0000, VFIN.N0000, SFL.N0000

Alcohol/Tobacco:
CTC.N0000 (tobacco), DIST.N0000 (distilleries), LION.N0000 (brewery),
MELS.N0000 (Melstacorp — distilleries), CARG.N0000 (Ceylon Cold Stores — has liquor)

Hotels with casino operations:
JKH.N0000 (John Keells — casino via City of Dreams + Union Assurance)

**LIKELY COMPLIANT sectors** (set to PENDING_REVIEW, not COMPLIANT — need verification):
- Plantations (tea, rubber, coconut) — unless they have conventional debt >33% of market cap
- Manufacturing (tiles, ceramics, cables, pipes)
- Food & Beverage (non-alcohol)
- Healthcare
- Construction & Engineering
- IT/BPO
- Telecommunications (if no conventional debt issue)
- Power & Energy (if no conventional financing)

Implementation:
1. Create a service method or script to run these updates
2. Use the backend's existing `ShariaScreeningService` if it has an update method
3. If not, create a one-time seed endpoint: `POST /api/shariah/seed-bulk`
4. Log: "Moved X stocks from PENDING to COMPLIANT, Y to NON_COMPLIANT, Z remain PENDING"

### TASK 5: CSE API Financial Data Discovery & Import (30 min)

Probe the CSE API for company financial data.

```bash
# Test known and potential CSE API endpoints
for endpoint in companyInfoSummery companyFinancials quarterlyReport \
  financialStatements annualReport companyProfile dividendHistory \
  companyChart companyNews corporateActions; do
  echo "=== Testing: $endpoint ==="
  RESPONSE=$(curl -s -X POST "https://www.cse.lk/api/$endpoint" \
    -H "Content-Type: application/json" \
    -H "User-Agent: Mozilla/5.0" \
    -d "{\"symbol\":\"AEL.N0000\"}" 2>/dev/null)
  echo "$RESPONSE" | head -c 800
  echo -e "\n"
  sleep 1
done
```

**For `companyInfoSummery`** — this likely returns P/E, EPS, market cap, 52-week high/low.
If it does:
1. Create or verify `company_financials` table exists (check with `\dt company*`)
2. If not, create the migration:
```sql
CREATE TABLE IF NOT EXISTS company_financials (
  id SERIAL PRIMARY KEY,
  stock_id INT REFERENCES stocks(id),
  symbol VARCHAR(20) NOT NULL,
  period VARCHAR(20) NOT NULL DEFAULT 'CURRENT',
  revenue DECIMAL(15,2),
  net_income DECIMAL(15,2),
  total_assets DECIMAL(15,2),
  total_liabilities DECIMAL(15,2),
  total_equity DECIMAL(15,2),
  eps DECIMAL(10,4),
  pe_ratio DECIMAL(10,2),
  book_value DECIMAL(10,2),
  market_cap DECIMAL(18,2),
  dividend_yield DECIMAL(8,4),
  debt_to_equity DECIMAL(10,4),
  price_to_book DECIMAL(10,2),
  fifty_two_week_high DECIMAL(10,2),
  fifty_two_week_low DECIMAL(10,2),
  interest_bearing_debt DECIMAL(15,2),
  non_permissible_income_pct DECIMAL(8,4),
  raw_data JSONB,
  fetched_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(stock_id, period)
);
```
3. Write a script to fetch for top 50 most-traded stocks (use trade volume from market data):
   - 1-second delay between each API call
   - Parse response and insert into `company_financials`
   - Handle CSE API returning numbers as strings (use `parseFloat()`)
4. Log: "Imported financial data for X stocks"

**IMPORTANT:** This financial data enables:
- Shariah Tier 2 financial ratio screening (debt/market_cap < 33%, non-permissible income < 5%)
- Fundamental scoring (P/E, EPS growth, book value)
- Valuation scoring (P/B, dividend yield)
- The scoring engine jumps from ~40% data coverage to ~90%

### TASK 6: CBSL Macro Data Seeding (15 min)

1. Check `macro_data` table structure:
```bash
curl -s http://localhost:3001/api/market/macro 2>/dev/null | head -c 200
# If that fails, check the table directly
```

2. Seed current publicly-known CBSL data. Create a backend endpoint if needed, or use the existing macro service.

Key data points to seed:
```
CBSL_OPR: 8.25 (as of March 2026 — Standing Lending Facility Rate)
CBSL_SDF: 7.25 (Standing Deposit Facility Rate)
INFLATION_CCPI_YOY: ~2.4% (Feb 2026)
USD_LKR: ~295 (approximate mid-rate)
FX_RESERVES_USD_BN: ~6.2 (gross official reserves)
GDP_GROWTH_Q4_2025: ~5.0% (estimated)
TREASURY_BILL_91D: ~9.5% (approximate 91-day T-bill yield)
ASPI_PE_RATIO: ~10.1 (current market P/E)
CSE_MARKET_CAP_LKR_TN: ~4.8 (total market cap in LKR trillions)
FOREIGN_NET_BUYING_MTD: -500 (approximate March net foreign, negative = selling, LKR millions)
```

Note: These are approximate public values from CBSL press releases and CSE summaries. The March 25 CBSL rate decision will update OPR and SDF.

3. Verify the AI analysis pipeline can access macro data:
```bash
grep -rn "macro" src/backend/src/analysis/ --include="*.ts"
grep -rn "macro" src/backend/src/ai/ --include="*.ts"
grep -rn "macro" src/backend/src/notifications/ --include="*.ts"
```
If the AI prompt templates don't include macro data, update them to inject macro context.

### TASK 7: Historical Price Backfill via CSE chartData API (30 min)

We need 20+ days of OHLC data for SMA/RSI/MACD. Currently ~4 days.

1. Check current data coverage:
```bash
curl -s http://localhost:3001/api/market/summary | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('Current data from API')
" 2>/dev/null
```

2. Test the CSE chartData endpoint:
```bash
curl -s -X POST "https://www.cse.lk/api/chartData" \
  -H "Content-Type: application/json" \
  -H "User-Agent: Mozilla/5.0" \
  -d '{"symbol":"AEL.N0000","period":"1M"}' | python3 -m json.tool | head -50
```

3. If it returns OHLC data with dates, write a backfill script:
   - Target: top 30 Shariah-compliant and PENDING_REVIEW stocks
   - Fetch 1-month or 3-month history for each
   - Parse dates and OHLC values
   - Insert into `daily_prices` table, skipping existing dates (ON CONFLICT DO NOTHING)
   - 1-second delay between requests
   - Log total: "Backfilled X price records across Y stocks, now have Z days of data"

4. After backfill, trigger technical analysis recalculation:
```bash
curl -s -X POST http://localhost:3001/api/analysis/recalculate 2>/dev/null
# If that endpoint doesn't exist, the next market-close cron will pick it up
```

### TASK 8: PDF Audit Report Download & Extraction (45 min)

CSE publishes annual reports and quarterly financial statements as PDFs on company pages.

**Step 1: Discover the CSE company page structure**

```bash
# Check if CSE has a file/document listing endpoint
for endpoint in companyDocuments companyReports companyFilings financialDocuments \
  annualReports quarterlyReports corporateFilings; do
  echo "=== $endpoint ==="
  curl -s -X POST "https://www.cse.lk/api/$endpoint" \
    -H "Content-Type: application/json" \
    -H "User-Agent: Mozilla/5.0" \
    -d '{"symbol":"AEL.N0000"}' 2>/dev/null | head -c 500
  echo -e "\n"
  sleep 1
done

# Also check the announcements endpoint for PDF attachments
curl -s -X POST "https://www.cse.lk/api/financialAnnouncementsBySymbol" \
  -H "Content-Type: application/json" \
  -d '{"symbol":"AEL.N0000"}' | python3 -m json.tool | head -80
```

**Step 2: If PDF URLs are found in any response:**

Create a Playwright script to download them: `src/backend/src/scripts/download-audit-reports.ts`

```typescript
// Pseudocode structure — adapt based on actual API response
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

const REPORT_DIR = path.join(process.cwd(), 'data', 'audit-reports');
if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

async function downloadReport(symbol: string, url: string, filename: string) {
  const filepath = path.join(REPORT_DIR, `${symbol}_${filename}`);
  if (fs.existsSync(filepath)) {
    console.log(`Already exists: ${filepath}`);
    return filepath;
  }
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  fs.writeFileSync(filepath, response.data);
  console.log(`Downloaded: ${filepath} (${response.data.length} bytes)`);
  return filepath;
}
```

**Step 3: PDF Text Extraction**

Install a PDF parser:
```bash
cd ~/workspace/cse-ai-dashboard
npm install pdf-parse --save
# OR: pip install --break-system-packages pdfplumber tabula-py
```

Create `src/backend/src/scripts/extract-financials-from-pdf.ts`:
```typescript
// Extract financial tables from downloaded PDFs
// Key data to extract:
// - Revenue, Net Income, Total Assets, Total Liabilities
// - Interest-bearing debt (for Shariah ratio screen)
// - Non-permissible income sources (for purification calc)
// - EPS, Dividend per share
// Store extracted data in company_financials table
```

**Step 4: If NO PDF endpoints are found in the CSE API:**

Use the existing `financialAnnouncementsBySymbol` or `approvedAnnouncements` endpoints — financial results are often posted as announcements with PDF attachments. Parse the announcement body text for key financial figures even without downloading the PDF.

Alternative: The CSE website at `https://www.cse.lk/pages/company-profile/company-profile.component.html?symbol=AEL.N0000` likely has a "Financials" tab. If the API has no direct financial endpoint, we can parse what `companyInfoSummery` gives us (it probably has P/E, EPS, market cap at minimum).

**Step 5: Store and index extracted data**

Create `data/audit-reports/index.json`:
```json
{
  "AEL.N0000": {
    "annual_2025": { "file": "AEL.N0000_annual_2025.pdf", "extracted": true, "key_figures": {...} },
    "quarterly_Q3_2025": { "file": "AEL.N0000_Q3_2025.pdf", "extracted": true, "key_figures": {...} }
  }
}
```

This index allows the AI analysis pipeline to reference financial data per stock.

---

## PHASE C: AI & SCORING IMPROVEMENTS (Tasks 9–11)

### TASK 9: Wire Financial Data Into Scoring Engine (20 min)

After Tasks 5 and 8 have imported financial data:

1. Read the scoring service: `src/backend/src/analysis/` or `src/backend/src/scoring/`
2. Find where `calculateFundamentalScore()` is defined
3. Check if it reads from `company_financials` table
4. If not, update it to:
   - Fetch latest financial data for the stock
   - P/E ratio scoring: P/E < 8 = 10/10, 8-12 = 7/10, 12-18 = 5/10, >18 = 3/10
   - EPS growth scoring: positive growth = higher score
   - Debt/equity scoring: lower is better (especially for Shariah)
   - Dividend yield scoring: higher yield for conservative investors = higher score
   - Market cap scoring: larger = more stable for conservative profile
5. Similarly, check `calculateValuationScore()` and wire in P/B ratio, dividend yield

### TASK 10: Wire Macro Data Into AI Analysis Prompts (15 min)

1. Find where Claude API prompts are constructed:
```bash
grep -rn "anthropic\|claude\|system.*prompt\|user.*prompt" src/backend/src/ --include="*.ts" | grep -v node_modules | head -20
```

2. Find the market brief and signal generation prompts
3. Add macro data context to the AI system prompt:
```
Current macro environment:
- CBSL policy rate: ${opr}% (lending), ${sdf}% (deposit)  
- Inflation (CCPI YoY): ${inflation}%
- USD/LKR: ${usdlkr}
- Foreign reserves: $${reserves}B
- Market P/E ratio: ${marketPE}x
- Foreign net buying (MTD): LKR ${foreignNet}M
```

4. This makes the AI's daily digest and signals much more contextually aware

### TASK 11: Shariah Tier 2 Financial Ratio Screening (20 min)

If financial data was imported in Tasks 5/8, implement the AAOIFI financial ratio screen:

1. For each stock with financial data in `company_financials`:
   - **Debt screen**: Interest-bearing debt / Market cap < 33% → PASS
   - **Liquidity screen**: (Cash + interest-bearing securities) / Market cap < 33% → PASS  
   - **Revenue screen**: Non-permissible income / Total revenue < 5% → PASS
   - All three PASS → upgrade from PENDING to COMPLIANT
   - Any FAIL → set to NON_COMPLIANT with specific reason

2. Create `POST /api/shariah/run-tier2-screening` endpoint
3. Run it and log results:
   - "Tier 2 screening: X stocks screened, Y upgraded to COMPLIANT, Z downgraded to NON_COMPLIANT"

---

## PHASE D: QA & POLISH (Tasks 12–14)

### TASK 12: Demo Trading Account Verification (10 min)

1. Check demo account status:
```bash
curl -s http://localhost:3001/api/demo/accounts/1 | python3 -m json.tool
```

2. Check if AI auto-trader made any trades today:
```bash
curl -s "http://localhost:3001/api/demo/trades?demo_account_id=1" | python3 -m json.tool | head -30
```

3. Manually trigger an AI trade cycle:
```bash
curl -s -X POST http://localhost:3001/api/demo/ai-trade/1 | python3 -m json.tool
```

4. If the AI says "no qualifying signals" — check why:
   - Are there any Shariah-compliant stocks with score > 7.0?
   - `curl -s http://localhost:3001/api/signals | python3 -m json.tool | head -30`
   - If scores are too low, the AI might need the financial data from Task 5 to score properly

5. Make a manual demo trade to verify the engine works:
```bash
curl -s -X POST http://localhost:3001/api/demo/trades \
  -H "Content-Type: application/json" \
  -d '{"demo_account_id":1,"symbol":"TJL.N0000","direction":"BUY","quantity":500,"source":"MANUAL"}' | python3 -m json.tool
```

### TASK 13: Full TypeScript Audit (5 min)

```bash
cd ~/workspace/cse-ai-dashboard/src/backend && npx tsc --noEmit
echo "Backend: $?"
cd ~/workspace/cse-ai-dashboard/src/frontend && npx tsc --noEmit  
echo "Frontend: $?"
```

Fix ANY TypeScript errors. Zero errors is the requirement.

### TASK 14: Generate Mission Report & Git Push (10 min)

Create `tasks/mega-mission-report.md`:

```markdown
# Mega Mission Report — March 20, 2026

## Summary
- Tasks completed: X/14
- Tasks skipped (with reason): Y
- TypeScript errors: 0

## Phase A: Bug Fixes
- [ ] Task 1: /stocks 404 fix — [DONE/FAILED/SKIPPED] — details
- [ ] Task 2: Endpoint audit — X/Y endpoints passing
- [ ] Task 3: Frontend pages — X/Y pages rendering

## Phase B: Data Enrichment  
- [ ] Task 4: Shariah bulk screening — now X compliant, Y non-compliant, Z pending (was 11/34/242)
- [ ] Task 5: Financial data import — X stocks with financial data (was 0)
- [ ] Task 6: CBSL macro data — X data points seeded (was 0)
- [ ] Task 7: Price backfill — now X days of data (was ~4)
- [ ] Task 8: PDF audit reports — X reports downloaded, Y extracted

## Phase C: AI Improvements
- [ ] Task 9: Scoring engine wired to financial data — [Y/N]
- [ ] Task 10: AI prompts include macro context — [Y/N]
- [ ] Task 11: Shariah Tier 2 ratio screening — X stocks screened

## Phase D: QA
- [ ] Task 12: Demo trading verified — X demo trades, AI trader status
- [ ] Task 13: TypeScript clean — 0 errors
- [ ] Task 14: Report generated, git pushed

## Data State After Mission
- Shariah: X compliant / Y non-compliant / Z pending
- Daily prices: X total days across Y stocks
- Company financials: X stocks with data
- Macro data points: X
- Demo trades: X
- AI token usage: X / 500,000

## Errors Encountered
(document any errors that couldn't be fixed)

## Recommendations for Next Session
(what should Atheeque focus on next)
```

Then:
```bash
cd ~/workspace/cse-ai-dashboard
git add -A
git status
git commit -m "mega-mission: shariah bulk screening, financial data, macro data, price backfill, PDF import, scoring improvements, bug fixes"
git push
```

---

## IMPORTANT NOTES

- The backend is running on PM2 — do NOT restart it unless absolutely necessary. If you must restart: `pm2 restart cse-backend`
- PostgreSQL is on port 5432 (NOT 5433 — that was old). Host: 127.0.0.1
- The CSE API base URL is `https://www.cse.lk/api/` — all endpoints are POST with JSON body
- CSE API returns numbers as STRINGS — always use parseFloat() or the safeNum() utility
- Redis is running locally on default port 6379
- AI token budget: 500K tokens/month, currently at 1,326 — plenty of room
- If you create new database tables, create them via TypeORM migration in `src/backend/src/database/migrations/`
- If you add new NestJS modules, register them in `app.module.ts`
- Downloaded files go in `data/` directory (create subdirectories as needed)

⚠️ CRITICAL: `.env` must NEVER be touched, modified, read, or deleted under ANY circumstances. ⚠️
