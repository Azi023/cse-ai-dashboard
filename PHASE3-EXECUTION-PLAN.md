# CSE AI Dashboard — Phase 3 Execution Plan
## Technical Analysis + Risk Management + Learning System

**Status: PLANNING — Do not execute until approved**
**Created: March 19, 2026**

---

## The Problem

The system currently picks stocks (12-factor fundamental scoring) but doesn't:
1. Analyze charts to time entries/exits
2. Calculate stop-losses, take-profits, or risk-reward ratios
3. Tell you exactly what order to place on ATrad (price, quantity, type)
4. Learn from past recommendations to improve future ones

This means every trade decision is fundamentally incomplete. AEL was bought at 69.50 based on fundamental quality alone — no chart analysis confirmed it was a good entry point, no stop-loss was calculated, and no exit plan was defined.

---

## Critical Data Dependency: OHLC Candles

**Before building anything, we must verify what price data the CSE API provides.**

The technical analysis engine needs OHLC (Open, High, Low, Close) candles per stock per day. Currently the `tradeSummary` endpoint returns:
- `price` (last traded / close)
- `change` (daily price change)
- `volume`

**Unknown:** Does it also return `high`, `low`, and `open` for each stock?

### Action Required BEFORE Implementation:
```bash
# Check what fields the CSE tradeSummary actually returns
curl -s http://localhost:3001/api/stocks/AEL.N0000 | python3 -c "
import json,sys
d = json.load(sys.stdin)
print(json.dumps(d, indent=2))
"

# Check the daily_prices table schema and sample data
psql -p 5433 cse_dashboard -c "
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'daily_prices' ORDER BY ordinal_position;
"

psql -p 5433 cse_dashboard -c "
SELECT * FROM daily_prices WHERE symbol = 'AEL.N0000' 
ORDER BY date DESC LIMIT 5;
"
```

**If OHLC is available:** Proceed with full technical analysis.
**If only Close is available:** We can still calculate SMA, RSI, MACD (all use close prices). We CANNOT calculate ATR (needs high/low), candlestick patterns (needs OHLC), or precise support/resistance from intraday ranges.

**Fallback if no OHLC:** The CSE companyProfile endpoint or a separate historical data endpoint may provide OHLC. Investigate before assuming we can't get it.

---

## Architecture: Three New Services

### Service 1: TechnicalService (technical.service.ts)
**Purpose:** Calculate technical indicators from price history.
**Data dependency:** 20+ days of daily price data (close required, OHLC preferred).
**AI cost:** $0 (pure math).
**Cron:** Daily at 2:41 PM SLT (after market snapshot at 2:40, before scoring at 2:42).

#### Indicators to Implement:

| Indicator | Data Needed | Min Days | What It Tells You |
|-----------|------------|----------|-------------------|
| SMA 20 | Close prices | 20 | Short-term trend direction |
| SMA 50 | Close prices | 50 | Medium-term trend direction |
| Golden/Death Cross | SMA20 + SMA50 | 50 | Major trend reversal signal |
| RSI (14-period) | Close prices | 15 | Overbought (>70) / oversold (<30) |
| MACD (12,26,9) | Close prices | 35 | Momentum direction + crossover signals |
| Support level | Low prices (or close) | 20 | Price floor where buyers step in |
| Resistance level | High prices (or close) | 20 | Price ceiling where sellers appear |
| ATR (14-period) | High + Low + Close | 15 | Volatility measure for stop-loss calculation |
| Volume trend | Volume data | 20 | Accumulation (bullish) vs distribution (bearish) |
| Candlestick patterns | OHLC | 2 | Reversal signals (hammer, engulfing, doji) |

#### Overall Signal Logic:
```
STRONG_BUY:  RSI < 30 AND price near support AND MACD bullish crossover
BUY:         RSI < 45 AND price > SMA20 AND MACD > 0
NEUTRAL:     RSI 45-55 OR conflicting signals
SELL:        RSI > 55 AND price < SMA20 AND MACD < 0
STRONG_SELL: RSI > 70 AND price near resistance AND MACD bearish crossover
```

#### Database Table: `technical_signals`
```sql
CREATE TABLE technical_signals (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  close_price DECIMAL(12,2),
  sma_20 DECIMAL(12,2),
  sma_50 DECIMAL(12,2),
  sma_trend VARCHAR(20),         -- 'BULLISH_CROSS', 'BEARISH_CROSS', 'ABOVE', 'BELOW'
  rsi_14 DECIMAL(6,2),
  rsi_signal VARCHAR(20),        -- 'OVERSOLD', 'NEUTRAL', 'OVERBOUGHT'
  macd_line DECIMAL(12,4),
  macd_signal DECIMAL(12,4),
  macd_histogram DECIMAL(12,4),
  macd_crossover VARCHAR(20),    -- 'BULLISH', 'BEARISH', 'NONE'
  support_20d DECIMAL(12,2),
  resistance_20d DECIMAL(12,2),
  atr_14 DECIMAL(12,4),          -- NULL if no OHLC data
  volume_trend VARCHAR(20),      -- 'ACCUMULATION', 'DISTRIBUTION', 'NEUTRAL'
  volume_ratio DECIMAL(6,2),     -- today vol / 20d avg vol
  candlestick_pattern VARCHAR(30), -- NULL if no OHLC
  overall_signal VARCHAR(20),    -- 'STRONG_BUY' to 'STRONG_SELL'
  signal_summary TEXT,           -- 1-2 sentence human-readable summary
  UNIQUE(date, symbol)
);
```

---

### Service 2: RiskService (risk.service.ts)
**Purpose:** Calculate position risk metrics for held stocks.
**Data dependency:** Portfolio holdings + technical_signals (for ATR).
**AI cost:** $0 (pure math).
**Cron:** Daily at 2:43 PM SLT (after technicals at 2:41).

#### Calculations Per Held Position:

| Metric | Formula | Purpose |
|--------|---------|---------|
| Stop-Loss (ATR-based) | entry_price - (2 × ATR14) | Where to cut losses |
| Stop-Loss (Support-based) | support_20d - (0.5 × ATR14) | Alternative: below nearest support |
| Take-Profit | entry_price + (2 × risk) where risk = entry - stop | 1:2 risk-reward minimum |
| Risk per Share (LKR) | entry_price - stop_loss | How much you lose per share if stopped |
| Max Loss (LKR) | shares_held × risk_per_share | Total possible loss on this position |
| Risk-Reward Ratio | (take_profit - current) / (current - stop_loss) | Should be > 2.0 |
| Distance to Stop (%) | (current - stop_loss) / current × 100 | How close to getting stopped out |
| Position Heat (%) | max_loss / total_portfolio_value × 100 | How much of portfolio is at risk |

#### Position Sizing for New Purchases:
```
max_risk_per_trade = total_portfolio_value × 0.02  (2% rule)
risk_per_share = entry_price - stop_loss
max_shares = floor(max_risk_per_trade / risk_per_share)
actual_shares = min(max_shares, floor(available_cash / entry_price))
```

#### Portfolio-Level Risk:
```
total_portfolio_heat = sum(position_heat) for all positions
SAFE:    heat < 4%
CAUTION: heat 4-6%
DANGER:  heat > 6%  → reduce position or tighten stops
```

#### Database Table: `position_risk`
```sql
CREATE TABLE position_risk (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  entry_price DECIMAL(12,2),
  current_price DECIMAL(12,2),
  shares_held INTEGER,
  stop_loss_atr DECIMAL(12,2),      -- ATR-based stop
  stop_loss_support DECIMAL(12,2),  -- Support-based stop
  recommended_stop DECIMAL(12,2),   -- Higher of the two
  take_profit DECIMAL(12,2),
  risk_per_share DECIMAL(12,4),
  reward_per_share DECIMAL(12,4),
  risk_reward_ratio DECIMAL(6,2),
  max_loss_lkr DECIMAL(12,2),
  max_gain_lkr DECIMAL(12,2),
  distance_to_stop_pct DECIMAL(6,2),
  position_heat_pct DECIMAL(6,2),
  portfolio_heat_pct DECIMAL(6,2),   -- All positions combined
  risk_status VARCHAR(20),           -- 'SAFE', 'CAUTION', 'DANGER'
  UNIQUE(date, symbol)
);
```

---

### Service 3: LearningService (learning.service.ts)
**Purpose:** Track recommendation accuracy and feed learnings back.
**Data dependency:** ai_recommendations + historical prices.
**AI cost:** $0 for tracking, $0.01 for weekly accuracy report.
**Cron:** Monday 9:15 AM SLT (check last week's outcomes).

#### What Gets Tracked:

For each past AI recommendation:
```
- recommended_stock, recommended_date, price_at_recommendation
- price_after_1_week, return_1w
- price_after_1_month, return_1m
- price_after_3_months, return_3m
- did_hit_stop_loss (boolean)
- did_hit_take_profit (boolean)
- was_actually_purchased (boolean — did user follow the recommendation?)
- max_drawdown_from_entry (worst price between entry and current)
- max_gain_from_entry (best price between entry and current)
```

#### Accuracy Metrics:
```
win_rate_1m = profitable_at_1m / total_with_1m_data
avg_return_1m = mean(return_1m for all tracked recommendations)
best_pick = highest return_1m
worst_pick = lowest return_1m
sharpe_ratio = mean_return / stddev_return (once enough data)
```

#### Fed Back Into AI Prompt:
```
"YOUR PAST PERFORMANCE (last 3 months):
- Recommendations made: 8
- Win rate at 1-month: 62.5% (5/8 profitable)
- Average 1-month return: +3.2%
- Best pick: TJL.N0000 (+12.4%)
- Worst pick: AEL.N0000 (-8.9%) — entered during correction, recovered later
- Lesson: your stock picks are fundamentally sound but entry timing 
  needs improvement — 3 of 3 losses were due to buying during a 
  multi-day downtrend. Weight technical entry signals more heavily."
```

#### Database Table: `recommendation_outcomes`
```sql
CREATE TABLE recommendation_outcomes (
  id SERIAL PRIMARY KEY,
  recommendation_id INTEGER REFERENCES ai_recommendations(id),
  symbol VARCHAR(20) NOT NULL,
  recommended_date DATE NOT NULL,
  recommended_price DECIMAL(12,2),
  price_1w DECIMAL(12,2),
  return_1w DECIMAL(8,4),
  price_1m DECIMAL(12,2),
  return_1m DECIMAL(8,4),
  price_3m DECIMAL(12,2),
  return_3m DECIMAL(8,4),
  hit_stop_loss BOOLEAN DEFAULT FALSE,
  hit_take_profit BOOLEAN DEFAULT FALSE,
  was_purchased BOOLEAN DEFAULT FALSE,
  max_drawdown DECIMAL(8,4),
  max_gain DECIMAL(8,4),
  notes TEXT,
  updated_at TIMESTAMP DEFAULT now()
);
```

---

## Updated Cron Schedule (complete)

| Time (SLT) | Job | Service | Cost |
|-------------|-----|---------|------|
| 9:25 AM | Pre-market warmup | CseDataService | $0 |
| 9:30-14:30 | Market polling (5min) | CseDataService | $0 |
| 2:35 PM | Post-close snapshot | CseDataService | $0 |
| 2:38 PM | ATrad portfolio sync | ATradSyncService | $0 |
| 2:40 PM | Market + portfolio snapshots | AnalysisService | $0 |
| **2:41 PM** | **Technical indicators** | **TechnicalService** | **$0** |
| 2:42 PM | 12-factor stock scoring | AnalysisService | $0 |
| **2:43 PM** | **Position risk metrics** | **RiskService** | **$0** |
| 2:45 PM | Daily digest (Haiku) | NotificationsService | ~$0.01 |
| 2:55 PM Fri | AI recommendation (Sonnet) | AnalysisService | ~$0.05 |
| 3:00 PM Fri | Weekly brief (Sonnet) | NotificationsService | ~$0.05 |
| **Mon 9:15 AM** | **Outcome tracking** | **LearningService** | **$0** |
| 6:00 PM | After-hours announcements | CseDataService | $0 |
| **Sun 2:00 AM** | **Company profile sync** | **AnalysisService** | **$0** |

**Bold = new additions**
**Monthly AI cost: ~$1.50 (unchanged)**

---

## Implementation Order

### Sprint 1: Data Foundation (Day 1)
**Goal:** Verify OHLC data availability and ensure daily_prices has the right columns.

1. Check CSE tradeSummary response for high/low/open fields
2. Check daily_prices table schema — does it store OHLC or just close?
3. If OHLC missing from CSE API, check companyProfile or other endpoints
4. If OHLC truly unavailable: adapt technicals to close-only mode (no ATR, no candlesticks)
5. Ensure daily_prices is accumulating correctly (check row count per day)

### Sprint 2: Technical Analysis Engine (Day 1-2)
**Goal:** Build TechnicalService with all indicators.

1. Create technical_signals entity
2. Implement SMA calculation (20-day and 50-day)
3. Implement RSI (14-period) using Wilder's smoothing
4. Implement MACD (12, 26, 9 EMA periods)
5. Implement support/resistance (20-day high/low)
6. Implement ATR (14-period) — only if OHLC available
7. Implement volume trend analysis
8. Implement candlestick pattern detection — only if OHLC available
9. Implement overall signal aggregation logic
10. Add cron at 2:41 PM SLT
11. Add GET /api/analysis/technicals and /api/analysis/technicals/:symbol
12. Test with whatever accumulated data exists (will show placeholders if < 20 days)

### Sprint 3: Risk Management (Day 2)
**Goal:** Build RiskService with stop-loss, take-profit, position sizing.

1. Create position_risk entity
2. Implement ATR-based stop-loss (or fallback to % of price if no ATR)
3. Implement support-based stop-loss
4. Implement take-profit calculation (1:2 R:R minimum)
5. Implement position sizing (2% rule)
6. Implement portfolio heat calculation
7. Add cron at 2:43 PM SLT
8. Add GET /api/analysis/risk and /api/analysis/risk/:symbol
9. Test with AEL holding

### Sprint 4: Learning System (Day 2-3)
**Goal:** Build LearningService to track outcomes over time.

1. Create recommendation_outcomes entity
2. Implement outcome checker (runs Monday, looks up current prices for past recs)
3. Implement accuracy calculator (win rate, avg return, best/worst)
4. Add GET /api/analysis/model-performance
5. Wire accuracy data into the weekly recommendation prompt
6. This won't produce real results for 4+ weeks (needs recommendation history)

### Sprint 5: Upgrade AI Prompt (Day 3)
**Goal:** Feed technicals + risk + learning into recommendation.

1. Update weekly recommendation to include technical signals for top 10
2. Include position risk metrics for current holdings
3. Include past performance stats
4. Add entry parameters to output: limit price, stop-loss, take-profit, shares
5. Add order type recommendation ("Place a LIMIT order at...")

### Sprint 6: Frontend Integration (Day 3-4)
**Goal:** Display technicals and risk on the UI.

1. Stock detail page: technical indicators card (SMA, RSI, MACD, S/R, signal)
2. Portfolio page: risk management section (stop-loss, TP, R:R for each holding)
3. Journey page: model accuracy stat (once data exists)
4. Daily digest: include risk alerts ("AEL is 3% from stop-loss")
5. Trade alert notification: specific order parameters

### Sprint 7: Testing & Verification (Day 4)
**Goal:** QA everything end-to-end.

1. All new endpoints return correct data (or proper "insufficient data" messages)
2. Technical indicators match manual calculation for AEL
3. Risk metrics are mathematically correct
4. Frontend renders all new sections
5. TypeScript compiles clean
6. Cron jobs fire at correct times
7. Git commit everything

---

## What This Changes for Your Trading

### Before (current state):
"Buy AEL sometime this month. It's Shariah-compliant with good fundamentals."

### After (with all three layers):
"BUY 67 shares of AEL.N0000. Place a LIMIT order at LKR 63.50 
(near 20-day support at 63.20). Set stop-loss at LKR 58.40 
(2× ATR below entry). Take-profit target: LKR 75.20 (1:2 R:R).
This risks LKR 342 (1.8% of portfolio) for a potential gain of 
LKR 684. RSI is 28 (oversold), MACD is about to cross bullish, 
volume shows accumulation. Confidence: HIGH."

---

## Open Questions (Must Answer Before Executing)

1. **Does the CSE API provide OHLC data?** If not, technical analysis is limited to close-only indicators.
2. **Does the daily_prices table store high/low/open?** If not, schema needs extending.
3. **Should stop-loss calculations assume you'll actually place TP/SL orders on ATrad?** Or are they just mental reference points for manual monitoring?
4. **Do you want the system to alert you in real-time during market hours if a stop-loss is breached?** This would require a separate intraday monitoring cron (every 5 min during market hours, checking positions against their stops).
5. **How aggressive should position sizing be?** 2% risk per trade is standard conservative. Should we use 1% for extra safety given your small capital base?

---

## Approval Checklist

- [ ] User confirms OHLC data availability (or accepts close-only mode)
- [ ] User confirms 2% position sizing rule (or specifies different %)
- [ ] User confirms whether stop-losses are mental or actual ATrad TP/SL orders
- [ ] User confirms whether intraday stop-loss monitoring is needed
- [ ] Plan is finalized — proceed to execution
