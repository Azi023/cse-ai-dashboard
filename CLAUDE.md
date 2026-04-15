# CSE AI Investment Intelligence Dashboard — CLAUDE.md

> This file is the single source of truth for Claude Code working on this project.
> Read it fully before writing any code. Re-read it at the start of every session.

---

## 🔴 ABSOLUTE RULES (Non-Negotiable)

1. **The `.env` file must NEVER be touched, modified, read, cat'd, echo'd, or deleted under ANY circumstances.** Use `process.env.*` to access values the app already loads. This rule overrides ALL other instructions.
2. **Never place orders, click buy/sell buttons, or modify account data on ATrad.** All ATrad automation is READ-ONLY (scrape holdings, balances, account data).
3. **Never run destructive database operations** (DROP, TRUNCATE, DELETE without WHERE) without explicit user approval.
4. **Never install npm packages without stating which ones and why first.**
5. **Never commit `.env`, `node_modules`, or personal financial data to git.**

---

## Project Overview

**What:** A personal AI-powered Shariah-compliant investment intelligence platform for the Colombo Stock Exchange (CSE).

**Why:** Increase Sri Lankan household stock market participation through accessible, AI-driven, Shariah-filtered analysis. Currently a personal tool — future public platform.

**Who:** Single user (Atheeque), conservative risk profile, LKR 10,000/month Rupee Cost Averaging strategy, Shariah-compliant only.

**Where:** Runs locally on WSL2 Ubuntu. Managed via PM2 for persistence. No cloud deployment yet.

---

## Tech Stack

| Layer | Technology | Port/Path |
|-------|-----------|-----------|
| Frontend | Next.js 14 + TypeScript + Tailwind + shadcn/ui | localhost:3000 |
| Backend | NestJS + TypeScript | localhost:3001 |
| Database | PostgreSQL 16 | localhost:5433 |
| Cache | Redis 7 | localhost:6379 |
| Browser Automation | Playwright (Chromium) | Headless |
| AI | Claude API (Haiku for digests, Sonnet for analysis) | api.anthropic.com |
| Charts | TradingView Lightweight Charts + Recharts | — |
| Process Manager | PM2 | — |

**Repo:** `~/workspace/cse-ai-dashboard/`
**GitHub:** `https://github.com/Azi023/cse-ai-dashboard.git`

---

## Architecture

```
src/
├── backend/          # NestJS API server
│   └── src/
│       └── modules/
│           ├── cse-data/        # CSE API polling, stock sync, market data
│           ├── ai-engine/       # Claude API integration, briefs, signals, chat
│           ├── portfolio/       # Holdings, P&L, manual add
│           ├── shariah/         # Shariah screening (Almas whitelist)
│           ├── notifications/   # Daily digest, weekly brief, alerts
│           ├── analysis/        # [TO BUILD] Scoring engine, recommendations
│           ├── atrad-sync/      # ATrad Playwright browser automation
│           ├── news/            # RSS feed aggregation
│           ├── journey/         # Investment journey tracking, KPIs
│           ├── dividends/       # Dividend tracking, purification
│           ├── alerts/          # Price alerts, notifications bell
│           ├── signals/         # AI-generated trading signals
│           └── macro/           # CBSL macro data
├── frontend/         # Next.js dashboard UI
│   └── src/app/
│       ├── dashboard/    # Market overview, AI brief
│       ├── stocks/       # Stock browser, detail pages
│       ├── portfolio/    # Holdings, P&L, ATrad sync
│       ├── journey/      # Investment journey, KPIs, goals
│       ├── signals/      # AI signals display
│       ├── alerts/       # Notifications
│       ├── chat/         # AI Strategy Chat
│       └── news/         # News intelligence
├── scripts/          # Standalone scripts (ATrad recon, data tools)
└── data/             # Generated data, AI outputs, ATrad sync dumps
    ├── ai-generated/
    ├── atrad-sync/
    └── tracking/     # KPI tracker (gitignored)
```

---

## Data Sources

| Source | Method | Frequency | Notes |
|--------|--------|-----------|-------|
| CSE Market Data | POST to cse.lk/api/* (22 endpoints) | 5 min during market hours | Reverse-engineered, no auth needed |
| ATrad (HNB Stockbrokers) | Playwright browser automation | On-demand via Sync button | READ-ONLY. Login → scrape holdings + balance |
| Almas Equities Whitelist | Manual / twice-weekly screening | Mon & Thu 9:00 AM | Shariah compliance source of truth |
| RSS News | Economy Next, Daily FT, Google News CSE | Every 30 min (8AM-8PM weekdays) | daily_ft feed frequently fails to parse |
| CBSL Macro | Manual Excel import | As released | OPR, inflation, FX reserves |
| Claude AI | API calls for briefs, signals, digests | Cached with TTLs | Haiku for digests, Sonnet for analysis |

---

## Cron Schedule (All times Sri Lanka Time, UTC+5:30)

**CRITICAL: VPS timezone is Asia/Colombo (SLT). All @Cron expressions use SLT directly — do NOT use UTC offsets.**

| Time | Job | Days | What It Does |
|------|-----|------|-------------|
| 9:00 AM | shariahScreening | Mon, Thu | Twice-weekly Shariah compliance check |
| 9:15 AM | updateOutcomes | Mon | Weekly recommendation outcome tracking |
| 9:25 AM | preMarketWarmup | Mon-Fri | Fetch initial market data before open |
| 9:30-14:30 | pollMarketData | Mon-Fri | Every 5 min: 7 CSE endpoints + trade summary |
| 9:30-14:30 | pollAnnouncements | Mon-Fri | Every 15 min: financial + approved announcements |
| 9:00-15:00 | monitorStopLosses | Mon-Fri | Every 5 min: real-time stop-loss proximity check |
| 9:00-15:00 | checkAlerts | Mon-Fri | Every 1 min: price alert monitoring |
| 8:00-20:00 | fetchNews | Mon-Fri | Every 30 min: RSS feeds |
| 12:00 PM | saveMidDayPrices | Mon-Fri | Intraday price snapshot to daily_prices |
| 2:35 PM | postCloseSnapshot | Mon-Fri | Final market data + trade summary after close |
| 2:36 PM | captureEODSnapshot | Mon-Fri | Demo account EOD snapshots |
| 2:37 PM | updateBenchmarks | Mon-Fri | Demo account benchmark update |
| 2:39 PM | runTechnicalAnalysis | Mon-Fri | SMA, RSI, MACD, ATR for all compliant stocks |
| 2:40 PM | saveDailySnapshots | Mon-Fri | Market + portfolio snapshots |
| 2:41 PM | detectMarketRegime | Mon-Fri | ASPI regime classification |
| 2:42 PM | runStockScoring | Mon-Fri | 12-factor composite stock scores |
| 2:43 PM | generateSignals | Mon-Fri | Strategy engine buy/sell signals |
| 2:44 PM | runRiskAnalysis | Mon-Fri | Position risk recalculation |
| 2:45 PM | generateDailyDigest | Mon-Fri | Haiku: market summary + portfolio P&L |
| 2:46 PM | checkExitSignals | Mon-Fri | Stop-loss/target/overbought exit checks |
| 2:47 PM | autoSuggestTpSl | Mon-Fri | Auto-suggest take-profit/stop-loss orders |
| 2:48 PM | queueBuySignals | Mon-Fri | Queue high-confidence buy signals |
| 2:50 PM | weeklyMetrics | Fri | Weekly performance metrics |
| 2:55 PM | generateAIRecommendation | Fri | Sonnet: weekly stock pick |
| 3:00 PM | saveDailyMarketSummary | Mon-Fri | Final daily_prices write + market summary |
| 3:00 PM | generateWeeklyBrief | Fri | Sonnet: week review + forward outlook |
| 3:30 PM | checkSignalOutcomes | Mon-Fri | Track 7/14/30-day signal performance |
| 6:00 PM | afterHoursAnnouncements | Mon-Fri | Single check for late filings |
| 8:00 AM & 6:00 PM | fetchGlobalData | Mon-Fri | Global market indices, FX rates |
| 2:00 AM Sun | syncCompanyProfiles | Sun | PE, PB, dividend yield, 52-week high/low |
| 3:30 AM Sat | scheduledWeeklyScrape | Sat | CSE fundamentals scraper |

**Off-hours (nights, weekends): ZERO external API calls (except scheduled weekend maintenance jobs).**

---

## INCIDENT: Data Integrity Failure (Discovered April 8, 2026)

**Severity:** CRITICAL — ALL downstream systems were operating on wrong data since VPS deployment.

### Root Causes
1. **Cron Timezone Mismatch:** VPS runs Asia/Colombo (SLT, UTC+5:30) but all 30 @Cron expressions were written assuming UTC. The entire afternoon pipeline (post-close, technicals, scoring, signals, risk, digest) fired at **9:00-9:30 AM** instead of **2:35-3:00 PM**. Every run used yesterday's stale data.
2. **Technical Analysis Query Bug:** `ORDER BY trade_date ASC TAKE 60` in `technical.service.ts` returned the **60 oldest rows** (March-June 2025) instead of the most recent. ALL SMA/RSI/MACD/ATR indicators were computed from year-old prices. AEL showed LKR 42.40 (its 2025 price) instead of LKR 73.90.

### Impact
- 113/292 stocks had >5% price discrepancy vs CSE live data (20 severe >10%, 1 critical >30%)
- 520 corrupted technical_signals purged (April 7-8)
- 520 corrupted stock_scores purged (April 7-8)
- 290 weekend duplicate daily_prices deleted
- Position risk showed cost basis (70.28) as current price instead of market (73.90)
- All strategy signals, AI recommendations, and daily digests were based on wrong data

### Fixes Applied (April 8, 2026)
- 30 cron expressions corrected across 15 service files (UTC offsets → SLT direct)
- Technical analysis query fixed: `ASC TAKE 60` → `DESC TAKE 60` + `reverse()`
- Backend restarted, daily_prices refreshed from CSE API (292 stocks, 0 discrepancies)
- First correct pipeline run: **April 9, 2026 at 2:35 PM SLT**

### Lessons
- **ALWAYS verify VPS timezone** before writing cron expressions. Use `timedatectl` on deploy.
- **ALWAYS use `ORDER BY DESC` + `TAKE` + `reverse()`** when you need the N most recent rows in chronological order. `ASC + TAKE` returns the oldest N.
- **Test cron fire times** by checking PM2 logs after deployment — log messages said "2:35 PM SLT" but actually fired at 9:05 AM.
- **Never trust indicators blindly** — if a price looks implausible (42 vs 74), investigate the data pipeline, don't assume corporate action.

### System Gaps Remaining (TO BUILD)
- **Daily integrity check cron** — compare DB vs CSE API prices, alert on >5% discrepancy
- **Weekend/holiday guard** — prevent `saveDailyPrices()` from creating records on non-trading days
- **Corporate action detection** — detect >20% overnight price changes, flag for indicator recalculation
- **ATrad sync failure alerting** — notify when sync hasn't succeeded in >24 hours

---

## Current State (as of April 8, 2026)

### What's Working ✅
- Market data polling with optimized cron (5-min market hours, zero off-hours)
- **Cron schedule corrected** — all 30 expressions verified for SLT timezone (fixed April 8)
- **Daily prices verified** — 292 stocks match CSE API with 0 discrepancies >5%
- AI Market Brief (Sonnet, cached 4h)
- AI Signals (5 signals from cache, JSON parsing fixed)
- AI Strategy Chat (live Claude API with market context)
- News Intelligence (RSS from EconomyNext, Google News CSE)
- Announcements (financial + approved, from CSE API)
- Daily Digest notifications (Haiku, 2:45 PM)
- Weekly Brief (Sonnet, Friday 3:00 PM) — includes AI recommendation + top 5 scores
- Token budget guard (500K/month, auto-downgrades Sonnet → Haiku)
- Shariah screening (twice-weekly, skips if recent)
- Premium UI redesign (Bloomberg Terminal dark theme, Inter + JetBrains Mono fonts)
- AEL.N0000 holding: 200 shares @ LKR 69.50, cost basis LKR 70.28/share
- Phase 2 AI Analysis Pipeline: snapshots, scoring, signals, risk, regime detection all built
- PM2 process management on Hetzner VPS (backend port 4101, frontend port 4100)
- **Technical analysis query fixed** — now reads newest 60 rows (fixed April 8)
- **Weekend duplicate data purged** — 290 phantom records removed

### What's Pending / Broken ⚠️
- **Technical signals, scores, risk for April 8** — purged due to data corruption, will be recomputed correctly on April 9 at 2:35 PM SLT
- **ATrad sync disabled on VPS** — Hetzner IPs blocked (403). Sync only works from local WSL2 via `POST /api/atrad/sync-push`
- **AEL pending orders need review** — stop-loss @ 63.18 and take-profit @ 84.48 were set March 20 from stale data. Current price is 73.90.
- **Shariah Tier 2 screening** — requires quarterly financial ratio data import
- **Backtester `/api/backtester/symbols`** — returns 404 (low priority)

### What Needs Building 🔨
- **Daily integrity check cron** — compare DB vs CSE API, alert via notification bell on >5% discrepancy
- **Weekend/holiday guard** — prevent saveDailyPrices() from creating non-trading-day records
- **Corporate action detection service** — detect splits/bonus issues via >20% overnight anomaly
- **ATrad sync failure alerting** — alert when no successful sync in >24 hours
- **Shariah Tier 2 financial data** — import quarterly reports to enable ratio screening
- **Historical accuracy tracking** — did past AI recommendations perform?

---

## User's Investment Profile

- **Capital:** LKR 20,000 initial deposit + LKR 10,000/month RCA
- **Current Holdings:** 200 shares AEL.N0000 @ LKR 69.50 (bought March 16, 2026)
- **Total Cost:** LKR 14,055.69 (incl. fees). Cost basis: LKR 70.28/share
- **Remaining Cash:** LKR 5,944.32
- **Broker:** HNB Stockbrokers, ATrad platform, CDS account active
- **Strategy:** Shariah-compliant Rupee Cost Averaging, conservative risk
- **Screening:** AAOIFI / Meezan / Dow Jones via Almas Equities Whitelist
- **Next Trade:** TJL.N0000 after CBSL rate decision March 25

---

## Hybrid Execution Architecture (April 2026)

### Overview
- **VPS (Hetzner Germany)** = Brain — signals, strategy, AI, data, crons, frontend
- **WSL2 (laptop, Sri Lankan IP)** = Hands — ATrad Playwright, portfolio sync
- Communication: HTTPS REST API with shared secret (`X-Agent-Key` header)

### Why Hybrid?
- ATrad blocks non-Sri Lankan IPs (confirmed 403 from Hetzner)
- Singapore/other Asian VPS IPs also blocked — only residential SL IP works
- VPS handles everything except ATrad interaction
- If agent is offline, VPS continues with CSE API data (degraded but functional)

### Agent API Endpoints
- `GET  /api/internal/agent/heartbeat` — connectivity check
- `GET  /api/internal/agent/pending-trades` — approved trades to execute
- `POST /api/internal/agent/report-execution` — execution results
- `POST /api/internal/agent/sync-portfolio` — ATrad portfolio data
- `GET  /api/internal/agent/sync-trigger` — check if sync requested

### Security
- All agent endpoints require `X-Agent-Key` header matching `AGENT_SECRET` env var
- Endpoints bypass JWT auth (`@Public`) — agent has its own auth mechanism
- Rate limiting skipped for agent (trusted, frequent polling)
- All requests logged with timestamp and IP

### Daily Flow
1. **9:25 AM:** VPS warms up CSE data
2. **9:30 AM:** Agent starts polling (heartbeat + pending trades)
3. **9:30-14:30:** Agent polls every 30s, executes approved trades
4. **2:35 PM:** VPS post-close snapshot
5. **2:38 PM:** VPS sets sync flag → Agent syncs ATrad portfolio → pushes to VPS
6. **2:39 PM:** VPS runs technical analysis with fresh data
7. **2:40-2:48:** Rest of afternoon pipeline runs on correct data
8. **3:08 PM:** If agent hasn't synced, VPS logs warning + creates alert

### Failure Modes
- **Agent offline:** VPS continues, portfolio data stale, alert at 3:08 PM
- **VPS offline:** Agent can't poll, no trades execute, ATrad unaffected
- **ATrad down:** Agent logs error, retries next cycle, VPS unaffected

### ATrad Recon Results (April 8, 2026)
- Login page: HTTP 200 from WSL2 (Sri Lankan IP)
- All login selectors confirmed: `#txtUserName`, `#txtPassword`, `#btnSubmit`
- Account summary selectors confirmed: `#txtAccSumaryCashBalance`, `#txtAccSumaryBuyingPowr`, `#txtAccSumaryTMvaluePortfolio`
- Holdings grid: `#stockHoldingGridId` with columns: Account No, Client Name, Quantity, Cleared Balance, Available Balance, Holding %, Avg Price, B.E.S Price, Total Cost, Traded Price
- Order entry form: selectors NOT yet mapped (stub implementation)
- Menu bar: Watch(0), Market(1), Orders(2), Order Management(3), Client(4), Chart(5), Analysis(6), Report(7), Announcements(8)

### File Structure
```
src/agent/                     # WSL2 standalone agent (NOT part of NestJS)
├── package.json
├── ecosystem.config.js        # PM2 config
├── scripts/recon.ts           # ATrad recon script
├── src/
│   ├── index.ts               # Entry point, polling loop
│   ├── config.ts              # Environment loading
│   ├── vps-client.ts          # HTTP client for VPS agent API
│   ├── atrad/
│   │   ├── browser.ts         # Playwright browser management
│   │   ├── login.ts           # ATrad login flow
│   │   ├── portfolio-sync.ts  # Read cash + holdings
│   │   ├── order-entry.ts     # Place orders (STUB)
│   │   └── selectors.ts       # All ATrad DOM selectors
│   └── utils/
│       ├── logger.ts          # File + console logging
│       └── screenshot.ts      # Save screenshots with timestamps
└── screenshots/               # Captured during operations

src/backend/src/modules/agent/ # VPS-side agent API
├── agent.module.ts
├── agent.service.ts           # Business logic + 2:38 PM sync cron
└── agent.controller.ts        # 5 REST endpoints
```

---

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- Write plan to `tasks/todo.md` with checkable items before coding
- If something goes sideways, STOP and re-plan immediately
- Write detailed specs upfront to reduce ambiguity

### 2. Verification Before Done
- Never mark a task complete without proving it works
- Run `npx tsc --noEmit` after every TypeScript change
- Test endpoints with `curl` after API changes
- Check browser UI after frontend changes
- Ask: "Would a staff engineer approve this?"

### 3. Self-Improvement Loop
- After ANY correction from the user, update `tasks/lessons.md` with the pattern
- Write rules that prevent the same mistake
- Review lessons at session start

### 4. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 5. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user

---

## Task Management

1. **Plan First:** Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan:** Check in before starting implementation
3. **Track Progress:** Mark items complete as you go
4. **Explain Changes:** High-level summary at each step
5. **Document Results:** Add review section to `tasks/todo.md`
6. **Capture Lessons:** Update `tasks/lessons.md` after corrections

---

## Core Principles

- **Simplicity First:** Make every change as simple as possible. Minimal code impact.
- **No Laziness:** Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact:** Only touch what's necessary. No side effects with new bugs.
- **Cost Awareness:** Every Claude API call costs money. Cache aggressively. Use Haiku for summaries, Sonnet only for analysis that needs reasoning.
- **Data Integrity:** Financial data must be accurate. Never show mock data as real. Never display misleading P&L figures.

---

## Tasks: Phase 1 — PM2 Setup + Stability

### Task 1.1: PM2 Process Management
```bash
npm install -g pm2
cd ~/workspace/cse-ai-dashboard/src/backend
pm2 start "npm run start:dev" --name cse-backend --watch false
cd ~/workspace/cse-ai-dashboard/src/frontend  
pm2 start "npm run dev" --name cse-frontend --watch false
pm2 save
pm2 startup
```
Create `ecosystem.config.js` in project root for PM2 configuration.

### Task 1.2: ATrad Holdings Verification (Post-Settlement)
- Run the recon script: `cd src/backend && npx tsx ../../scripts/atrad-recon.ts`
- Confirm 200 AEL.N0000 shares appear in `portfolios` array
- If they do, wire the recon logic into `atrad-browser.ts` production sync
- Fix the Account Value selector to avoid reading account number as value

### Task 1.3: Verify All Cron Jobs Fire Correctly
- Start backend, observe logs for one full market day
- Confirm: preMarketWarmup (9:25), market polling (every 5 min 9:30-14:30), postCloseSnapshot (14:35), dailyDigest (14:45)
- Confirm: ZERO polling after 14:35 except news (until 20:00) and announcements (18:00)

---

## Tasks: Phase 2 — AI Analysis Pipeline

### Task 2.1: Data Accumulation Service
Create `src/backend/src/modules/analysis/analysis.service.ts`

**Daily at 2:40 PM SLT:**
- Save market snapshot to `market_snapshots` table:
  - date (unique), aspi_close, aspi_change_pct, sp20_close, volume, turnover, trades
  - top_gainers (jsonb), top_losers (jsonb), sector_performance (jsonb)
- Save portfolio snapshot to `portfolio_snapshots` table:
  - date (unique), total_value, total_invested, unrealized_pl, holdings (jsonb)

**Weekly on Friday at 2:50 PM:**
- Calculate weekly metrics → `weekly_metrics` table:
  - week_start (unique), week_end, aspi_return, portfolio_return, best_holding, worst_holding

### Task 2.2: Stock Scoring Engine
Create deterministic scoring (NO AI needed):

For each Shariah-compliant stock, calculate composite score:
- Dividend yield: 30% weight
- Price momentum (current vs 20-day avg): 20% weight
- Volume trend (today vs 20-day avg): 10% weight
- Volatility (std dev of daily returns): 15% weight
- Sector strength (weekly performance): 15% weight
- Liquidity (avg daily turnover LKR): 10% weight

Store in `stock_scores` table (date, symbol, composite_score, components jsonb).
Run daily at 2:42 PM after market snapshot is saved.
Needs 20+ days of accumulated data to be meaningful — output placeholder scores until then.

### Task 2.3: AI Investment Recommendation (Weekly)
**Friday at 2:55 PM** (after scoring runs):
- Call Claude Sonnet with structured data:
  - This week's market snapshots
  - Current portfolio + cost basis
  - Top 10 compliant stocks by composite score
  - Known upcoming events (CBSL meetings, earnings — from config JSON)
- Request JSON output with: recommended_stock, confidence, reasoning, 3m_outlook, risk_flags
- Save to `ai_recommendations` table
- Create alert notification for the bell

### Task 2.4: Dashboard Integration
- New "AI Advisor" section on Journey page OR dedicated page
- Show: latest recommendation + confidence badge
- Show: stock scoring leaderboard (top 10 compliant)
- Show: data accumulation status ("X days of data collected, need 20 for scoring")
- Show: historical accuracy (did past recommendations perform?)

### Task 2.5: Enhanced Notifications
**Daily digest improvements:**
- Include portfolio P&L when holdings exist
- Include each holding's daily price change
- Flag any stock dropping > 5%
- Flag ASPI dropping > 3% (Crash Protocol reminder)

**Weekly brief improvements:**
- Include AI recommendation from Task 2.3
- Include top 5 stock scores
- Include week-over-week portfolio comparison
- Include next month's suggested action

---

## Known Patterns & Lessons

### ATrad Dojo UI
- Login: `#txtUserName`, `#txtPassword`, `#btnSubmit`
- Client menu: `#dijit_PopupMenuBarItem_4` → dropdown → `#dijit_MenuItem_40` (Stock Holding), `#dijit_MenuItem_41` (Account Summary)
- Account balance: `txtAccSumaryCashBalance`, `txtAccSumaryBuyingPowr`
- Holdings API: POST `/atsweb/client` with `action=getStockHolding&exchange=CSE&broker=FWS&stockHoldingClientAccount=128229LI0&format=json`
- **Single-quote JSON normalization required** before `JSON.parse` on ATrad API responses
- `#gridContainer4 table` is the market watch table, NOT the holdings table — don't confuse them
- Leave `stockHoldingSecurity` empty for all-holdings query
- Logout: `#butUserLogOut`

### CSE API
- 22 endpoints at `https://www.cse.lk/api/*` — all POST, no auth
- `marketSummery` (sic — CSE's typo, not ours)
- `tradeSummary` returns 296 stocks with price, change, volume
- Rate limit unknown — keep polling to 5-min intervals minimum

### AI/Claude API
- Haiku (`claude-haiku-4-5-20251001`): Use for daily digests, simple summaries. ~$0.01/call
- Sonnet (`claude-sonnet-4-6`): Use for weekly briefs, recommendations, deep analysis. ~$0.05/call
- Always request raw JSON output (no markdown fences) for structured data
- Cache aggressively: daily brief 4h, signals 20h, digests 24h
- Monthly budget guard at 500K tokens — auto-downgrade Sonnet → Haiku above threshold

### VPS Deployment Rules (Learned from April 8 Incident)
- **VPS timezone is Asia/Colombo (SLT, UTC+5:30)** — ALL @Cron expressions must use SLT times directly, NOT UTC
- **Verify with `timedatectl`** on every new VPS before writing cron expressions
- **To get newest N rows:** `ORDER BY DESC` + `TAKE(N)` + `.reverse()` — NEVER `ASC` + `TAKE(N)` (that returns the oldest N)
- **Test cron fire times in PM2 logs** after any cron change — match log timestamps against intended SLT times
- **Redis `cse:trade_summary` has 1h TTL** — any cron that depends on it MUST run during or shortly after market hours, never overnight
- **`saveDailyPrices()` needs a weekday guard** — it creates records for "today" even on weekends/holidays
- **If a price looks implausible** (>20% overnight change), investigate the data pipeline FIRST, don't assume corporate action
- **Auth on VPS uses httpOnly cookies with `secure: true`** — API trigger scripts must extract the `Set-Cookie` header and pass `Cookie: access_token=<token>` (not Bearer header for cookie-based auth)

### Common Mistakes to Avoid
- TypeORM 0.3+: `findOne()` REQUIRES a `where` clause — `findOne({ order: ... })` throws
- ATrad returns account number in adjacent fields — filter values > 50M as implausible
- CSE price data in AI briefs can be stale — always validate against live data
- Don't show -100% P&L when portfolio has no holdings (T+2 settlement lag)
- Don't run Strategy Test on mock data — confirm real data pipeline first
- `lastTradedPrice` and `priceChange` are wrong field names in Redis cache — correct: `price` and `change`

---

## Git Workflow

```bash
# After every meaningful change:
npx tsc --noEmit                    # Verify no TS errors
git add -A
git commit -m "feat|fix|refactor(module): description"
# Push only when explicitly asked
```

**Branch strategy:** Work on `main` for now (single developer). Create feature branches for large changes.

**Never commit:** `.env`, `node_modules/`, `data/tracking/`, `data/atrad-sync/*.html`, `*.png` screenshots

---

## File Locations Quick Reference

| What | Where |
|------|-------|
| Backend entry | `src/backend/src/main.ts` |
| Cron schedules | `src/backend/src/modules/cse-data/cse-data.service.ts` |
| AI prompts | `src/backend/src/modules/ai-engine/prompts.ts` |
| ATrad browser | `src/backend/src/modules/atrad-sync/atrad-browser.ts` |
| Notifications | `src/backend/src/modules/notifications/notifications.service.ts` |
| Portfolio | `src/backend/src/modules/portfolio/portfolio.service.ts` |
| Journey | `src/backend/src/modules/journey/journey.service.ts` |
| Shariah | `src/backend/src/modules/shariah/shariah-screening.service.ts` |
| Frontend pages | `src/frontend/src/app/*/page.tsx` |
| Recon script | `scripts/atrad-recon.ts` |
| Agent API | `src/backend/src/modules/agent/agent.controller.ts` |
| Agent service | `src/backend/src/modules/agent/agent.service.ts` |
| Agent key guard | `src/backend/src/common/guards/agent-key.guard.ts` |
| WSL2 Agent | `src/agent/src/index.ts` |
| Agent VPS client | `src/agent/src/vps-client.ts` |
| ATrad selectors | `src/agent/src/atrad/selectors.ts` |
| Agent recon | `src/agent/scripts/recon.ts` |
| Agent PM2 config | `src/agent/ecosystem.config.js` |
| PM2 config | `ecosystem.config.js` (to create) |
| Task tracking | `tasks/todo.md` (to create) |
| Lessons learned | `tasks/lessons.md` (to create) |
