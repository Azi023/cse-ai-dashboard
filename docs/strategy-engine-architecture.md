# AI Investment Platform — Strategy Engine Architecture

> Phase 6: Intelligent Decision-Making Layer  
> Created: March 22, 2026  
> Status: Architecture Document — Not Yet Implemented  
> Scope: Multi-market (CSE initial, NYSE/NASDAQ/NSE future)  
> ⚠️ `.env` must NEVER be touched or modified ⚠️

---

## 1. Why This Document Exists

The dashboard currently has indicators but no strategy engine. It has a scoring model but no decision framework. It has an AI that summarizes but doesn't strategize. This document defines the architecture for transforming the product from a monitoring tool into an intelligent decision-making platform.

**Current state (Phases 1–5):** Data pipeline → Indicators → Scores → AI text summaries  
**Target state (Phase 6+):** Data pipeline → Indicators → Strategy Engine → Signal Generation → Risk-Adjusted Recommendations → Backtested Validation → Execution

**Multi-market vision:** This architecture is designed to be market-agnostic. CSE is the first implementation, but the strategy engine, risk manager, and signal generator are parameterized by a Market Profile configuration. Adding NYSE, NASDAQ, NSE India, or any other exchange requires only a new Market Profile — not a new engine.

---

## 1.1 Market Profile Abstraction Layer

Every market-specific constraint is encapsulated in a `MarketProfile` configuration. The strategy engine never references "CSE" or "NYSE" directly — it reads capabilities from the active market profile.

```typescript
interface MarketProfile {
  // Identity
  exchange_code: string;           // 'CSE', 'NYSE', 'NASDAQ', 'NSE'
  exchange_name: string;
  currency: string;                // 'LKR', 'USD', 'INR'
  timezone: string;                // 'Asia/Colombo', 'America/New_York'
  
  // Trading capabilities
  capabilities: {
    short_selling: boolean;        // CSE: false, NYSE: true
    options_trading: boolean;      // CSE: false, NYSE: true
    futures_trading: boolean;      // CSE: false, NYSE: true
    pre_market: boolean;           // CSE: false, NYSE: true
    after_hours: boolean;          // CSE: false, NYSE: true
    margin_trading: boolean;       // CSE: limited, NYSE: true
    fractional_shares: boolean;    // CSE: false, some US brokers: true
  };
  
  // Market structure
  trading_hours: {
    open: string;                  // '09:30' (local time)
    close: string;                 // '14:30' (CSE) or '16:00' (NYSE)
    session_hours: number;         // 5 (CSE) or 6.5 (NYSE)
  };
  settlement_days: number;         // 2 (T+2 for CSE and most markets)
  
  // Cost structure
  costs: {
    brokerage_pct: number;         // 0.50% (CSE) or 0.01% (NYSE discount)
    exchange_fee_pct: number;      // 0.036% (CSE)
    clearing_fee_pct: number;      // 0.024% (CSE)
    tax_pct: number;               // 0.036% SEC levy (CSE) or 0% (most US)
    total_round_trip_pct: number;  // 1.12% (CSE) or ~0.1% (NYSE)
    min_commission: number;        // minimum fee per trade if applicable
  };
  dividend_withholding_tax_pct: number;  // 14% (CSE), 0-30% varies
  
  // Liquidity characteristics
  liquidity: {
    total_listed_stocks: number;   // 296 (CSE), ~6000 (NYSE)
    liquid_stocks: number;         // ~50 (CSE), ~3000 (NYSE)
    avg_daily_volume: number;      // in local currency
    typical_spread_pct: number;    // 0.5-2% (CSE), 0.01-0.1% (NYSE)
    slippage_model: 'high' | 'medium' | 'low';
    order_type_preference: 'limit_only' | 'limit_preferred' | 'market_ok';
  };
  
  // Compliance
  compliance: {
    shariah_screening_required: boolean;
    shariah_methodology: string;   // 'AAOIFI', 'DJIM', 'MSCI', 'custom'
    regulatory_body: string;       // 'SEC_SL', 'SEC_US', 'SEBI'
  };
  
  // Strategy eligibility — which strategy families work on this market
  eligible_strategy_families: StrategyFamily[];
  
  // Benchmark index
  benchmark_index: string;         // 'ASPI', 'S&P500', 'NIFTY50'
  benchmark_symbol: string;        // for data fetching
  
  // Data sources
  data_sources: {
    price_api: string;             // 'CSE_INTERNAL', 'YAHOO_FINANCE', 'ALPHA_VANTAGE'
    financial_api: string;         // 'CSE_SCRAPER', 'SEC_EDGAR', 'BSE_API'
    news_sources: string[];        // RSS feeds, news APIs
    macro_source: string;          // 'CBSL', 'FRED', 'RBI'
  };
}
```

**Pre-built Market Profiles:**

```typescript
const MARKET_PROFILES: Record<string, MarketProfile> = {
  CSE: {
    exchange_code: 'CSE',
    currency: 'LKR',
    capabilities: {
      short_selling: false,
      options_trading: false,
      futures_trading: false,
      pre_market: false,
      after_hours: false,
      margin_trading: false,
      fractional_shares: false,
    },
    costs: { total_round_trip_pct: 1.12 },
    liquidity: { 
      liquid_stocks: 50, 
      slippage_model: 'high',
      order_type_preference: 'limit_only' 
    },
    eligible_strategy_families: [
      'VALUE_CATALYST', 'RCA_DISCIPLINED', 'MEAN_REVERSION',
      'DIVIDEND_CAPTURE', 'SECTOR_ROTATION', 'MOMENTUM_BREAKOUT'
    ],
    benchmark_index: 'ASPI',
    // ... full config
  },

  NYSE: {
    exchange_code: 'NYSE',
    currency: 'USD',
    capabilities: {
      short_selling: true,
      options_trading: true,
      futures_trading: true,
      pre_market: true,
      after_hours: true,
      margin_trading: true,
      fractional_shares: false,
    },
    costs: { total_round_trip_pct: 0.10 },
    liquidity: { 
      liquid_stocks: 3000, 
      slippage_model: 'low',
      order_type_preference: 'market_ok' 
    },
    eligible_strategy_families: [
      'VALUE_CATALYST', 'RCA_DISCIPLINED', 'MEAN_REVERSION',
      'DIVIDEND_CAPTURE', 'SECTOR_ROTATION', 'MOMENTUM_BREAKOUT',
      // These are ONLY available on markets with full capabilities:
      'CTA_TREND_FOLLOWING', 'PAIRS_TRADING', 'STAT_ARB',
      'OPTIONS_INCOME', 'SHORT_SELLING', 'MARKET_NEUTRAL'
    ],
    benchmark_index: 'S&P 500',
    // ... full config
  },

  NSE: {
    exchange_code: 'NSE',
    currency: 'INR',
    capabilities: {
      short_selling: true,   // intraday only
      options_trading: true,  // F&O segment
      futures_trading: true,
      pre_market: true,
      after_hours: false,
      margin_trading: true,
      fractional_shares: false,
    },
    costs: { total_round_trip_pct: 0.30 },
    liquidity: { 
      liquid_stocks: 500, 
      slippage_model: 'medium',
      order_type_preference: 'limit_preferred' 
    },
    eligible_strategy_families: [
      'VALUE_CATALYST', 'RCA_DISCIPLINED', 'MEAN_REVERSION',
      'DIVIDEND_CAPTURE', 'SECTOR_ROTATION', 'MOMENTUM_BREAKOUT',
      'PAIRS_TRADING', 'OPTIONS_INCOME'
    ],
    benchmark_index: 'NIFTY 50',
    // ... full config
  },

  NASDAQ: {
    exchange_code: 'NASDAQ',
    currency: 'USD',
    // Similar to NYSE with tech-sector bias in strategy weighting
    eligible_strategy_families: [
      // All NYSE strategies plus:
      'GROWTH_MOMENTUM',  // NASDAQ-specific: tech growth stocks
    ],
    benchmark_index: 'NASDAQ Composite',
    // ... full config
  }
};
```

**How the strategy engine uses Market Profiles:**

```typescript
class StrategyEngine {
  private market: MarketProfile;

  constructor(exchangeCode: string) {
    this.market = MARKET_PROFILES[exchangeCode];
  }

  getAvailableStrategies(): Strategy[] {
    // Only return strategies that this market supports
    return ALL_STRATEGIES.filter(s => 
      this.market.eligible_strategy_families.includes(s.family)
    );
  }

  calculatePositionSize(signal: Signal): number {
    // Factor in market-specific costs
    const costAdjustedTarget = signal.target_return - this.market.costs.total_round_trip_pct;
    if (costAdjustedTarget <= 0) return 0; // trade not worth the friction
    
    // Use market-specific slippage model
    const slippageBuffer = this.market.liquidity.slippage_model === 'high' ? 0.02 : 0.005;
    // ... position sizing logic
  }

  shouldUseMarketOrder(): boolean {
    return this.market.liquidity.order_type_preference === 'market_ok';
  }
}
```

This means when you add NYSE support in Phase 7, you:
1. Create the NYSE Market Profile (config only, no code changes)
2. Add the NYSE data source adapter (Yahoo Finance API)
3. Register NYSE-specific strategies (CTA, pairs, options)
4. The strategy engine, signal generator, risk manager, and AI explainer all work automatically

No architectural changes. No refactoring. Just configuration.

---

## 2. Market-Specific Characteristics

### 2.1 CSE (Colombo Stock Exchange) — Current Implementation

Any strategy engine for the CSE must account for these realities:

| Constraint | Impact | Design Implication |
|-----------|--------|-------------------|
| 296 listed stocks, ~50 liquid | Small universe | Can't run broad-market quant screens |
| 5-hour trading window (9:30–14:30) | No intraday strategies | Daily timeframe minimum |
| No short selling | Can't profit from declines | Long-only strategies exclusively |
| No futures or options | Can't hedge | Must use position sizing for risk management |
| ~1.12% round-trip transaction cost | High friction | Must hold 20+ days for costs to be worthwhile |
| Thin order books | Slippage risk | Limit orders only, never market orders |
| T+2 settlement | Delayed execution | Can't do rapid rotation |
| ~40% of ASPI is banks/finance | Shariah constraint removes large-caps | Compliant universe is ~50–80 stocks |
| Retail-dominated market | Sentiment-driven moves | Mean reversion works better than momentum |
| Limited analyst coverage | Information asymmetry | Fundamental analysis has alpha potential |
| CEO insight: insider info doesn't surface | Hidden risk | Must factor in announcement risk |

---

## 3. Applicable Strategy Framework for CSE

Based on the constraints above, only certain strategy families are viable. Each is rated for CSE applicability.

### 3.1 Strategies That Work on CSE

**A. Value Investing with Catalyst Triggers (PRIMARY)**
- Buy undervalued Shariah-compliant stocks (low P/E, high dividend yield, below book value)
- Wait for catalysts: earnings announcements, CBSL rate decisions, infrastructure contracts
- Hold 3–12 months
- Exit on valuation normalization or negative catalyst
- CSE suitability: HIGH — information asymmetry means undervalued stocks exist and persist

**B. Rupee Cost Averaging / Systematic Investment (PRIMARY)**
- Fixed monthly investment (LKR 10K) into pre-selected quality stocks
- No timing decision — invest regardless of market level
- Rebalance quarterly by rotating into most underweight compliant stock
- CSE suitability: HIGH — removes emotion, works with thin liquidity, low transaction frequency

**C. Mean Reversion on Oversold Quality Stocks**
- When a quality Shariah-compliant stock drops >10% in a week without fundamental cause
- Buy the dip with defined position size
- Exit when price returns to 20-day SMA or after 30 days (whichever first)
- CSE suitability: MEDIUM-HIGH — retail-driven overselling creates reversion opportunities

**D. Dividend Capture with Shariah Filter**
- Buy stocks 10–15 days before ex-dividend date
- Hold through ex-date, collect dividend
- Sell 5–10 days after if price hasn't recovered the ex-div drop
- Apply purification calculation to dividend income
- CSE suitability: MEDIUM — CSE dividend yields (3–8%) are meaningful, but timing requires data

**E. Sector Rotation Based on Macro Regime**
- CBSL rate cut cycle → overweight rate-sensitive sectors (construction, property)
- Inflation rising → overweight exporters (TJL textiles, tea plantation)
- USD/LKR weakening → overweight USD-earning exporters
- Infrastructure spending announced → overweight construction (AEL)
- CSE suitability: MEDIUM — macro regime changes are slow and predictable on CSE

**F. Momentum Following on Breakout Stocks**
- When a stock breaks above 52-week high with above-average volume
- Buy with trailing stop at 10% below entry
- Ride the trend, exit on trailing stop hit
- CSE suitability: MEDIUM-LOW — thin liquidity means breakouts can be false signals

### 3.2 Strategies That DON'T Work on CSE (But Are Available on Other Markets)

These strategies are implemented in the strategy registry but only activate when the Market Profile supports them.

| Strategy | Required Capabilities | Available On | Description |
|---------|----------------------|-------------|-------------|
| CTA / Trend Following | `futures_trading: true` | NYSE, NASDAQ, NSE (F&O) | Follow medium-term trends using futures. Classic managed futures approach. |
| Pairs Trading / Stat Arb | `liquid_stocks > 200`, `short_selling: true` | NYSE, NASDAQ | Trade correlated pairs (long underperformer, short outperformer). Needs deep liquidity. |
| Options Income (Covered Calls, Cash-Secured Puts) | `options_trading: true` | NYSE, NASDAQ, NSE (F&O) | Generate income by selling options against existing positions. |
| Long/Short Market Neutral | `short_selling: true` | NYSE, NASDAQ | Long undervalued + short overvalued. Zero net market exposure. |
| Growth Momentum | `liquid_stocks > 500` | NASDAQ primarily | Buy stocks with accelerating revenue/earnings growth + price momentum. |
| Intraday Mean Reversion | `session_hours >= 6`, `slippage_model: low` | NYSE, NASDAQ | Buy morning dips, sell afternoon recovery. Requires low transaction costs. |
| Short Selling | `short_selling: true` | NYSE, NASDAQ, NSE (intraday) | Profit from declining stocks. Requires borrowing shares. |

**Implementation note:** Each strategy is defined once in the strategy registry. The Market Profile's `eligible_strategy_families` array acts as a whitelist. When you deploy on NYSE, you don't write new strategy code — you enable existing strategies via the profile config.

---

## 4. Strategy Engine Architecture

### 4.1 Component Design

```
┌─────────────────────────────────────────────────────────────────┐
│                    STRATEGY ENGINE                               │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Market Regime │  │  Strategy    │  │ Signal Generator     │  │
│  │ Detector      │→│  Selector    │→│ (Entry/Exit Rules)    │  │
│  └──────────────┘  └──────────────┘  └──────────┬───────────┘  │
│                                                   │              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────▼───────────┐  │
│  │ Risk Manager │←│  Position     │←│ Signal Ranker         │  │
│  │ (Sizing/SL)  │  │  Sizer       │  │ (Score × Confidence)  │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Backtester — validates strategies against historical data │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Portfolio Tier Engine — personalizes by investor profile   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Market Regime Detector

Classifies current market conditions to select appropriate strategies.

**Regimes:**

| Regime | Detection Rules | Active Strategies |
|--------|----------------|-------------------|
| TRENDING_UP | ASPI > SMA50, ASPI > SMA20, breadth > 60% advancing | Momentum, Sector Rotation |
| TRENDING_DOWN | ASPI < SMA50, ASPI < SMA20, breadth > 60% declining | Defensive (hold cash, dividend stocks) |
| RANGING | ASPI between SMA20 and SMA50, ATR declining | Mean Reversion, Value, RCA |
| HIGH_VOLATILITY | ATR(14) > 2x ATR(50), multiple >2% daily moves | Reduce position sizes, widen stops |
| RECOVERY | ASPI crossed above SMA50 from below within 10 days | Value + Momentum combination |
| CRISIS | ASPI drops >15% from 52w high, foreign net selling >1Bn/week | Cash preservation, pause buying |

**Data required:**
- ASPI daily close (have it)
- SMA(20), SMA(50) of ASPI (need 50 days of data)
- Market breadth: advancing vs declining stocks (have it from CSE API)
- ATR(14) and ATR(50) of ASPI
- Foreign net buying data (have it in macro_data)

### 4.3 Strategy Selector

Given the current market regime and user's portfolio tier, selects the optimal strategy or strategy combination.

```typescript
interface StrategyConfig {
  name: string;
  applicableRegimes: MarketRegime[];
  applicableTiers: PortfolioTier[];
  minDataDays: number;          // minimum historical data needed
  entryRules: EntryRule[];       // conditions that must ALL be true to buy
  exitRules: ExitRule[];         // conditions where ANY triggers a sell
  positionSizeMethod: 'fixed_amount' | 'pct_portfolio' | 'kelly' | 'atr_based';
  maxPositionPct: number;        // max % of portfolio in one stock
  minHoldDays: number;           // minimum holding period (for cost efficiency)
  shariahRequired: boolean;      // always true for this product
  backtestRequired: boolean;     // must have passing backtest to go live
}
```

**Strategy Registry (initial):**

```
STRATEGIES = {
  'value_catalyst': {
    applicableRegimes: [RANGING, RECOVERY, TRENDING_UP],
    applicableTiers: [INTERMEDIATE, ADVANCED, INSTITUTIONAL],
    minDataDays: 60,
    entryRules: [
      { indicator: 'pe_ratio', condition: 'BELOW', value: 12 },
      { indicator: 'dividend_yield', condition: 'ABOVE', value: 3.0 },
      { indicator: 'shariah_status', condition: 'EQUALS', value: 'COMPLIANT' },
      { indicator: 'has_upcoming_catalyst', condition: 'EQUALS', value: true }
    ],
    exitRules: [
      { indicator: 'pe_ratio', condition: 'ABOVE', value: 18, label: 'valuation_target' },
      { indicator: 'hold_days', condition: 'ABOVE', value: 180, label: 'time_exit' },
      { indicator: 'loss_pct', condition: 'BELOW', value: -15, label: 'stop_loss' },
      { indicator: 'shariah_status', condition: 'NOT_EQUALS', value: 'COMPLIANT', label: 'shariah_exit' }
    ]
  },

  'rca_disciplined': {
    applicableRegimes: [ALL],  // works in any regime
    applicableTiers: [BEGINNER, INTERMEDIATE],
    minDataDays: 0,  // no historical data needed
    entryRules: [
      { indicator: 'day_of_month', condition: 'BETWEEN', value: [1, 3] },
      { indicator: 'monthly_budget_available', condition: 'EQUALS', value: true },
      { indicator: 'shariah_status', condition: 'EQUALS', value: 'COMPLIANT' }
    ],
    exitRules: [
      { indicator: 'shariah_status', condition: 'NOT_EQUALS', value: 'COMPLIANT', label: 'shariah_exit' }
      // RCA doesn't sell — hold forever unless Shariah violation
    ]
  },

  'mean_reversion_oversold': {
    applicableRegimes: [RANGING, TRENDING_UP],
    applicableTiers: [INTERMEDIATE, ADVANCED],
    minDataDays: 20,
    entryRules: [
      { indicator: 'rsi_14', condition: 'BELOW', value: 30 },
      { indicator: 'price_vs_sma20', condition: 'BELOW_PCT', value: -8 },
      { indicator: 'shariah_status', condition: 'EQUALS', value: 'COMPLIANT' },
      { indicator: 'no_negative_announcement_7d', condition: 'EQUALS', value: true }
    ],
    exitRules: [
      { indicator: 'price_vs_sma20', condition: 'ABOVE_PCT', value: 0, label: 'mean_reversion_target' },
      { indicator: 'hold_days', condition: 'ABOVE', value: 30, label: 'time_exit' },
      { indicator: 'loss_pct', condition: 'BELOW', value: -12, label: 'stop_loss' }
    ]
  },

  'dividend_capture': {
    applicableRegimes: [RANGING, TRENDING_UP, RECOVERY],
    applicableTiers: [INTERMEDIATE, ADVANCED],
    minDataDays: 30,
    entryRules: [
      { indicator: 'days_to_ex_dividend', condition: 'BETWEEN', value: [10, 15] },
      { indicator: 'dividend_yield', condition: 'ABOVE', value: 4.0 },
      { indicator: 'shariah_status', condition: 'EQUALS', value: 'COMPLIANT' }
    ],
    exitRules: [
      { indicator: 'days_since_ex_dividend', condition: 'ABOVE', value: 10, label: 'post_div_exit' },
      { indicator: 'loss_pct', condition: 'BELOW', value: -8, label: 'stop_loss' }
    ]
  },

  'sector_rotation_macro': {
    applicableRegimes: [RECOVERY, TRENDING_UP],
    applicableTiers: [ADVANCED, INSTITUTIONAL],
    minDataDays: 60,
    entryRules: [
      { indicator: 'sector_macro_alignment', condition: 'EQUALS', value: 'FAVORABLE' },
      { indicator: 'sector_relative_strength', condition: 'ABOVE', value: 0 },
      { indicator: 'shariah_status', condition: 'EQUALS', value: 'COMPLIANT' }
    ],
    exitRules: [
      { indicator: 'sector_macro_alignment', condition: 'EQUALS', value: 'UNFAVORABLE', label: 'macro_shift' },
      { indicator: 'loss_pct', condition: 'BELOW', value: -10, label: 'stop_loss' }
    ]
  }
}
```

### 4.4 Signal Generator

Evaluates entry/exit rules for each strategy against current market data and generates actionable signals.

```typescript
interface Signal {
  id: string;
  stock_symbol: string;
  strategy_name: string;
  direction: 'BUY' | 'SELL' | 'HOLD';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  score: number;                    // 0-100 composite
  entry_price: number;              // suggested entry
  stop_loss: number;                // calculated stop
  take_profit: number;              // calculated target
  position_size_pct: number;        // % of portfolio
  position_size_shares: number;     // absolute shares
  reasoning: string;                // human-readable explanation
  rules_triggered: string[];        // which entry rules matched
  market_regime: MarketRegime;
  shariah_status: string;
  expires_at: Date;                 // signal validity window
  data_confidence: number;          // 0-1, based on data availability
}
```

**Confidence scoring:**
- HIGH: All indicators have 20+ days of data, financial data available, strategy backtested >60% win rate
- MEDIUM: Most indicators available, some data gaps, strategy backtested >50% win rate
- LOW: Limited data (<20 days), no backtest, or placeholder scores

### 4.5 Risk Manager

**Position Sizing Methods:**

| Method | Formula | When to Use |
|--------|---------|-------------|
| Fixed Amount | Budget ÷ Price = Shares | Beginner tier (RCA) |
| Percentage of Portfolio | Portfolio × Max% ÷ Price | Intermediate |
| ATR-Based | (Portfolio × Risk%) ÷ (ATR × 2) | Advanced |
| Kelly Criterion | Edge × (1/Odds) | Institutional (needs win rate data) |

**Risk Rules (parameterized by Market Profile):**
1. No single stock > `market.max_single_position_pct` (CSE: 40%, NYSE: 25%)
2. No single trade risks > `market.max_trade_risk_pct` (CSE: 2%, NYSE: 1%)
3. Portfolio heat < `market.max_portfolio_heat_pct` (CSE: 20%, NYSE: 15%)
4. All positions must pass compliance filter (Shariah if `compliance.shariah_screening_required`)
5. Stop-loss on every position (method varies by market liquidity profile)
6. If benchmark drops > `market.circuit_breaker_pct` in a week, halt new buys for N days
7. If a stock drops > `market.position_stop_buying_pct` from entry, stop buying (reallocate)
8. Minimum hold period: `market.costs.total_round_trip_pct / expected_annual_return * 365` days (ensures cost-worthiness)

**Market-specific risk adjustments:**
- CSE: Wider stops (2x ATR) due to thin liquidity. Limit orders only. No hedging.
- NYSE: Tighter stops (1.5x ATR), market orders acceptable for liquid stocks. Can hedge with options/futures.
- NSE: Medium stops, limit preferred. F&O hedging available for top 200 stocks.

### 4.6 Portfolio Tier Engine

| Tier | Capital Range | Strategy Mix | Signal Frequency | Risk Budget |
|------|-------------|-------------|-----------------|------------|
| Beginner | <LKR 100K | 100% RCA | Monthly (1st–3rd of month) | 0% active risk |
| Intermediate | 100K–1M | 60% RCA + 30% Value + 10% Mean Reversion | Weekly | 5% active risk |
| Advanced | 1M–10M | 30% RCA + 30% Value + 20% Sector Rotation + 20% Mean Reversion | Daily | 10% active risk |
| Institutional | 10M+ | Custom allocation across all strategies | Real-time during market hours | 15% active risk |

**Beginner tier specifics:**
- Simple Mode is the default UI
- Only sees "What to buy this month" (one stock from RCA schedule)
- No technical indicators, no charts, no jargon
- AI explains everything in plain language
- Goal: build investing habit, not make trading decisions

**Institutional tier specifics:**
- Full Pro Mode with all indicators
- Custom strategy weighting via settings
- Backtester access to test custom parameter combinations
- Direct ATrad execution (with approval flow)
- Multi-account support (manages multiple portfolios)

---

## 5. Backtesting Framework

Every strategy must be backtested before generating live signals.

### 5.1 Backtest Requirements

```typescript
interface BacktestConfig {
  strategy: StrategyConfig;
  start_date: Date;
  end_date: Date;
  initial_capital: number;
  transaction_cost_pct: number;  // 1.12% for CSE
  slippage_model: 'fixed_pct' | 'volume_adjusted';
  shariah_filter: boolean;
  benchmark: 'ASPI' | 'WHITELIST_INDEX';
}

interface BacktestResult {
  total_return_pct: number;
  annualized_return_pct: number;
  benchmark_return_pct: number;
  alpha: number;                    // excess return over benchmark
  sharpe_ratio: number;
  max_drawdown_pct: number;
  win_rate_pct: number;
  avg_win_pct: number;
  avg_loss_pct: number;
  profit_factor: number;            // gross profit / gross loss
  total_trades: number;
  avg_hold_days: number;
  total_fees_paid: number;
  is_valid: boolean;                // passes minimum criteria
}
```

**Minimum criteria to activate a strategy:**
- Win rate > 50% (net of fees)
- Sharpe ratio > 0.5
- Max drawdown < 25%
- Alpha > 0% (beats benchmark)
- Minimum 20 trades in backtest period
- Profit factor > 1.2

### 5.2 Data Requirements for Backtesting

| Data | Minimum Period | Source | Status |
|------|---------------|--------|--------|
| Daily OHLCV prices | 1 year (250 trading days) | CSE API accumulation | 8 days (need 242 more) |
| Company financials | 4 quarters | CSE scraper / manual import | 0 quarters |
| Shariah status history | 1 year | Almas Whitelist archives | Current only |
| CBSL macro data | 2 years | CBSL website / manual | Current point-in-time only |
| Dividend history | 3 years | CSE announcements | Partial |
| ASPI daily close | 1 year | CSE API accumulation | 8 days |

**Reality check:** Full backtesting requires ~1 year of accumulated data. With the current 8-day dataset, meaningful backtesting starts around March 2027 if we accumulate from scratch. However, if we can scrape historical ASPI data from TradingView or another source, we could backtest ASPI-level strategies (regime detection, sector rotation) much sooner.

---

## 6. AI Enhancement Layer

### 6.1 Current AI Role (Text Summarizer)

The AI currently receives market data as context and generates text analysis. It doesn't make decisions.

### 6.2 Future AI Role (Strategy Advisor)

```
Phase 1 (Current): Data → Claude API → Text summary
Phase 2 (Next):    Data → Strategy Engine → Signals → Claude API → Explained recommendations
Phase 3 (Future):  Data → Strategy Engine → Signals → Claude API → Personalized advice per tier
Phase 4 (Advanced): Data → Strategy Engine + RL Agent → Optimized signals → Claude API → Full advisory
```

**Phase 2 prompt engineering:**

Instead of asking Claude "analyze the market," we give it structured signals and ask it to explain them:

```
You are the AI advisor for a Shariah-compliant investment platform.

CURRENT MARKET REGIME: RECOVERY
ACTIVE STRATEGIES: value_catalyst, rca_disciplined

SIGNALS GENERATED TODAY:
1. BUY AEL.N0000 via value_catalyst strategy
   - P/E: 8.2 (below threshold 12) ✓
   - Dividend yield: 5.2% (above threshold 3%) ✓
   - Catalyst: CBSL rate decision Mar 25 (infrastructure beneficiary)
   - Suggested entry: LKR 66.50, Stop: LKR 59.85, Target: LKR 79.80
   - Position size: 8% of portfolio

2. HOLD TJL.N0000 via rca_disciplined strategy
   - Next RCA purchase: April 1
   - Current price: LKR 31.00
   
USER PORTFOLIO TIER: Beginner (<LKR 100K)

Explain these signals in plain, jargon-free language suitable for 
someone who doesn't know what P/E or ATR means. Focus on:
1. What to do and why
2. How much to spend
3. What risks to watch for
4. How this fits their long-term RCA strategy
```

This transforms the AI from a market summarizer into a strategy explainer — the strategy engine does the analysis, the AI makes it human-readable.

### 6.3 Context Engineering Principles

| Principle | Implementation |
|-----------|---------------|
| Always show reasoning | Every signal includes which rules triggered and why |
| Never predict prices | "The strategy suggests buying because P/E is low" not "The price will go up" |
| Acknowledge uncertainty | "Based on 8 days of data, confidence is LOW" |
| Personalize by tier | Beginner gets "buy LKR 10K of AEL this month," Advanced gets "RSI oversold with support confluence" |
| Educational framing | Every recommendation teaches something: "P/E of 8.2 means you're paying 8.2 years of earnings for the stock — that's cheap historically" |
| Shariah-first | Non-compliant stocks never appear in any recommendation |
| Disclaimer always | "Educational context only, not financial advice" on every output |

---

## 7. CSE Data Scraper Pipeline

### 7.1 Data Sources Available

| Source | URL | Auth Required | Data Available | Priority |
|--------|-----|--------------|---------------|----------|
| CSE API (reverse-engineered) | cse.lk/api/ | No | Real-time prices, trades, announcements | ✅ Active |
| CSE Company Profile Pages | cse.lk/pages/company-profile/ | Login (cookies) | Financial summaries, reports, key metrics | HIGH — needs Playwright |
| CSE Market Capitalization Page | cse.lk/listed-entities/market-capitalization | No | All stocks market cap | HIGH |
| CSE Listed Company Directory | cse.lk/listed-entities/listed-company-directory | No | Company details, sectors, GICS | MEDIUM |
| CSE Announcements (PDF) | cse.lk/cmt/upload_report_file/ | Auth wall | Quarterly financials as PDF | MEDIUM — auth needed |
| ATrad (brokerage) | online.hnb.lk/atrad/ | ATrad credentials | Portfolio, holdings, order execution | ✅ Active (read-only) |
| Almas Equities | insights.almasequities.com | Portal access | Shariah whitelist, financial ratios | FUTURE — needs account |
| CBSL | cbsl.gov.lk | No | Macro indicators (Excel downloads) | LOW — manual import |
| TradingView | tradingview.com/symbols/CSELK-* | No (public) | Historical charts, community analysis | MEDIUM — for backfill |

### 7.2 CSE Website Scraper Architecture

**Prerequisite:** Before building the scraper, we need reconnaissance of the CSE company profile pages. Screenshots needed of:
1. AEL.N0000 company profile — what tabs exist?
2. Any "Financials" or "Financial Statements" tab
3. The Market Capitalization page structure
4. What's visible when logged in vs not logged in

**Scraper Implementation Plan:**

```
Phase 1: Reconnaissance (1 session)
├── Navigate to cse.lk company profile for AEL, TJL, TKYO
├── Screenshot all visible tabs/sections
├── Dump HTML of financial data sections
├── Identify available data fields
└── Map fields to company_financials table columns

Phase 2: Scraper Build (1 session)
├── Create src/backend/src/scripts/cse-website-scraper.ts
├── Login to CSE if additional data visible when authenticated
├── For each compliant stock: extract available financial data
├── Store in company_financials table
├── Schedule as weekly cron (Saturday morning)
└── Add to admin page: "Scrape CSE Website" button

Phase 3: PDF Extraction (future, if needed)
├── Download quarterly report PDFs from announcements
├── Extract tables using pdf-parse or pdfplumber
├── Parse financial statements into structured data
└── Validate extracted numbers against known figures
```

### 7.3 CSE Account Credentials

The `.env` file needs these new variables (user adds manually — Claude Code never touches .env):

```
# CSE Website (for company profile scraping)
CSE_USERNAME=atheequeliyas23@gmail.com
CSE_PASSWORD=<user_sets_this>

# ATrad (already exists)
ATRAD_USERNAME=<exists>
ATRAD_PASSWORD=<exists>
```

---

## 8. Implementation Roadmap

### Phase 6A: Data Foundation (Weeks 1–2)
- [ ] CSE website reconnaissance (screenshots of company profiles)
- [ ] Build CSE website scraper for financial data
- [ ] Import financial data for 11 compliant stocks
- [ ] Validate financial data against multiple sources
- [ ] Continue daily price accumulation (goal: 20 days by April 9)
- [ ] Backfill ASPI historical data from TradingView if possible

### Phase 6B: Strategy Engine Core (Weeks 3–4)
- [ ] Implement Market Regime Detector
- [ ] Implement Strategy Registry with 5 initial strategies
- [ ] Implement Signal Generator with entry/exit rule evaluation
- [ ] Implement Risk Manager with position sizing
- [ ] Wire signals into the existing Signals page (replace placeholder scores)
- [ ] Add strategy name and reasoning to each signal

### Phase 6C: Portfolio Tiers (Week 5)
- [ ] Add portfolio tier detection based on total portfolio value
- [ ] Customize Simple Mode dashboard per tier
- [ ] Customize signal frequency and complexity per tier
- [ ] Add tier-appropriate investment goals

### Phase 6D: Backtesting (Weeks 6–8, ongoing)
- [ ] Build backtest runner for each strategy
- [ ] Requires 20+ days of data minimum (available ~April 9)
- [ ] Validate strategies against accumulated data
- [ ] Only activate strategies that pass minimum criteria
- [ ] Display backtest results on Strategy Performance page

### Phase 6E: AI Context Engineering (Weeks 4–6, parallel)
- [ ] Restructure Claude API prompts to receive strategy signals as input
- [ ] Implement tier-specific prompt templates
- [ ] Add reasoning transparency (show which rules triggered)
- [ ] Implement the "strategy explainer" AI role
- [ ] Test with real signals once strategy engine produces them

### Phase 6F: ATrad Execution Testing (Week 6+, after April 9)
- [ ] Place 2–3 safe limit orders (below market, won't fill)
- [ ] Verify full Playwright → ATrad → CSE order flow
- [ ] Test order cancellation
- [ ] Test order modification
- [ ] Only after all tests pass: enable for real orders

---

## 10. Multi-Market Expansion Roadmap

### 10.1 Adding a New Market (What's Needed)

When expanding to NYSE, NASDAQ, or NSE, the following components need to be created per market. The strategy engine, risk manager, signal generator, backtester, and AI layer work unchanged.

| Component | Effort | Description |
|-----------|--------|-------------|
| Market Profile config | 1 hour | Fill in the MarketProfile interface with exchange-specific parameters |
| Data Source Adapter | 1–2 days | Connect to market's price API (Yahoo Finance for US, BSE API for India) |
| Broker Integration | 1–2 weeks | Playwright or API adapter for the market's brokerage (equivalent of ATrad for CSE) |
| Shariah Screening Source | 1 day | Connect to DJIM (Dow Jones Islamic Market) for US, or local Shariah board for other markets |
| Macro Data Source | 1 day | FRED API for US, RBI for India (equivalent of CBSL for CSE) |
| Compliance Rules | 2–3 days | Market-specific regulatory requirements (pattern day trader rules for US, etc.) |
| Backtest Data | Varies | Historical price data — US markets have decades of free data, unlike CSE |

### 10.2 Planned Expansion Sequence

```
Phase 7:  NSE India      — CEO's directive, large Shariah-compliant market
Phase 8:  NYSE/NASDAQ     — Largest market, most strategy families available
Phase 9:  Crypto (Shariah) — BTC, ETH with Shariah screening (separate architecture)
Phase 10: GCC markets     — Dubai (DFM), Saudi (Tadawul) — natural Shariah markets
```

### 10.3 What Stays the Same Across Markets

| Component | Multi-Market Behavior |
|-----------|----------------------|
| Strategy Engine | Reads Market Profile, filters eligible strategies automatically |
| Signal Generator | Same entry/exit rule evaluation — indicators are universal |
| Risk Manager | Position sizing adapts to market cost structure |
| Backtester | Same engine, different data source per market |
| AI Explainer | Same prompt templates — just swap market-specific terms |
| Portfolio Tiers | Universal tier system — capital thresholds adjust by currency |
| Shariah Compliance | Always-on filter — methodology may differ per market (AAOIFI vs DJIM) |
| UI/Dashboard | Same frontend — market selector in header, everything else adapts |

### 10.4 What Changes Per Market

| Component | Per-Market Customization |
|-----------|-------------------------|
| Data pipeline | Different API for each exchange |
| Broker integration | Different Playwright/API per brokerage |
| Macro data | Different central bank / economic data source |
| News feeds | Different RSS sources, different language support |
| Trading hours cron | Different timezone, different market hours |
| Compliance rules | Different regulatory requirements |
| Currency | All values in local currency with cross-rate display |

---

## 11. What This Means for the Product

**Before Strategy Engine:** Dashboard shows indicators + AI text summaries. User must interpret everything themselves. Signals are generic "Hold / LOW confidence."

**After Strategy Engine:** Dashboard shows specific, actionable signals with entry/exit/sizing. AI explains why in tier-appropriate language. Signals have real confidence based on backtested strategy performance. Risk management is integrated into every recommendation.

**When expanding to new markets:** Add a Market Profile config + data adapter. The entire strategy engine, AI layer, and UI work automatically. No architectural changes needed.

**The key insight:** The AI doesn't pick strategies — the strategy engine does. The AI explains the strategy engine's decisions in human language. This separation means the strategies are testable, backtestable, and transparent. The AI adds the communication layer, not the decision layer.

This is what makes it a product, not a gimmick.

---

⚠️ `.env` must NEVER be touched or modified ⚠️  
*This document is for educational purposes only. Not financial advice.*
