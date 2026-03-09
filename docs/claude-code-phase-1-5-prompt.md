## Phase 1.5 — Shariah Screening + Portfolio Tracker + Bug Fixes

The Phase 1 dashboard is built. Now I need three major features added, plus any bugs fixed. No AI/Claude API needed for any of this — it's all logic and data.

Please read /docs/cse-dashboard-blueprint-v2.md again for the full Shariah screening spec and portfolio requirements.

### TASK 1: Fix Any Existing Issues First

Before adding new features:
- Make sure the backend starts cleanly with `npm run start:dev`
- Make sure the frontend starts cleanly with `npm run dev`
- Test that CSE API data is being fetched and cached in Redis
- Check PostgreSQL connection and table creation
- Fix any TypeScript errors, missing dependencies, or runtime crashes
- Make sure the dashboard loads at localhost:3000 and shows data (even if market is closed, cached data should display)

### TASK 2: Shariah Screening Engine

Build a complete Shariah compliance screening system based on SEC Sri Lanka's standardized methodology. This has TWO tiers:

#### Tier 1: Business Activity Screen (Hard-coded Blacklist)

Create a file `src/backend/modules/shariah-screening/blacklist.ts` with stocks that are AUTOMATICALLY NON-COMPLIANT. These must NEVER appear in the Shariah-compliant view:

```typescript
// HARAM BUSINESS ACTIVITIES — auto-exclude
export const SHARIAH_BLACKLIST = {
  // Alcohol & Beverages
  alcohol: [
    { symbol: 'DIST.N0000', name: 'Distilleries Company of Sri Lanka PLC', reason: 'Alcohol production' },
    { symbol: 'LION.N0000', name: 'Lion Brewery (Ceylon) PLC', reason: 'Beer production' },
    { symbol: 'BREW.N0000', name: 'Ceylon Beverage Holdings PLC', reason: 'Alcohol/beer production' },
    { symbol: 'GILI.N0000', name: 'Gilnow (Pvt) Ltd', reason: 'Alcohol distribution' },
    { symbol: 'CARG.N0000', name: 'Cargills (Ceylon) PLC', reason: 'Significant alcohol retail segment' },
  ],
  
  // Tobacco
  tobacco: [
    { symbol: 'CTC.N0000', name: 'Ceylon Tobacco Company PLC', reason: 'Tobacco manufacturing' },
  ],
  
  // Conventional Banking (interest-based)
  conventionalBanking: [
    { symbol: 'COMB.N0000', name: 'Commercial Bank of Ceylon PLC', reason: 'Conventional banking' },
    { symbol: 'HNB.N0000', name: 'Hatton National Bank PLC', reason: 'Conventional banking' },
    { symbol: 'SAMP.N0000', name: 'Sampath Bank PLC', reason: 'Conventional banking' },
    { symbol: 'SEYB.N0000', name: 'Seylan Bank PLC', reason: 'Conventional banking' },
    { symbol: 'NDB.N0000', name: 'National Development Bank PLC', reason: 'Conventional banking' },
    { symbol: 'DFCC.N0000', name: 'DFCC Bank PLC', reason: 'Conventional banking' },
    { symbol: 'PABC.N0000', name: 'Pan Asia Banking Corporation PLC', reason: 'Conventional banking' },
    { symbol: 'UBC.N0000', name: 'Union Bank of Colombo PLC', reason: 'Conventional banking' },
    { symbol: 'CARG.N0000', name: 'Cargills Bank Ltd', reason: 'Conventional banking' },
  ],
  
  // Conventional Insurance
  conventionalInsurance: [
    { symbol: 'ALIC.N0000', name: 'Sri Lanka Insurance Corporation Ltd', reason: 'Conventional insurance' },
    { symbol: 'JINS.N0000', name: 'Janashakthi Insurance PLC', reason: 'Conventional insurance' },
    { symbol: 'CINS.N0000', name: 'Ceylinco Insurance PLC', reason: 'Conventional insurance' },
    { symbol: 'AINS.N0000', name: 'Allianz Insurance Lanka Ltd', reason: 'Conventional insurance' },
    { symbol: 'HASU.N0000', name: 'HNB Assurance PLC', reason: 'Conventional insurance' },
    { symbol: 'UASL.N0000', name: 'Union Assurance PLC', reason: 'Conventional insurance' },
    { symbol: 'COOP.N0000', name: 'Co-operative Insurance Co PLC', reason: 'Conventional insurance' },
  ],
  
  // Finance Companies (interest-based lending)
  financeCompanies: [
    { symbol: 'LFIN.N0000', name: 'LOLC Finance PLC', reason: 'Conventional finance/leasing' },
    { symbol: 'CDB.N0000', name: 'Citizens Development Business PLC', reason: 'Conventional finance' },
    { symbol: 'CFIN.N0000', name: 'Central Finance Company PLC', reason: 'Conventional finance' },
    { symbol: 'LFCL.N0000', name: 'LB Finance PLC', reason: 'Conventional finance' },
    { symbol: 'PLC.N0000', name: 'People\'s Leasing & Finance PLC', reason: 'Conventional finance/leasing' },
    { symbol: 'SFCL.N0000', name: 'Singer Finance (Lanka) PLC', reason: 'Conventional finance' },
    { symbol: 'SENA.N0000', name: 'Senkadagala Finance PLC', reason: 'Conventional finance' },
    { symbol: 'SMLL.N0000', name: 'SMB Leasing PLC', reason: 'Conventional leasing' },
    { symbol: 'COCR.N0000', name: 'Commercial Credit and Finance PLC', reason: 'Conventional finance' },
  ],
};

// Helper: Get flat list of all blacklisted symbols
export function getBlacklistedSymbols(): string[] {
  return Object.values(SHARIAH_BLACKLIST)
    .flat()
    .map(item => item.symbol);
}

// Helper: Check if a symbol is blacklisted
export function isBlacklisted(symbol: string): { blacklisted: boolean; reason?: string; category?: string } {
  for (const [category, stocks] of Object.entries(SHARIAH_BLACKLIST)) {
    const found = stocks.find(s => s.symbol === symbol);
    if (found) {
      return { blacklisted: true, reason: found.reason, category };
    }
  }
  return { blacklisted: false };
}
```

NOTE: The symbol format on CSE uses `.N0000` suffix. Verify against actual CSE data — some symbols may differ slightly. The blacklist should be treated as a starting point and refined as we get real data.

#### Tier 2: Financial Ratio Screen

For stocks that PASS Tier 1 (not blacklisted), apply these financial ratio screens. A stock is compliant only if ALL four pass:

| Ratio | Formula | Threshold | Pass Condition |
|-------|---------|-----------|----------------|
| Interest Income | (Interest income + non-compliant income) / Total Revenue | 5% | Must be LESS than 5% |
| Debt Ratio | Interest-bearing debt / Market Capitalization | 30% | Must be LESS than 30% |
| Interest Deposits | Interest-bearing deposits / Market Capitalization | 30% | Must be LESS than 30% |
| Receivables Ratio | (Receivables + Prepayments + Cash) / Total Assets | 50% | Must be LESS than 50% |

For now, since we don't have company financials data yet, create the schema and calculation logic but mark stocks as "PENDING_REVIEW" if financial data isn't available. Only stocks in the blacklist are "NON_COMPLIANT". Everything else is "PENDING_REVIEW" until we have financials.

#### Shariah Status Types:
```typescript
enum ShariahStatus {
  COMPLIANT = 'COMPLIANT',           // Passes both Tier 1 and Tier 2
  NON_COMPLIANT = 'NON_COMPLIANT',   // Fails Tier 1 (blacklisted) or Tier 2
  PENDING_REVIEW = 'PENDING_REVIEW', // Not blacklisted but no financial data for Tier 2
}
```

#### API Endpoints for Shariah:
- `GET /api/shariah/compliant` — List all compliant stocks
- `GET /api/shariah/non-compliant` — List all non-compliant with reasons
- `GET /api/shariah/pending` — List stocks pending review
- `GET /api/shariah/status/:symbol` — Get Shariah status for a specific stock
- `GET /api/shariah/stats` — Summary (X compliant, Y non-compliant, Z pending)

#### Frontend: Shariah Screener Page
- Create a new page at `/shariah`
- Show three tabs: Compliant | Non-Compliant | Pending Review
- Each stock shows: symbol, name, sector, price, change%, Shariah status badge
- For non-compliant stocks, show the reason (e.g., "Alcohol production", "Conventional banking")
- Color coding: green badge for compliant, red for non-compliant, yellow for pending
- Add a Shariah filter toggle on the main market overview page — when ON, it hides all non-compliant and pending stocks

### TASK 3: Portfolio Tracker

Build a portfolio management module where I can track my holdings.

#### Database Entity: Portfolio Holdings
```typescript
{
  id: number;                    // auto-increment
  symbol: string;                // e.g., 'JKH.N0000'
  quantity: number;              // shares owned
  buyPrice: number;              // average purchase price per share
  buyDate: Date;                 // date of purchase
  notes: string;                 // optional notes
  isShariahCompliant: boolean;   // derived from Shariah screening
  createdAt: Date;
  updatedAt: Date;
}
```

#### Portfolio Calculations (derive from live price data):
- Current value = quantity × current price
- Invested value = quantity × buy price
- Unrealized P&L = current value - invested value
- P&L percentage = ((current price - buy price) / buy price) × 100
- Total portfolio value = sum of all holdings' current values
- Total invested = sum of all holdings' invested values
- Total P&L = total value - total invested
- Portfolio allocation % = (holding value / total value) × 100
- Daily change = sum of (quantity × today's price change) for all holdings

#### API Endpoints:
- `GET /api/portfolio` — Get all holdings with live prices and P&L
- `POST /api/portfolio` — Add a new holding (symbol, quantity, buyPrice, buyDate)
- `PUT /api/portfolio/:id` — Update a holding
- `DELETE /api/portfolio/:id` — Remove a holding
- `GET /api/portfolio/summary` — Total value, total P&L, allocation breakdown
- `GET /api/portfolio/shariah` — Portfolio Shariah compliance summary

#### Frontend: Portfolio Page
- Create a new page at `/portfolio`
- Summary cards at top: Total Value, Total Invested, Total P&L (with % and color)
- Holdings table: Symbol, Name, Qty, Avg Price, Current Price, P&L, P&L%, Allocation%, Shariah Status
- "Add Holding" button/form (symbol selector, quantity, buy price, date)
- Edit/Delete actions per holding
- Portfolio allocation pie chart (by stock)
- Sector allocation pie chart
- Performance vs ASPI benchmark chart (if we have enough historical data)
- Shariah compliance summary: "X% of portfolio is Shariah compliant"

### TASK 4: Purification Calculator

For Shariah-compliant investors, build a purification amount calculator.

#### Logic:
For each holding where the stock is COMPLIANT (not non-compliant):
- Purification Amount = Total Dividends Received × (Non-Compliant Income % / Total Income)
- Since we may not have exact non-compliant income %, use a default of 3% (conservative estimate) with option to override per stock

#### Frontend Addition:
- Add a "Purification" section on the portfolio page
- Show per-holding purification estimate
- Show total purification amount
- Note: "Purification amounts are estimates. Consult a qualified Shariah scholar for exact calculations."

### TASK 5: Navigation & Layout

- Add a proper navigation bar/sidebar with links to:
  - Dashboard (/) — Market overview
  - Stocks (/stocks) — Browse all stocks
  - Shariah (/shariah) — Shariah screener
  - Portfolio (/portfolio) — My portfolio
- Add a header showing: Market Status (open/closed), ASPI value, time
- Make the layout responsive

### CODING STANDARDS
- TypeScript strict mode
- Proper error handling on all endpoints
- Loading states and error states on all frontend pages
- Use the existing shadcn/ui components (card, badge, table, tabs)
- Keep the dark theme consistent
- Commit after each major feature is working
