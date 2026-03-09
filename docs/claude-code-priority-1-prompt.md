## Priority 1: CBSL Macro Data + Historical Backfill + Company Financials + GitHub

Read /docs/remaining-work-tracker.md for full project status. We're at ~55% complete. This session focuses on the 3 most critical missing pieces plus pushing to GitHub.

---

### TASK 0: Push to GitHub FIRST

Before building anything new, commit and push everything we have:

```bash
cd ~/workspace/cse-ai-dashboard
git add -A
git commit -m "Phase 1 + 1.5 + 2: Full dashboard with CSE data, Shariah screening, portfolio, AI mock mode"
```

Then create a private GitHub repo and push:
```bash
# I'll create the repo on GitHub manually, you just set up the remote
git remote add origin <REPO_URL>
git branch -M main  
git push -u origin main
```

Wait for me to provide the GitHub repo URL before pushing. But do the commit now.

Also make sure .gitignore includes:
```
node_modules/
.env
.env.local
dist/
.next/
data/ai-generated/
*.Zone.Identifier
```

---

### TASK 1: Historical Price Data Backfill

The CSE API has `chartData` and `companyChartDataByStock` endpoints that return historical price data. We need to backfill as much history as possible for all actively traded stocks.

#### Backend Script: `scripts/backfill-history.ts`

```typescript
// This script:
// 1. Gets all stock symbols from the database
// 2. For each stock, calls the CSE chartData endpoint with different periods
// 3. Stores historical OHLCV data in the daily_prices table
// 4. Handles rate limiting (don't hammer the CSE API — add 500ms delay between requests)
// 5. Skips stocks that already have history for a given date
// 6. Reports progress: "Backfilled X stocks, Y total records"

// CSE API endpoint: POST https://www.cse.lk/api/chartData
// Parameters: symbol (string), chartId (string), period (string)
// Try different period values to see what data comes back
// Also try: POST https://www.cse.lk/api/companyChartDataByStock
// Parameters: stockId (string), period (number — try 1, 2, 3, etc.)

// The response format needs to be examined — run a test call first to see
// what fields are returned (date, open, high, low, close, volume)
// and map them to our daily_prices table schema
```

Run the script and report what data was retrieved — how far back does the CSE API provide data?

#### Also: Improve the daily cron job
Currently the daily price persistence runs once at 15:00. Enhance it to:
- Also save snapshot at 12:00 (mid-day) for intraday analysis
- Store the day's high/low/open properly (not just last traded price)
- Verify no duplicate records for the same stock+date

---

### TASK 2: CBSL Macro Data Integration

The Central Bank of Sri Lanka publishes economic data as downloadable Excel (.xlsx) files. We need to ingest these.

#### Backend: CBSL Data Module

Create `src/backend/src/modules/cbsl-data/`

```typescript
// cbsl-data.service.ts
// 
// This service:
// 1. Downloads CBSL Excel files from known URLs
// 2. Parses them using SheetJS (xlsx package — install it: npm install xlsx)
// 3. Extracts key indicators and stores in macro_data table
// 4. Runs on a schedule (weekly — CBSL updates monthly/weekly)

// Key Excel file URLs (these are real, working URLs):
const CBSL_URLS = {
  interestRatesMonthly: 'https://www.cbsl.gov.lk/sites/default/files/cbslweb_documents/statistics/sheets/table4.04_20260305.xlsx',
  monetarySurvey: 'https://www.cbsl.gov.lk/sites/default/files/cbslweb_documents/statistics/sheets/table4.02_20260219.xlsx',
  reserveMoney: 'https://www.cbsl.gov.lk/sites/default/files/cbslweb_documents/statistics/sheets/table4.11_20260126.xlsx',
  commercialBankAssets: 'https://www.cbsl.gov.lk/sites/default/files/cbslweb_documents/statistics/sheets/table4.08_20260126.xlsx',
};

// Note: CBSL URLs change when new data is published (the date in the filename changes)
// For MVP: download once, parse, and store. Later: auto-detect latest URLs.
// 
// The Excel files have multiple sheets and complex formatting.
// Strategy: 
// 1. Download the file to data/cbsl-macro/
// 2. Open with SheetJS
// 3. Identify the relevant sheet and rows
// 4. Extract the latest data points
// 5. Store in macro_data table with: indicator_name, date, value, source

// Key indicators to extract:
// - Standing Deposit Facility Rate (SDFR) — CBSL policy rate
// - Standing Lending Facility Rate (SLFR) — CBSL policy rate
// - Average Weighted Prime Lending Rate (AWPLR)
// - Average Weighted Deposit Rate (AWDR)
// - Treasury Bill yields (91-day, 182-day, 364-day)
// - Money Supply M2
// - Private Sector Credit growth
```

#### Also: USD/LKR Exchange Rate
CBSL daily indicators page has the exchange rate. For a simpler approach:
- Use a free FX API (e.g., exchangerate-api.com or similar) to get daily USD/LKR
- Store in macro_data table
- Display on dashboard

#### Frontend: Macro Dashboard Section
Add a "Macro Indicators" section to the dashboard (below the AI Daily Brief):

```
Design:
┌──────────────────────────────────────────────┐
│  📊 Sri Lanka Economic Indicators            │
│                                               │
│  CBSL Policy Rate    8.25% (↓ from 8.50%)   │
│  AWPLR              10.45% (↓ trending)      │
│  T-Bill (91d)        9.12%                   │
│  USD/LKR            298.50 (↑ +0.3%)         │
│  Inflation (CCPI)    5.2% YoY                │
│  Money Supply (M2)   LKR 12.4T               │
│                                               │
│  Last updated: March 2026                     │
│  Source: Central Bank of Sri Lanka            │
└──────────────────────────────────────────────┘
```

Color code: green if indicator is favorable for stocks (rate cuts, low inflation), red if unfavorable.

---

### TASK 3: Company Financials — Manual Entry System

Since parsing PDFs automatically is complex, build a manual entry system first that lets me input key financials for important stocks.

#### Backend: Company Financials Module

Create `src/backend/src/modules/company-financials/`

Database entity: `company_financials`
```typescript
{
  id: number;
  symbol: string;                    // e.g., 'JKH.N0000'
  fiscalYear: string;                // e.g., '2024/2025'
  quarter: string;                   // 'Q1', 'Q2', 'Q3', 'Q4', 'ANNUAL'
  
  // Income Statement
  totalRevenue: number;              // LKR
  interestIncome: number;            // LKR — needed for Shariah screen
  nonCompliantIncome: number;        // LKR — income from haram activities
  netProfit: number;                 // LKR
  earningsPerShare: number;          // LKR
  
  // Balance Sheet
  totalAssets: number;               // LKR
  totalLiabilities: number;          // LKR
  shareholdersEquity: number;        // LKR
  interestBearingDebt: number;       // LKR — needed for Shariah screen
  interestBearingDeposits: number;   // LKR — needed for Shariah screen
  receivables: number;               // LKR — needed for Shariah screen
  prepayments: number;               // LKR
  cashAndEquivalents: number;        // LKR
  
  // Derived (calculate on save)
  peRatio: number;                   // Price / EPS
  pbRatio: number;                   // Price / Book value per share
  debtToEquity: number;              // Total liabilities / Equity
  returnOnEquity: number;            // Net profit / Equity
  dividendYield: number;             // Annual dividend / Price
  
  // Metadata
  source: string;                    // 'MANUAL' | 'CSE_ANNUAL_REPORT' | 'PARSED'
  reportDate: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

#### API Endpoints:
- `POST /api/financials` — Add financial data for a stock
- `GET /api/financials/:symbol` — Get all financial records for a stock
- `GET /api/financials/:symbol/latest` — Get most recent financial data
- `PUT /api/financials/:id` — Update a record

#### Frontend: Financial Data Entry Page
Create `/admin/financials` page:
- Form to enter financial data for a stock
- Dropdown to select stock symbol (searchable)
- Fields for all the financial data points above
- On save: automatically triggers Shariah Tier 2 re-screening for that stock
- Table showing stocks with financials entered vs. pending

#### After Financial Data Is Entered:
- Shariah screening service should re-run Tier 2 checks
- Stocks should move from PENDING_REVIEW to COMPLIANT or NON_COMPLIANT
- Stock detail page should show fundamental metrics (P/E, P/B, ROE, D/E)
- AI analysis should incorporate fundamental data when available

#### Start With These Key Stocks (Most Traded):
I'll manually enter financials for these first:
JKH.N0000, LOLC.N0000, COMB.N0000 (non-compliant but for reference), 
HNB.N0000 (non-compliant), SAMP.N0000 (non-compliant),
EXPO.N0000, DIAL.N0000, CTC.N0000 (non-compliant),
DIPD.N0000, TKYO.N0000, CARS.N0000, CARG.N0000,
HHL.N0000, HAYL.N0000, RCL.N0000

---

### TASK 4: Dashboard Improvements

While building the above, also improve these:

1. **Market Overview — Show previous close comparison:**
   - Display "Prev Close: X | Open: Y" for ASPI and S&P SL20
   - Show YTD return (year-to-date performance)

2. **Gainers/Losers tables — Add company names:**
   - Show "LOLC.N0000 — L O L C Holdings PLC" not just the symbol
   - Make rows clickable (navigate to /stocks/[symbol])
   
3. **Stock detail page — Show key metrics:**
   - If company_financials data exists, display: P/E, P/B, ROE, D/E, Div Yield
   - If not, show "Financials not yet available" with link to admin entry page
   - Show beta value (already in API data)

4. **Sector indices — Better visualization:**
   - Color gradient backgrounds (dark green for >+2%, light green for 0-2%, light red for 0 to -2%, dark red for <-2%)
   - Sort by performance (best to worst) with toggle to sort alphabetically

---

### CODING STANDARDS
- Install xlsx package: `npm install xlsx` (in backend)
- Proper error handling for CBSL downloads (they may be slow or unavailable)
- Rate limit CSE API calls in the backfill script (500ms between requests minimum)
- All new API endpoints need TypeScript interfaces
- Commit after each task completes
- Update remaining-work-tracker.md status after each task
