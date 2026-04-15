# Demo Trading Account — Architecture & Implementation Plan

> **Phase 6** of CSE AI Investment Dashboard  
> Created: March 20, 2026 | Version: 1.0  
> ⚠️ `.env` file must NEVER be touched or modified under any circumstances ⚠️

---

## 1. Executive Summary

The demo trading account is a virtual paper trading environment that mirrors real CSE trading using live market data, but with simulated capital (LKR 1,000,000). It allows the AI to trade freely, test strategies, and build a track record — all without risking real money.

**Why this matters:**
- CEO directive: prove the AI works before deploying more real capital
- CFO meeting prep: need 30–60 days of verifiable AI trading history
- Learning acceleration: AI can make 5–10 demo trades/week vs 1–2 real trades/month (50x faster)
- The demo account uses the **exact same data pipeline** as real trading — same prices, same signals, same scoring

---

## 2. Architecture

### 2.1 System Diagram

```
┌─────────────────────────────────────────────────────────┐
│            SHARED DATA PIPELINE (existing)               │
│  CSE API → Redis Cache → PostgreSQL (daily_prices)       │
│  Scoring Engine → Technical Indicators → AI Signals      │
└───────────────────────────┬─────────────────────────────┘
                            │
               ┌────────────┴────────────┐
               │      TRADE ROUTER       │
               │   (account_type flag)   │
               └────┬────────────┬───────┘
                    │            │
        ┌───────────┴──┐  ┌─────┴─────────┐
        │ REAL ACCOUNT  │  │ DEMO ACCOUNT  │
        │ (existing)    │  │ (new module)  │
        │               │  │               │
        │ ATrad Sync    │  │ Virtual Ledger│
        │ Real P&L      │  │ Simulated Fees│
        │ LKR 20K cap   │  │ LKR 1M virtual│
        └───────────────┘  └───────────────┘
```

### 2.2 Core Principles

- **Same data, different wallet**: Demo reads from `daily_prices`, `stocks`, `ai_signals`, `scoring` — writes only to `demo_*` tables
- **Realistic fees**: Every trade deducts ~1.12% simulated brokerage. WHT on dividends at 14%
- **No ATrad dependency**: Demo trades execute instantly against last known price. No Playwright needed
- **AI freedom**: Up to 10 demo trades/day (vs suggest-and-confirm for real). 50x faster learning
- **Benchmarking**: Every trade auto-compared against ASPI buy-and-hold and random Shariah-compliant picks

---

## 3. Database Schema (5 New Tables)

No existing tables are modified. The demo module is fully isolated.

### 3.1 `demo_accounts`

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | SERIAL PK | NO | Auto-increment primary key |
| `name` | VARCHAR(100) | NO | Label: "Default Demo", "Aggressive AI", etc. |
| `initial_capital` | DECIMAL(15,2) | NO | Starting virtual capital (default: 1,000,000.00) |
| `cash_balance` | DECIMAL(15,2) | NO | Current available cash |
| `total_fees_paid` | DECIMAL(12,2) | NO | Running total of simulated brokerage fees |
| `strategy` | VARCHAR(50) | YES | AI strategy: momentum, mean_reversion, dividend_capture, rca |
| `is_active` | BOOLEAN | NO | Soft-delete flag (default: true) |
| `created_at` | TIMESTAMP | NO | Account creation time |
| `updated_at` | TIMESTAMP | NO | Last modification time |

### 3.2 `demo_trades`

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | SERIAL PK | NO | Auto-increment primary key |
| `demo_account_id` | INT FK | NO | References `demo_accounts.id` |
| `stock_id` | INT FK | NO | References `stocks.id` (existing table) |
| `symbol` | VARCHAR(20) | NO | Denormalized ticker (e.g., AEL.N0000) |
| `direction` | VARCHAR(4) | NO | BUY or SELL |
| `quantity` | INT | NO | Number of shares |
| `price` | DECIMAL(10,2) | NO | Execution price (last traded price) |
| `total_value` | DECIMAL(15,2) | NO | quantity × price |
| `fee` | DECIMAL(10,2) | NO | Simulated brokerage fee (~1.12%) |
| `net_value` | DECIMAL(15,2) | NO | BUY: total + fee. SELL: total - fee |
| `source` | VARCHAR(20) | NO | AI_SIGNAL, AI_AUTO, MANUAL, STRATEGY_TEST |
| `signal_id` | INT FK | YES | Links to `ai_signals.id` if AI-generated |
| `ai_reasoning` | TEXT | YES | AI explanation (shown in UI) |
| `shariah_status` | VARCHAR(20) | NO | COMPLIANT/VERIFY/PENDING at trade time |
| `market_snapshot` | JSONB | YES | ASPI, sector index, volume at trade time |
| `executed_at` | TIMESTAMP | NO | Virtual trade execution time |
| `created_at` | TIMESTAMP | NO | Record creation time |

### 3.3 `demo_holdings`

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | SERIAL PK | NO | Auto-increment primary key |
| `demo_account_id` | INT FK | NO | References `demo_accounts.id` |
| `stock_id` | INT FK | NO | References `stocks.id` |
| `symbol` | VARCHAR(20) | NO | Denormalized ticker |
| `quantity` | INT | NO | Total shares held |
| `avg_cost_basis` | DECIMAL(10,2) | NO | Weighted avg cost per share (incl. fees) |
| `total_invested` | DECIMAL(15,2) | NO | Total capital deployed |
| `realized_pnl` | DECIMAL(15,2) | NO | Profit/loss from closed positions (default: 0) |
| `shariah_status` | VARCHAR(20) | NO | Current compliance status |
| `updated_at` | TIMESTAMP | NO | Last trade or revaluation time |

### 3.4 `demo_daily_snapshots`

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | SERIAL PK | NO | Auto-increment primary key |
| `demo_account_id` | INT FK | NO | References `demo_accounts.id` |
| `snapshot_date` | DATE | NO | Trading day (UNIQUE with demo_account_id) |
| `portfolio_value` | DECIMAL(15,2) | NO | Cash + market value of all holdings |
| `cash_balance` | DECIMAL(15,2) | NO | Uninvested cash at close |
| `holdings_value` | DECIMAL(15,2) | NO | Sum of (quantity × closing price) |
| `total_return_pct` | DECIMAL(8,4) | NO | % return from initial capital |
| `aspi_value` | DECIMAL(10,2) | NO | ASPI closing value for benchmark |
| `aspi_return_pct` | DECIMAL(8,4) | NO | ASPI return since account creation |
| `num_holdings` | INT | NO | Number of distinct stocks held |
| `trades_today` | INT | NO | Trades executed today |
| `created_at` | TIMESTAMP | NO | Snapshot capture time |

### 3.5 `demo_benchmarks`

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | SERIAL PK | NO | Auto-increment primary key |
| `demo_account_id` | INT FK | NO | References `demo_accounts.id` |
| `benchmark_date` | DATE | NO | Trading day |
| `ai_portfolio_value` | DECIMAL(15,2) | NO | AI demo total value |
| `ai_return_pct` | DECIMAL(8,4) | NO | AI cumulative return % |
| `aspi_return_pct` | DECIMAL(8,4) | NO | ASPI buy-and-hold return % |
| `random_return_pct` | DECIMAL(8,4) | NO | Random Shariah picks return % |
| `sharpe_ratio` | DECIMAL(6,4) | YES | AI Sharpe ratio (needs 20+ days) |
| `max_drawdown` | DECIMAL(8,4) | YES | Max peak-to-trough decline % |
| `win_rate` | DECIMAL(6,4) | YES | % of closed trades profitable |
| `created_at` | TIMESTAMP | NO | Record creation time |

---

## 4. API Endpoints

All demo endpoints prefixed with `/api/demo/`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/demo/accounts` | List all demo accounts |
| POST | `/api/demo/accounts` | Create new demo account |
| GET | `/api/demo/accounts/:id` | Account details with P&L |
| POST | `/api/demo/accounts/:id/reset` | Reset to initial capital |
| GET | `/api/demo/trades` | Trade history (paginated, filterable) |
| POST | `/api/demo/trades` | Execute demo trade (manual or AI) |
| GET | `/api/demo/holdings/:accountId` | Current holdings with live P&L |
| GET | `/api/demo/performance/:accountId` | Return, Sharpe, drawdown, win rate |
| GET | `/api/demo/benchmarks/:accountId` | AI vs ASPI vs Random data |
| GET | `/api/demo/snapshots/:accountId` | Daily equity curve data |
| POST | `/api/demo/ai-trade/:accountId` | Trigger AI trade cycle |
| GET | `/api/demo/ai-log/:accountId` | AI decision log with reasoning |

---

## 5. Fee Simulation

Based on actual AEL.N0000 trade data (200 shares @ LKR 69.50 = LKR 14,055.69 total, ~1.12% all-in).

| Fee Component | Rate | Applied To |
|--------------|------|------------|
| Brokerage Commission | 0.50% | Transaction value |
| CSE Fee | 0.036% | Transaction value |
| CDS Fee | 0.024% | Transaction value |
| SEC Levy | 0.036% | Transaction value |
| STL/Clearing | 0.024% | Transaction value |
| **TOTAL ALL-IN** | **~1.12%** | Per trade |

Dividends: 14% WHT deducted. Purification calculator runs on demo dividends too.

---

## 6. AI Trading Logic

### 6.1 Guardrails

- Max 10 trades/day
- Max 20% of portfolio in a single trade
- Only COMPLIANT stocks (Shariah check required)
- Only during market hours (9:30 AM – 2:30 PM SLT)
- Must record `ai_reasoning` for every trade
- Stop-loss at 15% below average cost
- No single stock > 40% of portfolio value

### 6.2 Decision Flow

```
CRON: Every 30 min during market hours (10:00, 10:30, ... 14:00)

1. Fetch current AI signals for all Shariah-compliant stocks
2. Fetch demo holdings and cash balance
3. Evaluate each signal against guardrails
4. Rank qualifying signals by score × confidence
5. Execute top 1–2 trades per session
6. Record trade with AI reasoning
7. Update demo_holdings and cash_balance
8. Log to demo_benchmarks at EOD
```

---

## 7. Frontend Pages

### 7.1 Demo Portfolio (`/demo`)

- Account selector dropdown
- Summary card: total value, cash, holdings, return %, fees paid
- Holdings table: stock, qty, avg cost, current price, P&L, Shariah badge
- Equity curve chart (with ASPI overlay)
- Quick trade panel: stock, direction, quantity → execute
- "Let AI Trade" button (triggers one AI cycle)
- Reset account button (with confirmation)

### 7.2 Demo Performance (`/demo/performance`)

- **Hero chart**: AI vs ASPI vs Random comparison (the CFO chart)
- Metric cards: win rate, Sharpe, max drawdown, avg return
- Trade log table with AI reasoning expandable
- Sector allocation pie chart

---

## 8. Cron Jobs

| Job | Schedule | Description |
|-----|----------|-------------|
| AI Demo Trader | Every 30 min (market hours) | Evaluate signals, auto-trade |
| Demo EOD Snapshot | 2:35 PM SLT daily | Portfolio value, ASPI, returns |
| Benchmark Update | 2:40 PM SLT daily | AI vs ASPI vs Random metrics |
| Demo Dividend Sim | Weekly (Fri 3:30 PM) | Credit dividends minus 14% WHT |

---

## 9. Implementation Plan

| # | Session | Deliverables | Time |
|---|---------|-------------|------|
| 1 | Database + Entities | Migration, entities, DTOs, DemoModule | 2–3 hrs |
| 2 | Trade Engine | DemoService, DemoController, 12 endpoints, tests | 3–4 hrs |
| 3 | AI + Cron | Auto-trader, benchmarks, EOD snapshot, dividends | 2–3 hrs |
| 4 | Frontend | /demo page, /demo/performance page, nav update, theme fix | 3–4 hrs |

---

## 10. CEO Research Papers — Relevance

**arXiv:2511.12120 — Deep RL Ensemble Strategy**: PPO + A2C + DDPG ensemble for stock trading. Relevance: MEDIUM-LOW now, HIGH later. Designed for US large-cap with millions of data points — CSE is too thin for direct RL. But the ensemble concept (run multiple strategies, pick the best) maps directly to our demo multi-account approach.

**HuggingFace: Adilbai/stock-trading-rl-agent**: PPO on FAANG stocks, 60-day observation window. Relevance: LOW for direct use. Can't apply a US-trained model to CSE. But the observation space design (technical indicators + lookback window) validates our 12-factor scoring approach. Our demo account IS the CSE-specific training environment.

---

⚠️ `.env` file must NEVER be touched or modified under any circumstances ⚠️
