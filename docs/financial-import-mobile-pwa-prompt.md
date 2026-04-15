# Financial Data Admin Tool + Mobile PWA Optimization

⚠️ CRITICAL: `.env` must NEVER be touched, modified, read, or deleted under ANY circumstances. ⚠️
⚠️ SAFETY: Do NOT delete any database tables, drop schemas, or remove production data. ⚠️

Read `CLAUDE.md` first for full project context.

---

## TASK 1: Financial Data Admin Import Page (45 min)

### Problem
The scoring engine's fundamental (35%) and valuation (25%) components have ZERO data. The CSE API doesn't expose P/E, EPS, or balance sheet data. We need a manual import tool.

### Build: Admin Financials Import Page

Create or enhance `src/frontend/app/admin/financials/page.tsx`

**Layout:**

**A. CSE Auto-Fetch Section**

The CSE `companyInfoSummery` API returns SOME financial data (market cap, 52w high/low, last price). Auto-fetch what's available:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Auto-Fetch from CSE API                              [Fetch All]    │
│                                                                     │
│ Fetches market cap, 52w high/low, last price, volume for all        │
│ Shariah-compliant stocks from the CSE API.                          │
│                                                                     │
│ Last fetched: Never                   Stocks with data: 0/11        │
└─────────────────────────────────────────────────────────────────────┘
```

The "Fetch All" button calls a new backend endpoint that:
1. Gets all COMPLIANT stocks from shariah_screenings
2. For each, calls `POST https://www.cse.lk/api/companyInfoSummery` with `{"symbol":"XXX.N0000"}`
3. Extracts: market cap, 52w high, 52w low, last traded price, volume, any P/E or EPS if present
4. Upserts into `company_financials` table
5. 1-second delay between requests
6. Returns progress to frontend

**B. Manual Entry Form**

For data that CSE API doesn't provide (from annual reports / CSE filings):

```
┌─────────────────────────────────────────────────────────────────────┐
│ Manual Financial Data Entry                                         │
│                                                                     │
│ Stock: [AEL.N0000 ▾]    Period: [FY-2025 ▾]                       │
│                                                                     │
│ Income Statement:                                                   │
│ Revenue (LKR M):  [________]    Net Income (LKR M): [________]     │
│ EPS (LKR):        [________]    Dividend/Share:     [________]     │
│                                                                     │
│ Balance Sheet:                                                      │
│ Total Assets (LKR M):      [________]                               │
│ Total Liabilities (LKR M): [________]                               │
│ Total Equity (LKR M):      [________]                               │
│ Interest-Bearing Debt (LKR M): [________]                           │
│                                                                     │
│ Shariah Ratios (auto-calculated):                                   │
│ Debt/Market Cap: --% (needs market cap)                             │
│ Non-Permissible Income: [________] %                                │
│                                                                     │
│                                              [Save Financial Data]  │
└─────────────────────────────────────────────────────────────────────┘
```

When the user enters Total Assets, Total Liabilities, and Interest-Bearing Debt, auto-calculate:
- Debt/Equity ratio
- Debt/Market Cap ratio (using market cap from CSE API)
- If Debt/Market Cap > 33% → flag as "Shariah Tier 2 FAIL"

**C. CSV Bulk Import**

```
┌─────────────────────────────────────────────────────────────────────┐
│ CSV Bulk Import                                                     │
│                                                                     │
│ Upload a CSV with columns:                                          │
│ symbol, period, revenue, net_income, total_assets,                  │
│ total_liabilities, total_equity, eps, interest_bearing_debt         │
│                                                                     │
│ [Choose File]  [Upload & Import]                                    │
│                                                                     │
│ Download template: [CSV Template]                                   │
└─────────────────────────────────────────────────────────────────────┘
```

**D. Current Data Table**

Show all stocks with their financial data status:

```
Stock          Period    Revenue    Net Inc.   EPS    P/E    Debt/MCap   Status
AEL.N0000      FY-2025  12,500M    1,200M     3.50   18.2   12%         ✅ Complete
TJL.N0000      —        —          —          —      —      —           ❌ Missing
TKYO.X0000     —        —          —          —      —      —           ❌ Missing
```

### Backend Endpoints

Add to existing `FinancialsController` or create new:

```
POST /api/financials/fetch-cse       — Auto-fetch from CSE API for all compliant stocks
POST /api/financials/import          — Manual single-stock entry
POST /api/financials/import-csv      — CSV bulk import
GET  /api/financials/status          — Data coverage status (X of Y stocks have data)
GET  /api/financials/:symbol         — Get financial data for a stock
GET  /api/financials/template-csv    — Download CSV template
```

### Important Implementation Notes

- The `company_financials` table should already exist from the mega mission. If not, create it.
- Use the entity pattern from existing modules (check `src/backend/src/modules/` for examples)
- After importing financial data, trigger Shariah Tier 2 screening:
  `POST /api/shariah/run-tier2-screening`
- All money values stored in LKR millions for consistency
- P/E ratio: auto-calculate as (last_price / EPS) if EPS is provided
- The page MUST work in both dark and light themes

---

## TASK 2: Mobile PWA Optimization (30 min)

### Step 1: Add PWA Manifest

Create `src/frontend/public/manifest.json`:
```json
{
  "name": "CSE AI Dashboard",
  "short_name": "CSE AI",
  "description": "Shariah-compliant AI investment intelligence for CSE",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0A0E17",
  "theme_color": "#3B82F6",
  "orientation": "portrait-primary",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Add to `src/frontend/app/layout.tsx` `<head>`:
```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#0A0E17" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
```

Generate simple icons (can be a colored square with "CSE" text for now):
```bash
# Use ImageMagick or a simple canvas script to generate icons
# Or create a simple SVG and convert
```

### Step 2: Mobile-Optimize Key Pages

Check each page for mobile usability. The main issues on mobile are typically:

**Navigation:**
- Verify the hamburger menu works on small screens
- Bottom navigation bar for key pages (Dashboard, Portfolio, Demo, Alerts)
- Add a bottom nav component if not already present

**Dashboard page:**
- Summary cards should stack vertically on mobile (1 column, not 4)
- Charts should be full-width
- Reduce font sizes slightly for mobile

**Demo Trading page:**
- Quick Trade panel: stack fields vertically on mobile
- Holdings table: make horizontally scrollable on small screens
- BUY/SELL toggle buttons: make them larger touch targets (min 44px)

**Orders page:**
- Approve/Cancel buttons: larger touch targets
- Order cards: full width on mobile

**General mobile rules:**
- All tap targets minimum 44x44px (Apple HIG standard)
- No hover-only interactions (mobile has no hover)
- Tables with many columns: add `overflow-x: auto` wrapper
- Form inputs: `font-size: 16px` minimum (prevents iOS zoom on focus)
- Test at 375px width (iPhone SE) and 390px (iPhone 14)

### Step 3: Add Touch-Friendly Interactions

```css
/* Add to globals.css */
@media (max-width: 768px) {
  /* Bottom safe area for phones with home indicator */
  .main-content { padding-bottom: env(safe-area-inset-bottom, 20px); }
  
  /* Larger touch targets */
  button, a, .clickable { min-height: 44px; min-width: 44px; }
  
  /* Stack cards */
  .summary-cards { grid-template-columns: 1fr 1fr !important; }
  
  /* Scrollable tables */
  .table-wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; }
}

@media (max-width: 480px) {
  .summary-cards { grid-template-columns: 1fr !important; }
}
```

### Step 4: Test on Mobile

```bash
# Check responsive rendering at mobile widths
echo "Manual test: Open Chrome DevTools → Toggle Device Toolbar"
echo "Test at: iPhone SE (375px), iPhone 14 (390px), iPad (768px)"
echo "Verify: navigation, demo trading, orders, portfolio, alerts"
```

---

## TASK 3: Trigger Shariah Re-screening + AEL Fix (5 min)

AEL.N0000 shows as "Pending" on the demo page instead of "Compliant" — the whitelist was added but screening hasn't re-run.

```bash
# Trigger screening
curl -s -X POST http://localhost:3001/api/shariah/run-screening | python3 -m json.tool

# Verify AEL is now COMPLIANT
curl -s http://localhost:3001/api/shariah/compliant | python3 -c "
import json,sys
data = json.load(sys.stdin)
for s in data:
    if 'AEL' in str(s.get('symbol','')):
        print('AEL status:', s.get('status'))
        break
"
```

If AEL still shows Pending, check if the demo_holdings table has its own shariah_status column that needs updating separately from the shariah_screenings table.

---

## Verification

```bash
# Backend TypeScript
cd ~/workspace/cse-ai-dashboard/src/backend && npx tsc --noEmit

# Frontend TypeScript  
cd ~/workspace/cse-ai-dashboard/src/frontend && npx tsc --noEmit

# Test new endpoints
curl -s http://localhost:3001/api/financials/status | python3 -m json.tool
curl -s -X POST http://localhost:3001/api/financials/fetch-cse | head -c 500

# Test mobile meta tags
curl -s http://localhost:3000 | grep -i "manifest\|viewport\|theme-color\|apple-mobile"

# Manual: Open on phone or Chrome DevTools mobile view
echo "Test: localhost:3000 at 375px width — all pages usable"
```

Commit: `feat: financial data admin import tool, PWA manifest, mobile optimization`
Git push.

⚠️ CRITICAL: `.env` must NEVER be touched, modified, read, or deleted under ANY circumstances. ⚠️
