## Priority 2 + 3: Global Data, News, Dividends, Alerts, Advanced Charts, Sector Analysis, Comparison, Performance Tracking

Read /docs/remaining-work-tracker.md for full context. We're pushing through Priority 2 and 3 in this session.

---

### TASK 1: Global Market Data Integration

Add external market data feeds to give macro context beyond Sri Lanka.

#### Backend: Global Data Service

Create `src/backend/src/modules/global-data/`

Fetch from free APIs (no keys needed for basic data):

```typescript
// Data sources — use these free endpoints:

// 1. Oil Price (Brent Crude) — critical for SL (100% oil importer)
// Use: https://api.frankfurter.app or similar free commodity proxy
// Fallback: store manually from daily news

// 2. Gold Price (XAU/USD) — safe haven indicator
// Free API options: metals-api.com free tier, or frankfurter.app

// 3. USD/LKR Exchange Rate
// Free: https://api.exchangerate-api.com/v4/latest/USD (no key needed)
// Extract LKR rate from response

// 4. S&P 500 / US Market
// Free: https://query1.finance.yahoo.com/v8/finance/chart/^GSPC?interval=1d&range=5d
// This Yahoo Finance endpoint works without API key

// 5. Tea Auction Prices (Sri Lanka's #1 export)
// No free API — store in macro_data manually or scrape from Colombo Tea Traders Association
// For now: placeholder with manual entry

// 6. Rubber Prices
// Similar to tea — manual entry for now
```

#### Schedule: 
- Fetch USD/LKR, oil, gold, S&P 500 once daily at 8:00 AM SLT (before market open)
- Store in macro_data table with source='GLOBAL'
- Cache in Redis for dashboard display

#### Frontend: Global Indicators Section
Add below the Sri Lanka Macro Indicators on the dashboard:

```
┌──────────────────────────────────────────────┐
│  🌍 Global Market Indicators                  │
│                                               │
│  Brent Crude    $82.45  ▲ +1.2%              │
│  Gold (XAU)     $2,145  ▼ -0.3%              │
│  USD/LKR        310.74  ▲ +0.15%             │
│  S&P 500        5,892   ▼ -0.8%              │
│  Tea (Avg)      LKR 1,250/kg                 │
│                                               │
│  Last updated: 8:00 AM SLT                    │
└──────────────────────────────────────────────┘
```

Color code: Red/green based on whether the movement is favorable for SL stocks.
- Oil UP = RED (bad for SL — import costs rise)
- Gold UP = YELLOW (neutral/mixed)
- USD/LKR UP = RED (LKR weakening — bad for importers, good for exporters)
- S&P 500 DOWN = RED (global risk-off sentiment)

---

### TASK 2: News & Announcements Enhancement

Currently we pull basic CSE announcements. Enhance this significantly.

#### Backend Improvements:

1. **Parse announcement types better:**
   - Extract company symbol from announcement content
   - Categorize: EARNINGS, DIVIDEND, AGM, BOARD_MEETING, CORPORATE_DISCLOSURE, CIRCULAR, COMPLIANCE, OTHER
   - Store the category in the announcements table (add column if needed)

2. **Announcement detail endpoint:**
   - `GET /api/announcements/:id` — full announcement content
   - `GET /api/announcements?symbol=JKH.N0000` — filter by stock
   - `GET /api/announcements?type=DIVIDEND` — filter by type
   - `GET /api/announcements?date=2026-03-09` — filter by date

3. **Portfolio/Watchlist announcement alerts:**
   - `GET /api/announcements/portfolio` — announcements for stocks in my portfolio
   - `GET /api/announcements/watchlist` — announcements for watchlist stocks
   - These should be highlighted/prioritized on the dashboard

#### Frontend: Announcements Page

Create `/announcements` page:
- Filterable table: by date range, company, type
- Searchable by company name or symbol
- Badge for announcement type (color coded)
- Click to expand full announcement content
- "My Stocks" tab showing only portfolio + watchlist stock announcements
- Add announcement count badge to nav item

Also add to dashboard:
- "Latest Announcements" section showing last 5 announcements
- If any announcement is for a portfolio/watchlist stock, highlight it with a special badge

---

### TASK 3: Dividend Tracking

#### Backend: Dividend Module

Create `src/backend/src/modules/dividends/`

Database entity: `dividends`
```typescript
{
  id: number;
  symbol: string;
  declarationDate: Date;       // When dividend was announced
  exDividendDate: Date;        // Last date to buy for dividend eligibility
  paymentDate: Date;           // When dividend is paid
  amountPerShare: number;      // LKR per share
  dividendType: string;        // 'INTERIM' | 'FINAL' | 'SPECIAL'
  fiscalYear: string;          // '2025/2026'
  source: string;              // 'CSE_ANNOUNCEMENT' | 'MANUAL'
  createdAt: Date;
}
```

#### Parse dividends from CSE announcements:
- Scan financial announcements for dividend-related keywords
- Extract: amount per share, ex-date, payment date
- Auto-create dividend records when detected

#### API Endpoints:
- `GET /api/dividends` — all dividend records
- `GET /api/dividends/:symbol` — dividends for a specific stock
- `GET /api/dividends/upcoming` — upcoming ex-dividend dates (sorted by date)
- `GET /api/dividends/portfolio` — dividend income for portfolio holdings
- `GET /api/dividends/calendar` — dividend calendar view data

#### Frontend: Dividend Calendar
Add to `/portfolio` page or create `/dividends` page:
- Calendar view showing upcoming ex-dividend dates
- List of recent dividend payments for portfolio stocks
- Total dividend income earned (tracked)
- Dividend yield per holding
- Connect to purification calculator: use actual dividend data for purification amounts

---

### TASK 4: Alert/Notification System

#### Backend: Alerts Module

Create `src/backend/src/modules/alerts/`

Database entity: `alerts`
```typescript
{
  id: number;
  type: string;           // 'PRICE_ABOVE' | 'PRICE_BELOW' | 'VOLUME_SPIKE' | 'SHARIAH_CHANGE' | 'PNL_DROP' | 'ANNOUNCEMENT'
  symbol: string;         // null for portfolio-wide alerts
  condition: string;      // e.g., 'price > 250' or 'volume > 3x_average'
  threshold: number;      // the trigger value
  isActive: boolean;      // toggle on/off
  isTriggered: boolean;   // has it fired?
  triggeredAt: Date;      // when it fired
  message: string;        // human-readable alert message
  createdAt: Date;
}
```

#### Built-in Auto-Alerts (no user setup needed):
- If any portfolio stock drops > 5% in a day → auto-alert
- If any portfolio stock has unusual volume (> 3x 5-day average) → auto-alert
- If a stock's Shariah status changes → auto-alert
- If total portfolio drops > 3% in a day → auto-alert
- If there's an announcement for a portfolio/watchlist stock → auto-alert

#### User-Created Alerts:
- `POST /api/alerts` — create an alert (type, symbol, threshold)
- `GET /api/alerts` — list all alerts
- `GET /api/alerts/triggered` — list recently triggered alerts
- `DELETE /api/alerts/:id` — remove an alert
- `PUT /api/alerts/:id` — update/toggle an alert

#### Alert Checking:
- Run alert checks in the existing data ingestion cron job (every 30-60 seconds during market hours)
- When an alert triggers, mark it as triggered and store the message
- Frontend polls for triggered alerts

#### Frontend: Alerts UI

1. **Alert Bell in Header:**
   - Bell icon in the nav header
   - Badge showing count of unread triggered alerts
   - Click to open dropdown with recent alerts
   - Each alert: icon (type-based), message, timestamp, dismiss button

2. **Alert Management Page (`/alerts`):**
   - List of all active alerts
   - Create new alert form: select stock, type, threshold
   - Toggle alerts on/off
   - Delete alerts
   - History of triggered alerts

3. **Quick-alert on Stock Detail Page:**
   - "Set Price Alert" button on each stock page
   - Quick form: alert me when price goes above/below [X]

---

### TASK 5: Advanced Charts

Upgrade the stock detail chart significantly.

#### Technical Indicators (calculate in backend or frontend):

```typescript
// Add to a new file: src/backend/src/utils/technical-indicators.ts

// 1. Simple Moving Average (SMA)
function calculateSMA(prices: number[], period: number): number[]

// 2. Relative Strength Index (RSI) — 14 period default
function calculateRSI(prices: number[], period: number): number[]

// 3. Volume Moving Average
function calculateVolumeMA(volumes: number[], period: number): number[]

// 4. Bollinger Bands (20-day SMA ± 2 standard deviations)
function calculateBollingerBands(prices: number[], period: number): { upper: number[], middle: number[], lower: number[] }

// 5. MACD (12-day EMA - 26-day EMA, signal: 9-day EMA of MACD)
function calculateMACD(prices: number[]): { macd: number[], signal: number[], histogram: number[] }
```

#### Backend Endpoint:
- `GET /api/stocks/:symbol/technicals` — returns calculated indicators based on available history

#### Frontend Chart Improvements:

On the stock detail page (`/stocks/[symbol]`):

1. **Main Price Chart (TradingView Lightweight Charts):**
   - Candlestick chart (if OHLC data available) or line chart
   - Volume bars below
   - Time period selector: 1W, 1M, 3M, 6M, 1Y (based on available data)
   - Toggle overlays: 20-day SMA, 50-day SMA, Bollinger Bands

2. **RSI Panel (below main chart):**
   - Separate small chart showing RSI line
   - Horizontal lines at 30 (oversold) and 70 (overbought)
   - Color zones: green below 30, red above 70

3. **Volume Analysis:**
   - Color volume bars: green on up-days, red on down-days
   - Volume moving average line overlay

4. **Chart Controls:**
   - Indicator toggles as checkboxes/switches
   - Clean, minimal UI that doesn't clutter the chart

---

### TASK 6: Sector Analysis Page

Create `/sectors` page with detailed sector breakdown.

#### Backend:
- `GET /api/sectors` — all sectors with performance data (already available from allSectors endpoint)
- `GET /api/sectors/:sectorSymbol/stocks` — list stocks in a sector with prices
- `GET /api/sectors/performance` — sector performance ranking with change%

#### Frontend: Sectors Page

```
Design:
1. Sector Performance Ranking:
   - Bar chart or horizontal bars showing all 20 sectors ranked by daily change%
   - Color coded (green positive, red negative)
   - Click a sector to see its stocks

2. Sector Detail View (when a sector is clicked):
   - Sector index value and change
   - List of constituent stocks with prices, changes, Shariah status
   - Sector average P/E (if financials available)
   - Best and worst performer in the sector

3. Sector Comparison:
   - Multi-line chart comparing 2-4 sectors over time
   - Checkboxes to select which sectors to compare
```

---

### TASK 7: Stock Comparison Tool

Create `/compare` page.

#### Frontend:

```
Design:
1. Stock selector:
   - "Add Stock" button with searchable dropdown
   - Add 2-4 stocks to compare
   - Remove button per stock

2. Price Performance Chart:
   - Normalized line chart (all starting at 100) showing relative performance
   - Period selector: 1M, 3M, 6M, 1Y

3. Key Metrics Comparison Table:
   | Metric        | JKH     | EXPO    | DIPD    |
   |---------------|---------|---------|---------|
   | Price         | 205.50  | 1,450   | 380     |
   | Change%       | -4.3%   | -2.1%   | -1.5%   |
   | Market Cap    | 120B    | 85B     | 45B     |
   | P/E           | 12.5    | 8.3     | 15.2    |
   | Beta          | 1.05    | 0.92    | 0.78    |
   | Shariah       | PENDING | ✅      | ✅      |

4. AI Comparison (when live):
   - "Compare these stocks with AI" button
   - AI generates a comparative analysis
```

---

### TASK 8: AI Signal Performance Tracking

Track whether the AI's signals actually make money.

#### Backend: Signal Tracking

Enhance the existing signals infrastructure:

```typescript
// Entity: signal_records
{
  id: number;
  symbol: string;
  direction: 'BUY' | 'SELL' | 'HOLD';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  priceAtSignal: number;          // price when signal was generated
  reasoning: string;
  
  // Outcomes (filled in over time by a cron job):
  priceAfter7Days: number;
  priceAfter14Days: number;
  priceAfter30Days: number;
  returnAfter7Days: number;       // percentage
  returnAfter14Days: number;
  returnAfter30Days: number;
  wasCorrect7Days: boolean;       // did it go the right direction?
  wasCorrect14Days: boolean;
  wasCorrect30Days: boolean;
  
  generatedAt: Date;
  isActive: boolean;              // still within tracking window
}
```

#### Outcome Tracking Cron Job:
- Daily at 3:00 PM (after market close): check all active signals
- For signals that are 7/14/30 days old, record the current price
- Calculate return and whether the signal was correct
- Mark signals older than 30 days as inactive

#### API Endpoints:
- `GET /api/signals/performance` — overall accuracy stats
- `GET /api/signals/history` — all past signals with outcomes

#### Frontend: Performance Dashboard

Add to `/signals` page or create `/signals/performance`:

```
AI Signal Performance:

Overall Accuracy (30-day): 62% (31 correct / 50 total)
Average Return: +2.3% per signal
Win Rate: 58%
Best Signal: JKH.N0000 BUY → +12.5%
Worst Signal: CTC.N0000 SELL → -5.2% (wrong direction)

Accuracy by Confidence:
  HIGH:   71% (15/21)
  MEDIUM: 55% (11/20)  
  LOW:    44% (4/9)

Accuracy by Direction:
  BUY:  65%
  SELL: 58%
  HOLD: 52%

Chart: Cumulative return if you followed all signals vs ASPI
```

This data is what proves whether your AI dashboard is worth using — and it becomes a key selling point for Module 1's public launch.

---

### TASK 9: Navigation and Layout Updates

Update navigation to include all new pages:

```
Nav order:
1. Dashboard (/) — home icon
2. Stocks (/stocks) — list icon
3. Sectors (/sectors) — NEW — grid icon
4. Shariah (/shariah) — shield icon
5. Portfolio (/portfolio) — briefcase icon
6. Signals (/signals) — zap icon
7. Compare (/compare) — NEW — columns icon
8. Announcements (/announcements) — NEW — bell icon
9. Strategy (/chat) — sparkles icon
10. Admin (/admin/financials) — settings icon (smaller, at end)

Mobile: use icons only (no labels) to fit in bottom nav
Desktop: sidebar or top nav with labels
```

If there are too many items for a top nav, switch to a sidebar layout.

---

### CODING STANDARDS
- All external API calls need try/catch with fallback values
- Rate limit external API calls (don't hammer free APIs)
- Loading skeletons on all new pages
- Responsive design
- Keep dark theme consistent
- Commit after each task
- Final push to GitHub when all tasks complete
