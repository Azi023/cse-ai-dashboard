# CSE AI Dashboard — Product Improvement Roadmap 2026
> Written after Weekend QA — March 27, 2026
> Goal: Make this trustworthy enough to deploy real capital

---

## Executive Summary

The platform passes 79/79 API tests and the core AI pipeline is working. The recommendation engine just generated its first output (HHL.N0000, MEDIUM confidence, WAIT). But "working" is not the same as "trustworthy". This roadmap identifies every gap between current state and a platform you'd stake real money on — organised by priority tier.

---

## TIER 1 — Trust & Reliability (Do First)

These are gaps that could cause you to make a bad financial decision based on wrong data.

### 1.1 Data Freshness Indicators on Every Screen

**Problem:** The UI shows prices and scores with no timestamp. Redis cache expires silently. You might be looking at 3-hour-old prices and not know it.

**Solution:**
- Show "Last updated: 14:32 SLT" on every data card
- If data is >1 hour old during market hours: show orange warning badge
- If data is >4 hours old: show red "STALE DATA" banner at top of page
- Backend: add `data_as_of` field to all API responses alongside the data

**Files to change:** `src/frontend/src/app/*/page.tsx`, `src/backend/src/modules/*/analysis.service.ts`

### 1.2 Sell Signal Generation

**Problem:** The system only generates BUY signals. It never tells you when to exit a position you already hold. This is a major gap for a portfolio management tool.

**Solution — Rule-based exit triggers (no AI needed):**
- Stop-loss breach: position drops >8% below cost basis → SELL signal
- Target hit: position reaches +20% above cost basis → SELL_PARTIAL signal
- RSI overbought: RSI > 70 for 3 consecutive days → REDUCE signal
- Shariah flag change: stock moves from compliant → non_compliant → SELL (mandatory)

**Implementation:** New `ExitSignalService` that runs post-close alongside the existing signals job. Persists to `signals` table with `signal_type: 'EXIT'` and creates a priority alert.

### 1.3 Portfolio Snapshot Cash Fix

**Problem:** `savePortfolioSnapshot()` in `analysis.service.ts` saves only stock value (LKR 13,600), not total wealth (LKR 19,544). The journey chart will drift from reality as snapshots accumulate.

**Solution:** Apply same estimated cash logic that `journey.service.ts` now uses — read `atrad:last_sync`, fallback to `totalDeposited - totalCostBasis`.

**File:** `src/backend/src/modules/analysis/analysis.service.ts` → `savePortfolioSnapshot()`

### 1.4 Error Monitoring & Alerting

**Problem:** Cron jobs fail silently. Backend errors go to PM2 logs that nobody watches. If the ATrad sync breaks at 2:38 PM and the portfolio snapshot at 2:40 PM uses stale data, you'll never know.

**Solution:**
- Add a `system_health` Redis key updated by every cron job with timestamp + status
- New endpoint `GET /api/health/cron` returns status of all scheduled jobs
- Frontend: health indicator in the header (green dot = all systems nominal, red = degraded)
- If any critical cron fails: create an `alert` record so the notification bell fires

### 1.5 ATrad Sync Reliability Fix

**Problem:** ATrad sync returns `configured: false` when credentials aren't loading or the session expires. The entire portfolio P&L calculation degrades gracefully (falls back to estimated cash) but the sync banner just shows a warning.

**Root cause options:**
1. `ATRAD_URL`, `ATRAD_USERNAME`, `ATRAD_PASSWORD` env vars not loading
2. ATrad session expired — Playwright needs to re-login

**Solution:**
- Add explicit env var validation at startup with clear error message
- Add retry logic in `AtradBrowserService.syncHoldings()`: 3 attempts with 30s delay
- If all 3 fail: create a high-priority alert "ATrad sync failed — verify credentials"
- Log the exact failure step (login, navigation, data extraction)

---

## TIER 2 — Investment Intelligence (Do Second)

These make the AI's advice materially better and safer.

### 2.1 Zakat Calculator

**For Shariah-compliant investors, Zakat calculation on stocks is mandatory.**

Formula (per AAOIFI standard):
- Zakatable amount per share = (current assets - current liabilities) / shares outstanding
- Zakat due = zakatable amount × quantity × 2.5%

**Implementation:**
- New page `/zakat` under the Journey section
- Inputs: stock symbol, quantity, Nisab threshold (in LKR — auto-fetch gold price)
- Show per-holding Zakat amount + total portfolio Zakat liability
- Data source: quarterly financial data from `company_financials` table

### 2.2 Dividend Tracker with Reinvestment Projections

**Problem:** Dividend received field exists in the portfolio table but the UI just shows a total. No growth projection.

**Solution:**
- Show historical dividend payments per holding (from CSE announcements table)
- Project dividend income: `annual_dividend × shares × (1 + growth_rate)^years`
- Show dividend yield on cost vs current yield
- "Dividend reinvestment simulator": what if I reinvest dividends into same stock?

### 2.3 Rupee Cost Averaging Optimizer

The system knows you invest LKR 10,000/month. It should tell you where to deploy it.

**Current state:** User decides manually. AI gives a weekly recommendation but doesn't factor in current holdings' weight vs ideal allocation.

**Enhancement:**
- Calculate current allocation vs Shariah-screened target weights
- Recommend how to split the LKR 10,000 across underweighted positions
- Flag if adding to a position would push it above 15% of portfolio (concentration risk)
- Show "months to target" for each position

### 2.4 Macro Overlay on Stock Scores

**Problem:** Stock scores ignore macro conditions. In a high-interest-rate environment, high-debt companies are riskier. When CBSL cuts rates, banks rally.

**Solution:**
- Add `macro_context_score` field to scoring engine
- Inputs: OPR (from `macro_data` table), USD/LKR rate, latest GDP growth
- Modifier rules:
  - OPR ≥ 8%: penalise high-debt companies (reduces debt_health_score by 10%)
  - Rupee depreciation >5% YTD: boost export companies (Tea, Rubber, IT)
  - ASPI YTD return < -10%: enter "defensive mode", boost dividend yield weight to 40%

### 2.5 Historical Recommendation Accuracy Dashboard

**Problem:** The AI has been generating recommendations since Week 1 but we have no way to see if it was right.

**Solution (already partly built — `recommendation_outcomes` table exists):**
- For each past recommendation: show entry signal date, recommended price, current price, % return
- Compare vs ASPI return over same period (alpha generated)
- Show: win rate, average return, average hold time
- This feedback loop is critical — it closes the loop on whether the AI is actually useful

---

## TIER 3 — Multi-Market Expansion

### 3A — NYSE / US Markets

**Approach:** Add US Shariah-compliant stocks as a parallel watchlist, not a trading account (you can't trade NYSE from Sri Lanka easily without an international broker).

**Data source options:**
1. **Alpha Vantage** — free tier: 25 API calls/day (enough for watchlist monitoring of 10-15 stocks)
2. **Yahoo Finance (unofficial)** — free, no auth, higher rate limit but unstable
3. **Polygon.io** — paid, reliable ($29/month basic), 5-year history

**Shariah screening for US:**
- **DJIMI (Dow Jones Islamic Market Index)** — screened list available publicly
- **Zoya app API** — mobile-first Shariah screener, has an API
- **Manual import** — AAOIFI-compliant screeners publish quarterly lists

**What to build:**
- New `us_stocks` table (symbol, name, sector, shariah_status, djimi_listed)
- `UsMartketModule` — polls Alpha Vantage for daily close prices
- Watchlist page `/us-stocks` showing DJIMI-filtered S&P 500 picks
- Currency overlay: show USD price + LKR equivalent (via CBSL daily FX)
- No position tracking yet (no international broker account)

**Implementation order:**
1. Seed 50 DJIMI stocks into DB (Apple, Microsoft, etc. — already screened)
2. Daily price fetch via Alpha Vantage (5 PM EST = 2:30 AM SLT next day)
3. Apply same scoring model (momentum/dividend/PE) but with USD data
4. Show as "US Watchlist" tab on Stocks page

### 3B — Cryptocurrency (Shariah Angle)

**This is the more complex one. The Shariah position on crypto:**

- **BTC/ETH**: Generally **haram** per majority of AAOIFI scholars (excessive speculation, no underlying asset, used for haram transactions)
- **XAUT (Tether Gold)**: **Halal** — backed 1:1 by physical gold, stored in vaults. AAOIFI-compliant gold ownership
- **PMGT (Perth Mint Gold Token)**: **Halal** — government-backed gold token
- **OneGram (OGC)**: **Halal** — Shariah-certified, each token = 1g gold minimum
- **Conventional gold ETF** equivalent: **Halal** if structured correctly

**The safe approach: Gold-backed tokens as inflation hedge**

Gold is a classic Islamic store of value (actual mahr in marriage contracts). Tracking XAUT/gold gives you:
- Inflation protection (LKR inflation ~10% in 2025)
- Currency devaluation hedge
- Shariah-compliant alternative asset class

**Data source:** CoinGecko free API (no auth, 50 calls/minute)
- `GET https://api.coingecko.com/api/v3/simple/price?ids=tether-gold&vs_currencies=usd,lkr`

**What to build:**
- Gold tracker widget on dashboard (XAU/USD + XAU/LKR)
- XAUT token price alongside physical gold price (should track very closely)
- "Safe Haven Signal": when ASPI drops >3%, show gold as alternative
- Portfolio allocation simulator: "what % in gold vs CSE stocks?"

**NOT to build (yet):**
- Any actual crypto trading
- BTC/ETH price tracking (non-compliant)
- Exchange integrations

---

## TIER 4 — UX & Accessibility Improvements

### 4.1 Mobile PWA

The Bloomberg Terminal dark theme looks great on desktop but the Journey and Portfolio pages are not mobile-optimised. Most retail Sri Lankan investors check portfolios on mobile.

**Changes:**
- `src/frontend/src/app/layout.tsx`: Add PWA manifest + service worker
- Portfolio and Journey pages: responsive grid (currently fixed 3-col)
- Touch-friendly: increase button hit targets to 44px minimum
- Offline mode: show cached portfolio data when no connectivity

### 4.2 Simple Mode Improvements

Simple Mode redirects to Journey, hides Signals. But the Journey page itself is still technical-heavy.

**Beginner-friendly additions:**
- "What does this mean?" tooltips on every KPI
- Replace "Sharpe Ratio" with "Risk-adjusted return — how much return per unit of risk"
- Replace % numbers with plain English: "Your portfolio is 2.3% below your deposits"
- Traffic light system: green/amber/red for each metric
- "Next action" card: single clear action (e.g., "Wait for next DCA — next in 4 days")

### 4.3 Weekly Email/Push Notification

Instead of just alerts in the bell, send a weekly email digest on Friday.

**Stack:** `nodemailer` + Gmail SMTP (free for personal use)
- Subject: "Your CSE Portfolio Week of March 27: -2.3% (Beating ASPI)"
- Body: weekly brief + recommendation + KPIs
- Configurable: opt-in, frequency, what to include

---

## TIER 5 — Technical Debt & Infrastructure

### 5.1 Database Query Optimisation

Multiple `N+1` query patterns exist in `portfolio.service.ts` and `analysis.service.ts`:
- `getAllHoldings()` does one DB call per holding for the stock record
- `getSummary()` does one `stockRepository.findOne()` per holding in a loop

**Fix:** Use TypeORM relations and `IN` queries:
```typescript
// Instead of N queries:
for (const h of holdings) {
  const stock = await this.stockRepository.findOne({ where: { symbol: h.symbol } });
}

// One query:
const symbols = holdings.map(h => h.symbol);
const stocks = await this.stockRepository.find({ where: { symbol: In(symbols) } });
const stockMap = new Map(stocks.map(s => [s.symbol, s]));
```

**Impact:** Portfolio page load time: ~500ms → ~50ms (10x faster)

### 5.2 TypeORM Decimal Field Type Safety

**Problem (found this weekend):** TypeORM stores `decimal` columns as strings in JavaScript. Any `.toFixed()` call on a raw entity field throws at runtime.

**Fix:** Create a `toNum(v: unknown): number` utility and use it everywhere numeric formatting occurs:
```typescript
// src/backend/src/utils/num.ts
export const toNum = (v: unknown): number => Number(v ?? 0);
```

Apply to all `entity.toFixed()` callsites.

### 5.3 Structured Logging with Log Levels

Currently everything logs at the same level. On a busy market day the PM2 log is 50,000 lines.

**Fix:** Use NestJS `LogLevel` properly:
- `DEBUG`: individual CSE API calls (keep in dev, disable in prod)
- `LOG`: cron job start/completion, data persistence confirmations
- `WARN`: Redis cache miss, fallback data used, stale data carried forward
- `ERROR`: API failures, DB connection issues, AI generation failures

### 5.4 Health Check Endpoint

`GET /api/health` currently returns 404. Add a proper health check:
```json
{
  "status": "ok",
  "database": "connected",
  "redis": "connected",
  "lastMarketDataFetch": "2026-03-27T09:05:00Z",
  "lastAtradSync": "2026-03-27T09:38:00Z",
  "lastSharpeCalc": "2026-03-27T09:42:00Z"
}
```

---

## Implementation Priority Order

| Week | Focus | Deliverable |
|------|-------|-------------|
| Week 1 (now) | Trust | Data freshness indicators, sell signals, portfolio snapshot cash fix |
| Week 2 | Trust | ATrad sync retry logic, health check endpoint, N+1 query fixes |
| Week 3 | Intelligence | Zakat calculator, dividend tracker, recommendation accuracy dashboard |
| Week 4 | Intelligence | RCA optimizer, macro overlay on scoring |
| Week 5-6 | Multi-market | US Shariah watchlist (Alpha Vantage + DJIMI) |
| Week 7 | Multi-market | Gold/XAUT tracker + safe-haven widget |
| Week 8 | UX | Mobile PWA, Simple Mode improvements |
| Ongoing | Tech debt | TypeScript strictness, query optimisation |

---

## Trust Checklist — Before Increasing Capital Allocation

Before deploying more than LKR 20,000:
- [ ] Sell signal system built and tested
- [ ] Data freshness indicators on all screens
- [ ] Portfolio snapshot includes cash correctly (verified over 5 trading days)
- [ ] Recommendation accuracy dashboard shows at least 4 weeks of history
- [ ] ATrad sync reliable (consecutive 5-day streak without manual intervention)
- [ ] Health check endpoint passes
- [ ] Simple Mode complete (can show to family members for second opinion)

---

## Notes on Multi-Market Shariah

**US stocks via DJIMI:** The Dow Jones Islamic Market Index screens ~3,000 US companies quarterly using:
- Business activity screen (no alcohol, weapons, pork, entertainment, conventional finance)
- Financial ratio screen (debt <33% market cap, interest income <5% revenue, receivables <49% total assets)

This is AAOIFI-aligned and is the most reputable US Shariah screener. The index list is published publicly and can be used as a seed list for the US watchlist.

**Crypto:** AAOIFI's position (published 2021) is that cryptocurrencies are not inherently haram but their use for speculation and gambling makes most implementations non-compliant. Gold-backed tokens (XAUT, PAXG) are explicitly structured to be Shariah-compliant because they represent a claim on physical gold — a recognised Islamic store of value.

The recommendation: add gold tracking (physical gold price + XAUT) as the "crypto equivalent" for our use case. It provides the portfolio diversification and inflation-hedge benefits that some investors seek from crypto, without the Shariah compliance risk.
