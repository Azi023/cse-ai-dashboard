# CSE AI Investment Intelligence Dashboard

> A personal AI-powered, Shariah-compliant investment intelligence platform for the Colombo Stock Exchange (CSE).

Built for Sri Lankan retail investors who want data-driven, Shariah-filtered stock analysis — without paying for Bloomberg terminals. Currently a personal tool, designed for future public release.

---

## Features

### Market Intelligence
- **Live CSE Data** — ASPI, S&P SL20, top gainers/losers, most active, all 20 sector indices (5-min polling during market hours)
- **AI Daily Brief** — Claude Sonnet pre-market analysis: sentiment, sector rotation, key levels, actionable watchlist
- **AI Trading Signals** — 5 signals per session with direction, confidence, and holding period
- **AI Strategy Chat** — Interactive research assistant with live market context
- **News Intelligence** — RSS aggregation from Economy Next and Google News CSE (every 30 min)
- **Announcements** — Financial + approved CSE announcements with search

### Portfolio & Compliance
- **Portfolio Tracker** — Add holdings with broker fees, P&L using effective cost basis, daily change, sector allocation
- **ATrad Sync** — Playwright automation reads your HNB Stockbrokers holdings and cash balance (READ-ONLY, never places orders)
- **Shariah Screening** — Two-tier AAOIFI methodology: business activity (Tier 1) + financial ratios (Tier 2)
- **Purification Calculator** — Dividend purification amounts per AAOIFI guidelines
- **Journey Tracker** — Monthly RCA deposit tracking, KPIs, portfolio health score

### AI Analysis Pipeline (Phase 2 — live, accumulating data)
- **Market Snapshot** — Daily market close saved to DB (feeds scoring engine)
- **Stock Scoring Engine** — Deterministic 6-factor composite score (no AI needed): dividend yield, momentum, volume trend, volatility, sector strength, liquidity
- **AI Weekly Recommendation** — Every Friday: Claude Sonnet picks top Shariah-compliant stock with confidence + reasoning
- **Daily Digest** — 2:45 PM SLT: Haiku-generated market summary + portfolio P&L + crash alerts
- **Weekly Brief** — Friday 3:00 PM SLT: week review + AI stock pick + top 5 scores

### Alerts & Notifications
- **Bell notifications** — Unread count, alert management
- **Auto-alerts** — ASPI crash >3% (Crash Protocol reminder), portfolio drop >5%, unusual events

---

## Tech Stack

| Layer | Technology | Port |
|-------|-----------|------|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind CSS + shadcn/ui | 3000 |
| Backend | NestJS + TypeScript (strict mode) + TypeORM | 3001 |
| Database | PostgreSQL 16 | 5432 |
| Cache | Redis 7 | 6379 |
| Browser Automation | Playwright (Chromium, headless) | — |
| AI | Claude API (Haiku for digests, Sonnet for analysis) | — |
| Charts | TradingView Lightweight Charts + Recharts | — |
| Process Manager | PM2 | — |

---

## Prerequisites

- **Node.js** 20+
- **PostgreSQL** 16 running locally
- **Redis** 7 running locally
- **PM2** (optional, for persistent processes): `npm install -g pm2`
- **Playwright browsers**: `cd src/backend && npx playwright install chromium`

---

## Installation

### 1. Clone

```bash
git clone https://github.com/Azi023/cse-ai-dashboard.git
cd cse-ai-dashboard
```

### 2. Install dependencies

```bash
cd src/backend && npm install
cd ../../src/frontend && npm install
```

### 3. PostgreSQL setup

```bash
sudo -u postgres psql
```

```sql
CREATE USER cse_user WITH PASSWORD 'your_password';
CREATE DATABASE cse_dashboard OWNER cse_user;
GRANT ALL PRIVILEGES ON DATABASE cse_dashboard TO cse_user;
\q
```

Tables auto-create via TypeORM `synchronize: true` on first start.

### 4. Environment variables

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

# AI — Claude API (required for AI features)
ANTHROPIC_API_KEY=sk-ant-api03-...

# ATrad broker automation (optional — READ-ONLY)
ATRAD_URL=https://your-atrad-instance.com
ATRAD_USERNAME=your_username
ATRAD_PASSWORD=your_password

# Server
NODE_ENV=development
PORT=3001
```

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_*` | Yes | PostgreSQL connection |
| `REDIS_HOST/PORT` | Yes | Redis connection |
| `ANTHROPIC_API_KEY` | Yes (for AI) | Claude API key from [console.anthropic.com](https://console.anthropic.com) |
| `ATRAD_URL` | No | ATrad platform URL (HNB Stockbrokers) |
| `ATRAD_USERNAME` | No | ATrad login username |
| `ATRAD_PASSWORD` | No | ATrad login password |

### 5. Start

#### Option A: PM2 (recommended for persistence)

```bash
# From project root
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # auto-start on reboot
```

#### Option B: Manual

```bash
# Terminal 1 — Backend
cd src/backend
npm run start:dev

# Terminal 2 — Frontend
cd src/frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 6. Seed Shariah data (first run)

```bash
cd src/backend
npx tsx ../../scripts/seed-shariah-data.ts
```

This marks known COMPLIANT and NON_COMPLIANT stocks. All others stay as `PENDING_REVIEW` until financial ratio data is imported.

---

## Architecture

```
cse-ai-dashboard/
├── ecosystem.config.js          # PM2 process configuration
├── scripts/                     # Standalone scripts
│   ├── atrad-recon.ts           # ATrad holdings verification
│   ├── seed-shariah-data.ts     # Shariah compliance seed data
│   └── ingest-cbsl-data.ts      # CBSL macro data import
├── src/
│   ├── backend/                 # NestJS API (port 3001)
│   │   └── src/
│   │       ├── entities/        # 22 TypeORM entities
│   │       └── modules/
│   │           ├── cse-data/    # CSE API polling + Redis caching
│   │           ├── ai-engine/   # Claude integration, signals, chat
│   │           ├── portfolio/   # Holdings, P&L, fees, allocation
│   │           ├── analysis/    # Scoring engine, snapshots, recommendations
│   │           ├── notifications/ # Daily digest, weekly brief
│   │           ├── atrad-sync/  # Playwright ATrad automation
│   │           ├── shariah-screening/ # Two-tier compliance check
│   │           ├── journey/     # RCA tracking, KPIs, deposits
│   │           ├── news/        # RSS aggregation
│   │           ├── alerts/      # Notifications, price alerts
│   │           ├── macro/       # CBSL macro indicators
│   │           └── dividends/   # Dividend tracking + purification
│   └── frontend/                # Next.js dashboard (port 3000)
│       └── src/
│           ├── app/             # 11 pages (App Router)
│           ├── components/      # UI components (market/, layout/, ui/)
│           └── lib/             # API client, number utilities
└── data/                        # Generated data (gitignored)
    └── atrad-sync/              # ATrad screenshots + HTML dumps
```

---

## Cron Schedule (all times Sri Lanka Time, UTC+5:30)

| Time | Days | Job |
|------|------|-----|
| 9:25 AM | Mon–Fri | Pre-market warmup — initial CSE data fetch |
| Every 5 min, 9:30–2:30 PM | Mon–Fri | Market data polling (ASPI, sectors, gainers, losers) |
| Every 15 min, 9:30–2:30 PM | Mon–Fri | Announcements polling |
| Every 15 min, 9:30–2:30 PM | Mon–Fri | ATrad sync (holdings + cash balance) |
| Every 30 min, 8:00 AM–8:00 PM | Mon–Fri | News RSS aggregation |
| 9:00 AM | Mon, Thu | Shariah screening (skips if run recently) |
| 2:35 PM | Mon–Fri | Post-close market snapshot |
| 2:38 PM | Mon–Fri | ATrad post-close sync (feeds portfolio snapshot) |
| 2:40 PM | Mon–Fri | Save daily market snapshot to DB |
| 2:42 PM | Mon–Fri | Run stock scoring engine |
| 2:45 PM | Mon–Fri | Generate daily digest (Haiku) |
| 2:55 PM | Fri | Generate AI weekly recommendation (Sonnet) |
| 3:00 PM | Fri | Generate weekly brief (Sonnet) |
| 6:00 PM | Mon–Fri | After-hours announcements check |

**Zero external API calls outside these windows** (nights and weekends are completely silent).

---

## Key API Endpoints

### Market Data
```
GET /api/market/summary       ASPI, SP SL20, volume, turnover
GET /api/market/gainers       Top 10 gainers
GET /api/market/losers        Top 10 losers
GET /api/market/active        Most active by volume
GET /api/market/sectors       All 20 sector indices
GET /api/stocks               All 296 CSE stocks
GET /api/stocks/:symbol       Single stock with Shariah status
```

### AI Engine
```
GET /api/ai/daily-brief       Daily market brief (Claude Sonnet, cached 4h)
GET /api/ai/signals           5 trading signals (cached, refreshed daily at 2:35 PM)
POST /api/ai/chat             Strategy chat (live API)
GET /api/ai/usage             Monthly token usage
```

### Portfolio
```
GET /api/portfolio            All holdings with live P&L
GET /api/portfolio/summary    Total value, invested, P&L, allocation
POST /api/portfolio           Add holding (symbol, quantity, buy_price, fees, buy_date)
PUT /api/portfolio/:id        Update holding
DELETE /api/portfolio/:id     Remove holding
```

### Analysis (Phase 2)
```
GET /api/analysis/data-status     Days accumulated, scoring readiness
GET /api/analysis/scores          Stock scores (available after 20 market days)
GET /api/analysis/recommendation  Latest AI weekly pick
GET /api/analysis/snapshot/latest Most recent daily market snapshot
```

### ATrad
```
GET /api/atrad/status         Last sync time, holdings count, cash balance
POST /api/atrad/sync          Trigger manual sync
```

### Notifications
```
GET /api/notifications/daily-digest   Latest digest content
GET /api/alerts/notifications         All notifications
GET /api/alerts/unread-count          Unread bell count
```

---

## Shariah Screening

This platform uses the AAOIFI / Meezan / Dow Jones Islamic Finance methodology adapted for the CSE:

### Tier 1: Business Activity (automatic exclusions)
- Banks and conventional financial institutions
- Insurance companies
- Tobacco manufacturers (CTC)
- Alcohol and distilleries (DIST, MELS, LEON)
- Casinos and gambling (JKH via Cinnamon City of Light casino)
- Conventional leasing and finance companies

### Tier 2: Financial Ratios (requires quarterly financial data)
- Interest income < 5% of total revenue
- Total debt / total assets < 30%
- Interest-bearing deposits / total assets < 30%
- Accounts receivable / total assets < 50%

Most stocks are `PENDING_REVIEW` until Tier 2 data is available. The data source is the Almas Equities whitelist — a Sri Lanka-specific Shariah screening service.

---

## ATrad Integration

The platform can read your ATrad (HNB Stockbrokers) portfolio automatically using Playwright browser automation.

**READ-ONLY**: The automation only reads data. It never clicks buy/sell buttons, never places orders, and never modifies account data.

What it reads:
- Cash balance and buying power
- All open holdings (symbol, quantity, average price)

The sync runs every 15 minutes during market hours and once at 2:38 PM (post-close). You can also trigger it manually via the Sync Now button in the Portfolio page.

---

## AI Cost Estimate

Monthly Claude API cost for solo use (1 user):

| Feature | Model | Frequency | Est. Cost/Month |
|---------|-------|-----------|-----------------|
| Daily digest | Haiku | 20 trading days | ~$0.20 |
| Weekly brief | Sonnet | 4 weeks | ~$0.20 |
| AI weekly recommendation | Sonnet | 4 weeks | ~$0.20 |
| AI signals | Sonnet | 20 days | ~$1.00 |
| AI daily brief | Sonnet | 20 days | ~$1.00 |
| Strategy chat | Sonnet | On demand | ~$0.50 |
| **Total** | | | **~$3/month** |

A 500K token monthly budget guard auto-downgrades Sonnet → Haiku above threshold.

---

## Pages

| Page | Path | Description |
|------|------|-------------|
| Dashboard | `/` | ASPI/SP SL20, AI brief, news, market movers |
| My Journey | `/journey` | RCA deposits, KPIs, portfolio health, monthly returns |
| Portfolio | `/portfolio` | Holdings, P&L (with fees), allocation, Shariah compliance |
| AI Signals | `/signals` | Trading signals with direction, confidence, Shariah status |
| Stocks | `/stocks` | Browse all 296 CSE stocks, filter by sector + Shariah |
| News | `/news` | RSS news feed from CSE-focused sources |
| Alerts | `/alerts` | Notification bell, alert history |
| Strategy Chat | `/chat` | Interactive AI research assistant |
| Backtest | `/backtest` | Test RSI, SMA, Value strategies against historical data |
| Dividends | `/dividends` | Dividend calendar, purification amounts |
| Performance | `/performance` | Signal accuracy tracking |

---

## Contributing

This is currently a personal project. Issues and PRs are welcome for bug fixes. New features require discussion first — the Shariah compliance logic in particular must not be changed without proper Islamic finance knowledge.

---

## Disclaimer

This is an educational tool, not financial advice. All data is provided for informational purposes only. Investment decisions must be made based on your own research and with appropriate professional guidance. Past signal performance does not guarantee future results.

The Shariah compliance screening is based on publicly available methodology and may not represent a formal fatwa. Consult a qualified Islamic finance scholar before making investment decisions based on this screening.

---

## License

MIT — Personal use and educational purposes.
