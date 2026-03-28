// ---------------------------------------------------------------------------
// Strategy Registry — pure TypeScript config, no NestJS dependencies
// ---------------------------------------------------------------------------
//
// The strategy engine evaluates these deterministic rules against real market
// data and generates signals. Claude then EXPLAINS those signals. Claude does
// NOT pick strategies or make trading decisions.
//
// Each strategy is market-agnostic: the MarketProfile (CSE vs NYSE) controls
// which strategies activate based on exchange capabilities.
// ---------------------------------------------------------------------------

export type MarketRegimeType =
  | 'TRENDING_UP'
  | 'TRENDING_DOWN'
  | 'RANGING'
  | 'HIGH_VOLATILITY'
  | 'RECOVERY'
  | 'CRISIS';

export type PortfolioTier =
  | 'BEGINNER'
  | 'INTERMEDIATE'
  | 'ADVANCED'
  | 'INSTITUTIONAL';

export interface EntryRule {
  indicator: string;
  condition:
    | 'ABOVE'
    | 'BELOW'
    | 'BETWEEN'
    | 'EQUALS'
    | 'NOT_EQUALS'
    | 'ABOVE_PCT'
    | 'BELOW_PCT';
  value: number | string | boolean | [number, number];
  label?: string;
}

export interface ExitRule {
  indicator: string;
  condition:
    | 'ABOVE'
    | 'BELOW'
    | 'BETWEEN'
    | 'EQUALS'
    | 'NOT_EQUALS'
    | 'ABOVE_PCT'
    | 'BELOW_PCT';
  value: number | string | boolean | [number, number];
  label: string; // required on exits — names the reason
}

export interface StrategyConfig {
  id: string;
  name: string;
  description: string;
  applicableRegimes: MarketRegimeType[] | 'ALL';
  applicableTiers: PortfolioTier[];
  minDataDays: number;
  entryRules: EntryRule[];
  exitRules: ExitRule[];
  positionSizeMethod: 'fixed_amount' | 'pct_portfolio' | 'atr_based';
  maxPositionPct: number;
  minHoldDays: number;
  fixedAmountLkr?: number; // only used by fixed_amount method
}

// ---------------------------------------------------------------------------
// CSE-applicable strategy registry (5 strategies)
// ---------------------------------------------------------------------------

export const STRATEGY_REGISTRY: StrategyConfig[] = [
  // -------------------------------------------------------------------------
  // 1. VALUE_CATALYST — buy undervalued stocks near a catalyst
  // -------------------------------------------------------------------------
  {
    id: 'VALUE_CATALYST',
    name: 'Value + Catalyst',
    description:
      'Buy Shariah-compliant stocks trading below fair value (P/E < 15) with meaningful dividend yield and an upcoming catalyst (announcement, CBSL decision). Hold 3–12 months for valuation normalization.',
    applicableRegimes: ['RANGING', 'RECOVERY', 'TRENDING_UP'],
    applicableTiers: ['INTERMEDIATE', 'ADVANCED', 'INSTITUTIONAL'],
    minDataDays: 60,
    entryRules: [
      {
        indicator: 'pe_ratio',
        condition: 'BELOW',
        value: 15,
        label: 'Undervalued — P/E below 15',
      },
      {
        indicator: 'dividend_yield',
        condition: 'ABOVE',
        value: 2.0,
        label: 'Dividend yield above 2%',
      },
      {
        indicator: 'has_upcoming_catalyst',
        condition: 'EQUALS',
        value: true,
        label: 'Upcoming catalyst present',
      },
    ],
    exitRules: [
      {
        indicator: 'pe_ratio',
        condition: 'ABOVE',
        value: 18,
        label: 'valuation_target',
      },
      {
        indicator: 'hold_days',
        condition: 'ABOVE',
        value: 180,
        label: 'time_exit',
      },
      {
        indicator: 'loss_pct',
        condition: 'BELOW',
        value: -15,
        label: 'stop_loss',
      },
      {
        indicator: 'shariah_status',
        condition: 'NOT_EQUALS',
        value: 'compliant',
        label: 'shariah_exit',
      },
    ],
    positionSizeMethod: 'pct_portfolio',
    maxPositionPct: 10,
    minHoldDays: 20,
  },

  // -------------------------------------------------------------------------
  // 2. RCA_DISCIPLINED — systematic monthly investing regardless of market level
  // -------------------------------------------------------------------------
  {
    id: 'RCA_DISCIPLINED',
    name: 'Rupee Cost Averaging',
    description:
      'Invest LKR 10,000 on days 1–3 of each month into the highest-scoring compliant stock. No market timing — buy consistently to average cost over cycles. Works in any regime.',
    applicableRegimes: 'ALL',
    applicableTiers: ['BEGINNER', 'INTERMEDIATE'],
    minDataDays: 0,
    entryRules: [
      {
        indicator: 'day_of_month',
        condition: 'BETWEEN',
        value: [1, 3],
        label: 'First 3 days of the month',
      },
      {
        indicator: 'monthly_budget_available',
        condition: 'EQUALS',
        value: true,
        label: 'Monthly LKR 10,000 budget available',
      },
    ],
    exitRules: [
      {
        indicator: 'shariah_status',
        condition: 'NOT_EQUALS',
        value: 'compliant',
        label: 'shariah_exit',
      },
    ],
    positionSizeMethod: 'fixed_amount',
    fixedAmountLkr: 10000,
    maxPositionPct: 100, // no cap — it's a fixed monthly amount
    minHoldDays: 0,
  },

  // -------------------------------------------------------------------------
  // 3. MEAN_REVERSION — buy oversold quality stocks without fundamental cause
  // -------------------------------------------------------------------------
  {
    id: 'MEAN_REVERSION',
    name: 'Mean Reversion',
    description:
      'Buy quality Shariah-compliant stocks that have sold off >8% below their 20-day average with RSI below 30 — without any negative announcement. Target: price returns to SMA20 within 30 days.',
    applicableRegimes: ['RANGING', 'TRENDING_UP'],
    applicableTiers: ['INTERMEDIATE', 'ADVANCED'],
    minDataDays: 20,
    entryRules: [
      {
        indicator: 'rsi_14',
        condition: 'BELOW',
        value: 30,
        label: 'RSI oversold — below 30',
      },
      {
        indicator: 'price_vs_sma20',
        condition: 'BELOW_PCT',
        value: -8,
        label: 'Price >8% below 20-day average',
      },
      {
        indicator: 'no_negative_announcement_7d',
        condition: 'EQUALS',
        value: true,
        label: 'No negative news in past 7 days',
      },
    ],
    exitRules: [
      {
        indicator: 'price_vs_sma20',
        condition: 'ABOVE_PCT',
        value: 0,
        label: 'mean_reversion_target',
      },
      {
        indicator: 'hold_days',
        condition: 'ABOVE',
        value: 30,
        label: 'time_exit',
      },
      {
        indicator: 'loss_pct',
        condition: 'BELOW',
        value: -12,
        label: 'stop_loss',
      },
    ],
    positionSizeMethod: 'atr_based',
    maxPositionPct: 8,
    minHoldDays: 5,
  },

  // -------------------------------------------------------------------------
  // 4. DIVIDEND_CAPTURE — buy before ex-date, collect dividend, exit after
  // -------------------------------------------------------------------------
  {
    id: 'DIVIDEND_CAPTURE',
    name: 'Dividend Capture',
    description:
      'Buy 10–15 days before ex-dividend date for stocks yielding >4%. Collect the dividend, then exit within 10 days after ex-date once the price recovers the drop. Apply purification to non-halal dividend portion.',
    applicableRegimes: ['RANGING', 'TRENDING_UP', 'RECOVERY'],
    applicableTiers: ['INTERMEDIATE', 'ADVANCED'],
    minDataDays: 30,
    entryRules: [
      {
        indicator: 'days_to_ex_dividend',
        condition: 'BETWEEN',
        value: [10, 15],
        label: '10–15 days to ex-dividend date',
      },
      {
        indicator: 'dividend_yield',
        condition: 'ABOVE',
        value: 4.0,
        label: 'Dividend yield above 4%',
      },
    ],
    exitRules: [
      {
        indicator: 'days_since_ex_dividend',
        condition: 'ABOVE',
        value: 10,
        label: 'post_div_exit',
      },
      {
        indicator: 'loss_pct',
        condition: 'BELOW',
        value: -8,
        label: 'stop_loss',
      },
    ],
    positionSizeMethod: 'pct_portfolio',
    maxPositionPct: 10,
    minHoldDays: 10,
  },

  // -------------------------------------------------------------------------
  // 5. SECTOR_ROTATION — rotate into sectors favored by macro regime
  // -------------------------------------------------------------------------
  {
    id: 'SECTOR_ROTATION',
    name: 'Sector Rotation',
    description:
      'Rotate into sectors that benefit from the current macro regime: rate cuts → construction/property, weak LKR → exporters/textiles, high inflation → consumer staples. Exit when macro alignment shifts.',
    applicableRegimes: ['RECOVERY', 'TRENDING_UP'],
    applicableTiers: ['ADVANCED', 'INSTITUTIONAL'],
    minDataDays: 60,
    entryRules: [
      {
        indicator: 'sector_macro_alignment',
        condition: 'EQUALS',
        value: 'FAVORABLE',
        label: 'Macro regime favors this sector',
      },
      {
        indicator: 'sector_relative_strength',
        condition: 'ABOVE',
        value: 0,
        label: 'Sector outperforming the broader market',
      },
    ],
    exitRules: [
      {
        indicator: 'sector_macro_alignment',
        condition: 'EQUALS',
        value: 'UNFAVORABLE',
        label: 'macro_shift',
      },
      {
        indicator: 'loss_pct',
        condition: 'BELOW',
        value: -10,
        label: 'stop_loss',
      },
    ],
    positionSizeMethod: 'pct_portfolio',
    maxPositionPct: 12,
    minHoldDays: 30,
  },
];

// ---------------------------------------------------------------------------
// Priority order for display (when multiple strategies apply)
// ---------------------------------------------------------------------------
export const STRATEGY_PRIORITY: Record<string, number> = {
  VALUE_CATALYST: 1,
  MEAN_REVERSION: 2,
  DIVIDEND_CAPTURE: 3,
  SECTOR_ROTATION: 4,
  RCA_DISCIPLINED: 5,
};
