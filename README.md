# CSE AI Trading Dashboard

AI-powered trading intelligence platform for the Colombo Stock Exchange (CSE) with Shariah compliance screening.

## Features

### Market Data
- **Live CSE Data:** ASPI, S&P SL20, top gainers/losers, most active stocks, all 20 sector indices
- **Global Indicators:** Brent Crude, Gold, USD/LKR, S&P 500 via Yahoo Finance
- **Macro Data:** CBSL interest rates, inflation, reserves from Excel data files
- **Automatic Cron Jobs:** Market data polled every 30-60 seconds during trading hours (Mon-Fri 9:30-14:30 SLT)

### AI Intelligence
- **Daily Market Brief:** AI-generated pre-market analysis with sector rotation, key levels, and actionable watchlist
- **Stock Analysis:** Per-stock flash notes with technical, fundamental, and Shariah assessment
- **Trading Signals:** Systematic signal generation with confidence levels and risk management
- **Strategy Chat:** Interactive AI research assistant for CSE market questions
- **News Intelligence:** RSS feeds from Daily FT, Economy Next, Reuters, CNBC, Google News with AI impact analysis
- **Signal Performance Tracking:** Track AI signal accuracy with 7/14/30 day outcome measurement

### Portfolio & Compliance
- **Portfolio Tracker:** Holdings management with P&L, allocation charts, daily change
- **Shariah Screening:** Two-tier SEC Sri Lanka methodology (business activity + financial ratios)
- **Purification Calculator:** Dividend purification amounts for compliant holdings
- **Dividend Tracking:** Upcoming ex-dates, portfolio income, dividend calendar

### Analysis Tools
- **Advanced Charts:** TradingView Lightweight Charts with SMA, RSI, Bollinger Bands
- **Sector Analysis:** Performance ranking, constituent breakdown, sector comparison
- **Stock Comparison:** Compare up to 4 stocks with normalized performance and metrics
- **Strategy Backtester:** Test RSI Oversold, SMA Crossover, and Value Screen strategies against historical data
- **Data Export:** CSV/JSON exports for portfolio, Shariah reports, and price history

### Alerts & Notifications
- **Price Alerts:** Above/below threshold notifications
- **Auto Alerts:** Portfolio drop >5%, unusual volume, Shariah status changes
- **Bell Notifications:** Unread count in header with alert management page

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui (dark theme) |
| Backend | NestJS, TypeScript (strict mode), TypeORM |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Charts | TradingView Lightweight Charts v5, Recharts |
| AI | Anthropic Claude API (optional - works in mock mode without key) |

## Prerequisites

- **Node.js** >= 18
- **PostgreSQL** 16+ running on `localhost:5432`
- **Redis** 7+ running on `localhost:6379`

## Setup

### 1. Database

```bash
# Create PostgreSQL database and user
sudo -u postgres psql

CREATE USER cse_user WITH PASSWORD 'cse_secure_2026';
CREATE DATABASE cse_dashboard OWNER cse_user;
GRANT ALL PRIVILEGES ON DATABASE cse_dashboard TO cse_user;
\q
```

Tables are auto-created via TypeORM `synchronize: true` in development mode.

### 2. Redis

```bash
# Start Redis (Ubuntu/Debian)
sudo systemctl start redis-server

# Or via Docker
docker run -d -p 6379:6379 redis:7-alpine
```

### 3. Backend

```bash
cd src/backend

# Install dependencies
npm install

# Create .env file (see Environment Variables section below)
# Edit with your database credentials

# Development (with hot reload)
npm run start:dev

# Production
npm run build
npm run start:prod
```

### 4. Frontend

```bash
cd src/frontend

# Install dependencies
npm install

# Development
npm run dev

# Production
npm run build
npm start
```

### 5. AI Content Generation (Optional)

```bash
# Generate AI content using Claude API (requires ANTHROPIC_API_KEY)
cd scripts
node generate-ai-content.js

# Or run the pre-market startup script
./startup.sh
```

## Environment Variables

### Backend (`src/backend/.env`)

```env
# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=cse_user
DATABASE_PASSWORD=cse_secure_2026
DATABASE_NAME=cse_dashboard

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# AI (Optional - dashboard works without this in mock mode)
ANTHROPIC_API_KEY=sk-ant-api03-...

# Environment
NODE_ENV=development
PORT=3001
```

### Frontend (`src/frontend/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

## API Keys & External Services

| Service | Required? | How to Get | Notes |
|---------|-----------|-----------|-------|
| **Anthropic Claude API** | Optional | [console.anthropic.com](https://console.anthropic.com) | Enables live AI analysis. Without it, dashboard uses intelligent mock data. |
| **CSE API** | Automatic | `https://www.cse.lk/api/` | Free, no key needed. 22 POST endpoints for market data. |
| **Yahoo Finance** | Automatic | Chart API | Free, no key needed. Used for global indicators (oil, gold, S&P 500). |
| **Exchange Rate API** | Automatic | `api.exchangerate-api.com` | Free, no key needed. Used for USD/LKR rate. |
| **RSS Feeds** | Automatic | Various | Free. Daily FT, Economy Next, Google News RSS feeds. |

## What's Needed for Full Functionality

### Minimal Setup (works immediately)
- PostgreSQL + Redis running
- Backend + Frontend started
- **Result:** Full dashboard with live CSE data, mock AI, Shariah screening, portfolio tracking

### Enhanced Setup (for AI features)
- Add `ANTHROPIC_API_KEY` to backend `.env`
- **Result:** Live AI daily briefs, stock analysis, strategy chat, trading signals

### Complete Data (for maximum value)
1. **Company Financials:** Manually enter via `/admin/financials` page to enable:
   - Accurate Shariah Tier 2 screening (financial ratio checks)
   - P/E, debt ratios, and fundamental analysis
2. **Dividend Records:** Add via `/dividends` page for:
   - Dividend calendar and income tracking
   - Accurate purification calculations
3. **CBSL Macro Data:** Upload Excel files via `POST /api/macro/refresh` for:
   - Interest rate, inflation, reserves indicators on dashboard

## Project Structure

```
cse-ai-dashboard/
├── docs/                          # Blueprint and planning documents
├── scripts/                       # Utility scripts (AI content generator, startup)
├── data/                          # Local data storage (gitignored)
│   └── ai-generated/              # Pre-generated AI content files
├── src/
│   ├── backend/                   # NestJS API server (port 3001)
│   │   └── src/
│   │       ├── entities/          # 12 TypeORM entities
│   │       └── modules/           # 14 feature modules
│   │           ├── cse-data/      # CSE API integration + Redis caching
│   │           ├── stocks/        # Stock & market REST API
│   │           ├── shariah-screening/
│   │           ├── portfolio/
│   │           ├── company-financials/
│   │           ├── cbsl-data/     # CBSL macro indicators
│   │           ├── ai-engine/     # AI analysis (Claude API or mock)
│   │           ├── global-data/   # Global market indicators
│   │           ├── dividends/
│   │           ├── alerts/
│   │           ├── signal-tracking/
│   │           ├── news/          # RSS news intelligence
│   │           ├── export/        # CSV/JSON data export
│   │           └── backtest/      # Strategy backtesting
│   └── frontend/                  # Next.js dashboard (port 3000)
│       └── src/
│           ├── app/               # 18 pages
│           ├── components/        # UI components
│           └── lib/               # API client, utilities
```

## Key API Endpoints

### Market Data
- `GET /api/market/summary` - ASPI, S&P SL20, volume, turnover
- `GET /api/market/gainers` / `losers` / `active` / `sectors`
- `GET /api/stocks` - All stocks (filterable by sector, shariah)
- `GET /api/stocks/:symbol/prices?days=90` - Price history

### AI Engine
- `GET /api/ai/daily-brief` - Daily market analysis
- `GET /api/ai/analyze/:symbol` - Stock analysis
- `POST /api/ai/chat` - Strategy chat
- `GET /api/ai/signals` - Trading signals

### News Intelligence
- `GET /api/news?source=&category=&impact=&search=` - News feed
- `GET /api/news/high-impact` - High impact news (last 24h)
- `POST /api/news/refresh` - Fetch latest RSS feeds

### Backtesting
- `GET /api/backtest/run?strategy=RSI_OVERSOLD&symbol=JKH.N0000&days=365&capital=10000`
- `GET /api/backtest/strategies` - Available strategies

### Data Export
- `GET /api/export/portfolio` - Portfolio export (JSON with CSV)
- `GET /api/export/shariah` - Shariah compliance report
- `GET /api/export/prices/:symbol` - Price history export

## Cron Schedule

| Schedule | Task |
|----------|------|
| Every 30s (market hours) | Poll trade summary |
| Every 60s (market hours) | Fetch market data (ASPI, sectors, gainers, losers) |
| Every 30min | Fetch announcements + RSS news feeds |
| 8:00 AM SLT daily | Fetch global indicators (oil, gold, USD/LKR, S&P 500) |
| 3:00 PM SLT Mon-Fri | Save daily market summary + daily prices |
| 3:00 PM SLT daily | Check signal outcomes (7/14/30 day) |

## Pages

| Page | Path | Description |
|------|------|-------------|
| Dashboard | `/` | Market overview with indices, AI brief, news, watchlist, market movers |
| Stocks | `/stocks` | Browse all stocks with search, sector, and Shariah filters |
| Stock Detail | `/stocks/[symbol]` | Price chart (SMA, RSI, Bollinger), analysis, financials |
| Portfolio | `/portfolio` | Holdings, P&L, allocation, Shariah compliance, purification |
| Shariah | `/shariah` | Screening results, compliant/non-compliant/pending lists |
| Signals | `/signals` | AI trading signals with direction and confidence filters |
| Sectors | `/sectors` | Sector performance ranking with constituent breakdown |
| Compare | `/compare` | Side-by-side stock comparison (up to 4) |
| News | `/news` | RSS news feed with source, category, impact filters |
| Announcements | `/announcements` | CSE announcements with search and category filters |
| Dividends | `/dividends` | Upcoming ex-dates, portfolio income, dividend records |
| Alerts | `/alerts` | Notifications, active alerts, create new alerts |
| AI Performance | `/performance` | Signal accuracy tracking by confidence and timeframe |
| Backtester | `/backtest` | Strategy backtesting with trade history and equity curve |
| Strategy Chat | `/chat` | Interactive AI market research assistant |
| Financials | `/admin/financials` | Company financial data entry for Shariah screening |

## License

Personal project.
