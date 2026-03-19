# CSE AI Investment Intelligence Dashboard

> AI-powered, Shariah-compliant investment assistant for the Colombo Stock Exchange.

An intelligent trading platform that watches the market, analyzes 296 stocks across 12 factors, calculates exact entry/exit points with risk management, and sends you daily actionable updates — all while strictly filtering for Islamic finance compliance.

Currently in active development. Built for Sri Lankan retail investors who want institutional-grade analysis without Bloomberg-level costs.

---

## How It Works

1. **Market opens at 9:30 AM** — the system starts pulling live prices, volumes, and news every 5 minutes
2. **During the day** — it monitors your positions against calculated stop-loss levels. If a stock nears your danger zone, you get an immediate alert
3. **Market closes at 2:30 PM** — the system saves the day's data, calculates technical indicators (RSI, MACD, moving averages), scores all compliant stocks, and updates your risk metrics
4. **2:45 PM** — you receive a daily digest: market summary, your portfolio P&L, any warnings
5. **Every Friday** — the AI picks the best stock to buy next with exact price, stop-loss, take-profit, and how many shares to buy
6. **Over time** — the system tracks its own recommendations and adjusts confidence based on what actually worked

You review, you approve, you stay in control. The AI does the research — you make the decisions.

---

## Features

### Market Intelligence
- **Live CSE data** — ASPI, S&P SL20, gainers/losers, most active, 20 sector indices (5-min polling)
- **AI daily brief** — Sentiment analysis, sector rotation, key support/resistance levels
- **AI trading signals** — 5 signals per session with direction, confidence, Shariah status
- **AI strategy chat** — Ask questions about any stock, sector, or market condition
- **News intelligence** — Aggregated from Economy Next, Daily FT, Google News CSE
- **Announcements** — Financial + approved CSE announcements with search

### Technical Analysis (8 indicators)
- **SMA 20/50** — Trend direction, golden/death cross detection
- **RSI (14-period)** — Overbought/oversold signals with Wilder's smoothing
- **MACD (12,26,9)** — Momentum crossovers
- **ATR (14-period)** — Volatility measurement for stop-loss calculation
- **Support/resistance** — 20-day high/low levels from OHLC data
- **Volume analysis** — Accumulation vs distribution detection
- **Candlestick patterns** — Engulfing, hammer, doji detection
- **Overall signal** — Composite score from STRONG_BUY to STRONG_SELL

### Risk Management
- **Stop-loss calculator** — ATR-based and support-based (picks the tighter protection)
- **Take-profit targets** — Minimum 1:2 risk-reward ratio enforced
- **Position sizing** — 1% maximum risk per trade (configurable)
- **Portfolio heat tracking** — Total capital at risk across all positions (SAFE/CAUTION/DANGER)
- **Real-time stop monitor** — Checks every 5 minutes during market hours, alerts immediately if price nears stop

### AI Analysis Pipeline
- **12-factor stock scoring** — Fundamentals (35%), valuation (25%), technicals (25%), market context (15%)
- **Weekly AI recommendation** — Specific stock + entry price + stop-loss + take-profit + share quantity
- **Daily digest** — AI-generated market summary with portfolio P&L (Haiku model, 2:45 PM)
- **Weekly brief** — Deep analysis with forward outlook (Sonnet model, Friday 3:00 PM)
- **Learning system** — Tracks past recommendation accuracy, feeds performance back into future prompts

### Portfolio & Compliance
- **Portfolio tracker** — Holdings with broker fees, effective cost basis, real-time P&L
- **ATrad sync** — Playwright automation reads HNB Stockbrokers holdings and cash balance
- **Shariah screening** — Two-tier AAOIFI methodology (business activity + financial ratios)
- **Purification calculator** — Dividend purification amounts per AAOIFI guidelines
- **Journey tracker** — Monthly RCA deposits, KPIs, portfolio health score (0-100)

### Alerts & Notifications
- **Daily digest notification** — Automated at market close
- **Stop-loss proximity alerts** — Real-time during market hours
- **Crash protocol** — ASPI drop > 3% triggers special alert with guidance
- **Shariah status changes** — Alert if any held stock's compliance status changes

---

## Tech Stack

| Layer | Technology | Port |
|-------|-----------|------|
| Frontend | Next.js 14 + TypeScript + Tailwind CSS + shadcn/ui + framer-motion | 3000 |
| Backend | NestJS + TypeScript + TypeORM | 3001 |
| Database | PostgreSQL 16 | 5432 |
| Cache | Redis 7 | 6379 |
| Browser Automation | Playwright (Chromium) | — |
| AI | Claude API (Haiku for digests, Sonnet for analysis) | — |
| Charts | TradingView Lightweight Charts + Recharts | — |
| Process Manager | PM2 | — |

---

## Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL 16
- Redis 7
- PM2: `npm install -g pm2`
- Playwright: `cd src/backend && npx playwright install chromium`

### Installation

```bash
# Clone
git clone https://github.com/Azi023/cse-ai-dashboard.git
cd cse-ai-dashboard

# Install dependencies
cd src/backend && npm install
cd ../../src/frontend && npm install

# Database setup
sudo -u postgres psql -c "CREATE USER cse_user WITH PASSWORD 'your_password';"
sudo -u postgres psql -c "CREATE DATABASE cse_dashboard OWNER cse_user;"
```

### Environment Variables

Create `src/backend/.env`:

```env
# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=cse_user
DATABASE_PASSWORD=your_password
DATABASE_NAME=cse_dashboard

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# AI (required for AI features)
ANTHROPIC_API_KEY=sk-ant-api03-...

# ATrad broker sync (optional)
ATRAD_URL=https://trade.hnbstockbrokers.lk/atsweb/login
ATRAD_USERNAME=your_username
ATRAD_PASSWORD=your_password

# Server
NODE_ENV=development
PORT=3001
```

### Start

```bash
# Option A: PM2 (recommended — survives terminal close)
pm2 start ecosystem.config.js
pm2 save

# Option B: Manual (two terminals)
cd src/backend && npm run start:dev    # Terminal 1
cd src/frontend && npm run dev          # Terminal 2
```

Open [http://localhost:3000](http://localhost:3000)

### First Run Setup

```bash
# Seed Shariah compliance data (marks known compliant/non-compliant stocks)
cd src/backend && npx tsx ../../scripts/seed-shariah-data.ts
```

Tables auto-create via TypeORM on first backend start.

---

## Cron Schedule

All times in Sri Lanka Time (UTC+5:30). Zero API calls outside these windows.

| Time | Days | Job |
|------|------|-----|
| 9:25 AM | Mon–Fri | Pre-market warmup |
| Every 5 min, 9:30–2:30 | Mon–Fri | Market data + trade summary polling |
| Every 5 min, 9:30–2:30 | Mon–Fri | Real-time stop-loss monitoring |
| Every 15 min, 9:30–2:30 | Mon–Fri | ATrad portfolio sync + announcements |
| Every 30 min, 8AM–8PM | Mon–Fri | News RSS feeds |
| 9:00 AM | Mon, Thu | Shariah screening |
| 2:35 PM | Mon–Fri | Post-close market snapshot |
| 2:38 PM | Mon–Fri | ATrad post-close sync |
| 2:40 PM | Mon–Fri | Save daily market + portfolio snapshots |
| 2:41 PM | Mon–Fri | Calculate technical indicators |
| 2:42 PM | Mon–Fri | Run 12-factor stock scoring |
| 2:43 PM | Mon–Fri | Calculate position risk metrics |
| 2:45 PM | Mon–Fri | Generate daily digest (Haiku) |
| 2:55 PM | Friday | Generate AI weekly recommendation (Sonnet) |
| 3:00 PM | Friday | Generate weekly brief (Sonnet) |
| Mon 9:15 AM | Monday | Track recommendation outcomes (learning) |
| 6:00 PM | Mon–Fri | After-hours announcements check |
| Sun 2:00 AM | Sunday | Company financial profile sync |

---

## Pages

| Page | Path | Description |
|------|------|-------------|
| Dashboard | `/` | Market overview, AI brief, news, market movers |
| My Journey | `/journey` | RCA deposits, KPIs, AI advisor, portfolio health |
| Portfolio | `/portfolio` | Holdings, P&L, risk management, Shariah compliance |
| Stocks | `/stocks` | Browse 296 stocks with scores, Shariah filter |
| Stock Detail | `/stocks/[symbol]` | Price chart, technical analysis, AI report |
| Signals | `/signals` | AI trading signals with confidence levels |
| News | `/news` | Aggregated CSE news with impact ratings |
| Alerts | `/alerts` | Notifications and alert management |
| Strategy Chat | `/chat` | Interactive AI research assistant |
| Backtester | `/backtest` | Test strategies against historical data |
| Dividends | `/dividends` | Dividend calendar and purification |
| Performance | `/performance` | Signal accuracy tracking |

---

## Shariah Screening Methodology

Based on AAOIFI / Meezan / Dow Jones standards adapted for Sri Lanka:

**Tier 1 — Business Activity (automatic exclusions):**
Banks, insurance, tobacco, alcohol, gambling, casinos, conventional leasing/finance, weapons, pork-related products.

**Tier 2 — Financial Ratios (quarterly review):**
- Interest income < 5% of total revenue
- Total debt / total assets < 30%
- Interest-bearing deposits / total assets < 30%
- Accounts receivable / total assets < 50%

Data source: Almas Equities whitelist (Sri Lanka's only Shariah equity screening service), cross-referenced with SEC Sri Lanka's accredited methodology.

---

## Cost

For single-user personal use:

| Item | Monthly Cost |
|------|-------------|
| Claude AI API (Haiku + Sonnet) | ~$3 |
| Cloud hosting (optional) | $0 (laptop) or $5-12 (VPS) |
| CSE market data | Free |
| News feeds | Free |
| **Total** | **~$3-15/month** |

A 500K token/month budget guard automatically downgrades Sonnet → Haiku to prevent overspend.

---

## Roadmap

### Current (v1 — Active Development)
- [x] Live CSE market data pipeline (296 stocks, 20 sectors)
- [x] 12-factor stock scoring engine
- [x] 8-indicator technical analysis (SMA, RSI, MACD, ATR, S/R, volume, candlesticks)
- [x] Risk management (stop-loss, take-profit, position sizing, portfolio heat)
- [x] AI daily digest + weekly recommendation
- [x] Shariah compliance screening (AAOIFI two-tier)
- [x] ATrad broker sync (read-only)
- [x] Learning system (recommendation outcome tracking)
- [x] Dark/light theme, responsive UI
- [ ] ATrad order automation (suggest-and-confirm — in progress)
- [ ] Full Almas whitelist import

### Phase 5 — Autonomous AI Trading
- [ ] One-click order approval → Playwright executes on ATrad
- [ ] AI auto-generates TP/SL orders for every new position
- [ ] Automated RCA execution (monthly limit-order placement)
- [ ] Full trade lifecycle: entry → monitor → exit, all AI-managed with user approval at each step
- [ ] Strict Shariah compliance enforcement — system blocks non-compliant trades even if user tries

### Phase 6 — Demo Trading Environment
- [ ] Virtual trading account with LKR 1,000,000 demo capital
- [ ] Uses real-time CSE market data (same feed as live)
- [ ] AI places trades freely on demo account to learn and test strategies
- [ ] Performance comparison: AI picks vs market benchmark vs random
- [ ] Users test their own strategies risk-free before going live

### Phase 7 — Multi-Market Expansion
- [ ] NSE (India) integration — Shariah-screened Indian stocks
- [ ] International markets (NYSE, LSE) via supported brokers
- [ ] Cross-market portfolio tracking and unified P&L
- [ ] Currency-adjusted returns (LKR ↔ INR ↔ USD)

### Phase 8 — Crypto Trading
- [ ] Shariah-screened cryptocurrency analysis
- [ ] Integration with compliant crypto exchanges
- [ ] Unified portfolio: stocks + crypto in one dashboard

### Long-Term Vision
A single platform where a Shariah-conscious investor can manage their entire portfolio — CSE stocks, international equities, and crypto — with AI handling the research, risk management, and execution while they focus on reviewing and approving decisions.

---

## API Endpoints (68 total)

Key categories:

```
/api/market/*          — Live market data, indices, sectors
/api/stocks/*          — Stock data, prices, profiles
/api/ai/*              — AI brief, signals, chat, usage
/api/portfolio/*       — Holdings, summary, Shariah status
/api/analysis/*        — Scores, technicals, risk, recommendations
/api/atrad/*           — Broker sync, status, orders
/api/notifications/*   — Digests, briefs
/api/alerts/*          — Notifications, unread count
/api/shariah/*         — Compliance screening
/api/news/*            — RSS feed aggregation
/api/journey/*         — RCA tracking, KPIs, goals
/api/dividends/*       — Dividend tracking, purification
/api/backtest/*        — Strategy backtesting
/api/macro/*           — CBSL economic indicators
```

Full endpoint documentation available via the running backend.

---

## Contributing

Issues and PRs welcome for bug fixes. Feature proposals require discussion first. Shariah compliance logic must not be modified without qualified Islamic finance knowledge.

---

## Disclaimer

**This is an educational tool, not financial advice.** All data is for informational purposes only. Investment decisions carry risk including potential loss of capital. Past AI recommendation performance does not guarantee future results. Shariah screening is based on publicly available methodology and does not constitute a fatwa. Consult a licensed financial advisor and qualified Islamic scholar before making investment decisions.

---

## License

MIT
