import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  timeout: 60000,
});

export interface Stock {
  id: number;
  symbol: string;
  name: string;
  sector: string | null;
  market_cap: number | null;
  last_price: number | null;
  change_percent: number | null;
  shariah_status: string;
  is_active: boolean;
  beta?: number | null;
}

export interface MarketSummary {
  aspi_value: number;
  aspi_change: number;
  aspi_change_percent: number;
  sp_sl20_value: number;
  sp_sl20_change: number;
  sp_sl20_change_percent: number;
  total_volume: number;
  total_turnover: number;
  total_trades: number;
  market_cap: number;
}

export interface StockPrice {
  trade_date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
}

export interface TopStock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercentage: number;
  volume: number;
  turnover: number;
}

export interface SectorIndex {
  name: string;
  indexValue: number;
  change: number;
  percentage: number;
}

export interface Announcement {
  id: number;
  type: string;
  title: string;
  content: string | null;
  category: string | null;
  symbol: string | null;
  url: string | null;
  announced_at: string;
}

export const marketApi = {
  getSummary: () => api.get<MarketSummary>('/market/summary'),
  getIndices: () => api.get('/market/indices'),
  getGainers: () => api.get<TopStock[]>('/market/gainers'),
  getLosers: () => api.get<TopStock[]>('/market/losers'),
  getActive: () => api.get<TopStock[]>('/market/active'),
  getSectors: () => api.get<SectorIndex[]>('/market/sectors'),
};

export interface SectorBreakdown {
  sector: string;
  stockCount: number;
  totalMarketCap: number;
  avgChangePercent: number;
  topStocks: Array<{ symbol: string; name: string; last_price: number; change_percent: number }>;
}

export const stocksApi = {
  getAll: (params?: { sector?: string; shariah?: string }) =>
    api.get<Stock[]>('/stocks', { params }),
  getOne: (symbol: string) => api.get<Stock>(`/stocks/${symbol}`),
  getPrices: (symbol: string, days?: number) =>
    api.get<StockPrice[]>(`/stocks/${symbol}/prices`, { params: { days } }),
  getSectorBreakdown: () => api.get<SectorBreakdown[]>('/sectors/breakdown'),
};

export const announcementsApi = {
  getRecent: (params?: {
    type?: string;
    limit?: number;
    symbol?: string;
    category?: string;
    from?: string;
    to?: string;
  }) => api.get<Announcement[]>('/announcements', { params }),
  getById: (id: number) => api.get<Announcement>(`/announcements/${id}`),
};

// Shariah Screening Types
export interface ShariahStats {
  compliant: number;
  non_compliant: number;
  pending_review: number;
  total: number;
  blacklisted_count: number;
}

export interface NonCompliantStock extends Stock {
  blacklist_reason?: string;
  blacklist_category?: string;
}

export interface ShariahStockStatus {
  symbol: string;
  status: 'COMPLIANT' | 'NON_COMPLIANT' | 'PENDING_REVIEW';
  tier1: { pass: boolean; reason?: string; category?: string };
  tier2: {
    pass: boolean | null;
    ratios: {
      interest_income_ratio: number | null;
      debt_ratio: number | null;
      interest_deposit_ratio: number | null;
      receivables_ratio: number | null;
    } | null;
    failed_ratios?: string[];
  };
  screened_at: string | null;
}

export const shariahApi = {
  getStats: () => api.get<ShariahStats>('/shariah/stats'),
  getCompliant: () => api.get<Stock[]>('/shariah/compliant'),
  getNonCompliant: () => api.get<NonCompliantStock[]>('/shariah/non-compliant'),
  getPending: () => api.get<Stock[]>('/shariah/pending'),
  getStatus: (symbol: string) =>
    api.get<ShariahStockStatus>(`/shariah/status/${symbol}`),
  getOverview: () => api.get<{ screened: number; total: number; lastUpdated: string; message: string }>('/shariah/overview'),
};

// Portfolio Types
export interface PortfolioHolding {
  id: number;
  symbol: string;
  name: string;
  sector: string | null;
  quantity: number;
  buy_price: number;
  fees: number;
  effective_buy_price: number;
  buy_date: string;
  current_price: number | null;
  invested_value: number;
  current_value: number | null;
  pnl: number | null;
  pnl_percent: number | null;
  daily_change: number | null;
  allocation_percent: number | null;
  shariah_status: string;
  dividends_received: number;
  purification_rate: number;
  notes: string | null;
}

export interface PortfolioSummary {
  total_value: number;
  total_invested: number;
  total_pnl: number;
  total_pnl_percent: number;
  daily_change: number;
  holdings_count: number;
  cash_balance: number;
  allocation: Array<{
    symbol: string;
    name: string;
    value: number;
    percent: number;
  }>;
  sector_allocation: Array<{
    sector: string;
    value: number;
    percent: number;
  }>;
}

export interface PortfolioShariahSummary {
  compliant_count: number;
  non_compliant_count: number;
  pending_count: number;
  compliant_value: number;
  total_value: number;
  compliant_percent: number;
  holdings: Array<{
    symbol: string;
    name: string;
    value: number;
    shariah_status: string;
  }>;
}

export interface PurificationSummary {
  holdings: Array<{
    symbol: string;
    name: string;
    shariah_status: string;
    dividends_received: number;
    purification_rate: number;
    purification_amount: number;
  }>;
  total_purification: number;
  total_dividends: number;
}

export const portfolioApi = {
  getAll: () => api.get<PortfolioHolding[]>('/portfolio'),
  getSummary: () => api.get<PortfolioSummary>('/portfolio/summary'),
  getShariah: () => api.get<PortfolioShariahSummary>('/portfolio/shariah'),
  getPurification: () => api.get<PurificationSummary>('/portfolio/purification'),
  add: (data: {
    symbol: string;
    quantity: number;
    buy_price: number;
    buy_date: string;
    fees?: number;
    notes?: string;
    dividends_received?: number;
    purification_rate?: number;
  }) => api.post('/portfolio', data),
  update: (
    id: number,
    data: {
      quantity?: number;
      buy_price?: number;
      buy_date?: string;
      fees?: number;
      notes?: string;
      dividends_received?: number;
      purification_rate?: number;
    },
  ) => api.put(`/portfolio/${id}`, data),
  delete: (id: number) => api.delete(`/portfolio/${id}`),
};

// Company Financials Types
export interface CompanyFinancial {
  id: number;
  symbol: string;
  fiscal_year: string;
  quarter: string;
  total_revenue: number | null;
  interest_income: number | null;
  non_compliant_income: number | null;
  net_profit: number | null;
  earnings_per_share: number | null;
  total_assets: number | null;
  total_liabilities: number | null;
  shareholders_equity: number | null;
  interest_bearing_debt: number | null;
  interest_bearing_deposits: number | null;
  receivables: number | null;
  prepayments: number | null;
  cash_and_equivalents: number | null;
  pe_ratio: number | null;
  pb_ratio: number | null;
  debt_to_equity: number | null;
  return_on_equity: number | null;
  dividend_yield: number | null;
  source: string;
  report_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinancialsCoverage {
  total_stocks: number;
  stocks_with_financials: number;
  coverage_percent: number;
  symbols_with_data: string[];
}

export const financialsApi = {
  getBySymbol: (symbol: string) =>
    api.get<CompanyFinancial[]>(`/financials/${symbol}`),
  getLatest: (symbol: string) =>
    api.get<CompanyFinancial>(`/financials/${symbol}/latest`),
  create: (data: {
    symbol: string;
    fiscal_year: string;
    quarter: string;
    total_revenue?: number | null;
    interest_income?: number | null;
    non_compliant_income?: number | null;
    net_profit?: number | null;
    earnings_per_share?: number | null;
    total_assets?: number | null;
    total_liabilities?: number | null;
    shareholders_equity?: number | null;
    interest_bearing_debt?: number | null;
    interest_bearing_deposits?: number | null;
    receivables?: number | null;
    prepayments?: number | null;
    cash_and_equivalents?: number | null;
    pe_ratio?: number | null;
    pb_ratio?: number | null;
    debt_to_equity?: number | null;
    return_on_equity?: number | null;
    dividend_yield?: number | null;
    source?: string;
    report_date?: string | null;
  }) => api.post<CompanyFinancial>('/financials', data),
  update: (
    id: number,
    data: {
      fiscal_year?: string;
      quarter?: string;
      total_revenue?: number | null;
      interest_income?: number | null;
      non_compliant_income?: number | null;
      net_profit?: number | null;
      earnings_per_share?: number | null;
      total_assets?: number | null;
      total_liabilities?: number | null;
      shareholders_equity?: number | null;
      interest_bearing_debt?: number | null;
      interest_bearing_deposits?: number | null;
      receivables?: number | null;
      prepayments?: number | null;
      cash_and_equivalents?: number | null;
      pe_ratio?: number | null;
      pb_ratio?: number | null;
      debt_to_equity?: number | null;
      return_on_equity?: number | null;
      dividend_yield?: number | null;
      source?: string;
      report_date?: string | null;
    },
  ) => api.put<CompanyFinancial>(`/financials/${id}`, data),
  getCoverage: () => api.get<FinancialsCoverage>('/financials/summary/coverage'),
};

// Macro / CBSL Indicators Types
export interface MacroIndicator {
  indicator: string;
  label: string;
  value: number;
  data_date: string;
  source: string | null;
}

export const macroApi = {
  getIndicators: () => api.get<MacroIndicator[]>('/macro/indicators'),
  refresh: () => api.post<{ message: string; errors: string[] }>('/macro/refresh'),
  getHistory: (indicator: string) =>
    api.get<MacroIndicator[]>(`/macro/history/${indicator}`),
};

// Signal Tracking Types
export interface SignalRecordData {
  id: number;
  symbol: string;
  direction: string;
  confidence: string;
  price_at_signal: number;
  price_after_7d: number | null;
  price_after_14d: number | null;
  price_after_30d: number | null;
  return_7d: number | null;
  return_14d: number | null;
  return_30d: number | null;
  reasoning: string | null;
  outcome: string;
  signal_date: string;
}

export interface PerformanceStats {
  totalSignals: number;
  completedSignals: number;
  pendingSignals: number;
  winRate7d: number | null;
  winRate14d: number | null;
  winRate30d: number | null;
  avgReturn7d: number | null;
  avgReturn14d: number | null;
  avgReturn30d: number | null;
  byConfidence: {
    HIGH: { count: number; winRate: number | null };
    MEDIUM: { count: number; winRate: number | null };
    LOW: { count: number; winRate: number | null };
  };
}

export const signalTrackingApi = {
  getPerformance: () => api.get<PerformanceStats>('/signal-tracking/performance'),
  getSignals: (limit?: number) =>
    api.get<SignalRecordData[]>('/signal-tracking/signals', { params: { limit } }),
  record: (data: {
    symbol: string;
    direction: string;
    confidence: string;
    price_at_signal: number;
    reasoning?: string;
  }) => api.post<SignalRecordData>('/signal-tracking/record', data),
  checkOutcomes: () => api.post('/signal-tracking/check-outcomes'),
};

// Alert Types
export interface AlertRecord {
  id: number;
  symbol: string | null;
  alert_type: string;
  title: string;
  message: string | null;
  threshold: number | null;
  is_active: boolean;
  is_read: boolean;
  is_triggered: boolean;
  triggered_at: string | null;
  created_at: string;
}

export const alertsApi = {
  getNotifications: (limit?: number) =>
    api.get<AlertRecord[]>('/alerts/notifications', { params: { limit } }),
  getUnreadCount: () => api.get<{ count: number }>('/alerts/unread-count'),
  getActive: () => api.get<AlertRecord[]>('/alerts/active'),
  create: (data: { symbol: string; alert_type: string; title: string; threshold?: number }) =>
    api.post<AlertRecord>('/alerts', data),
  markRead: (id: number) => api.post(`/alerts/mark-read/${id}`),
  markAllRead: () => api.post('/alerts/mark-all-read'),
  check: () => api.post('/alerts/check'),
  delete: (id: number) => api.delete(`/alerts/${id}`),
};

// Dividend Types
export interface DividendRecord {
  id: number;
  symbol: string;
  amount_per_share: number;
  declaration_date: string | null;
  ex_date: string;
  payment_date: string | null;
  type: string;
  fiscal_year: string | null;
  source: string;
}

export interface DividendYield {
  symbol: string;
  annualDividend: number;
  yield: number | null;
}

export interface PortfolioDividendIncome {
  holdings: Array<{
    symbol: string;
    quantity: number;
    dividends: Array<{ ex_date: string; amount_per_share: number; total: number }>;
    total_income: number;
  }>;
  total_portfolio_income: number;
}

export const dividendsApi = {
  getBySymbol: (symbol: string) => api.get<DividendRecord[]>(`/dividends/${symbol}`),
  getUpcoming: () => api.get<DividendRecord[]>('/dividends/upcoming'),
  getYield: (symbol: string) => api.get<DividendYield>(`/dividends/${symbol}/yield`),
  getPortfolioIncome: () => api.get<PortfolioDividendIncome>('/dividends/portfolio'),
  add: (data: {
    symbol: string;
    amount_per_share: number;
    ex_date: string;
    declaration_date?: string;
    payment_date?: string;
    type?: string;
    fiscal_year?: string;
  }) => api.post<DividendRecord>('/dividends', data),
  delete: (id: number) => api.delete(`/dividends/${id}`),
};

// Global Market Indicators Types
export interface GlobalIndicator {
  indicator: string;
  label: string;
  value: number;
  change: number;
  changePercent: number;
  data_date: string;
  source: string;
  currency: string;
}

export const globalApi = {
  getIndicators: () => api.get<GlobalIndicator[]>('/global/indicators'),
  refresh: () => api.post<{ message: string; errors: string[] }>('/global/refresh'),
  setManual: (data: { indicator: string; value: number; date?: string }) =>
    api.post('/global/manual', data),
};

// AI Engine Types
export interface AiStatus {
  mode: 'live' | 'mock';
  model: string | null;
}

export interface DailyBrief {
  date: string;
  marketSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'CAUTIOUS';
  summary: string;
  topOpportunities: string[];
  keyRisks: string[];
  sectorOutlook: { sector: string; outlook: string }[];
  generatedAt: string;
}

export interface StockAnalysis {
  symbol: string;
  name: string;
  currentPrice: number;
  fundamentalScore: number;
  technicalSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  shariahStatus: string;
  analysis: string;
  riskFactors: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  generatedAt: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface TradingSignal {
  symbol: string;
  name: string;
  currentPrice: number;
  direction: 'BUY' | 'HOLD' | 'SELL';
  reasoning: string;
  rationale_simple?: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  shariahStatus: string;
  suggested_holding_period?: string;
  generatedAt: string;
}

export const aiApi = {
  getStatus: () => api.get<AiStatus>('/ai/status'),
  getDailyBrief: (forceRefresh = false) =>
    api.get<DailyBrief>('/ai/daily-brief', {
      params: forceRefresh ? { forceRefresh: 'true' } : undefined,
    }),
  analyzeStock: (symbol: string, forceRefresh = false) =>
    api.get<StockAnalysis>(`/ai/analyze/${symbol}`, {
      params: forceRefresh ? { forceRefresh: 'true' } : undefined,
    }),
  chat: (message: string, history?: ChatMessage[]) =>
    api.post<{ role: 'assistant'; content: string; timestamp: string }>(
      '/ai/chat',
      { message, history: history ?? [] },
    ),
  getSignals: (forceRefresh = false) =>
    api.get<TradingSignal[]>('/ai/signals', {
      params: forceRefresh ? { forceRefresh: 'true' } : undefined,
    }),
};

// News Intelligence Types
export interface NewsItemData {
  id: number;
  title: string;
  summary: string | null;
  source: string;
  url: string | null;
  impact_level: string;
  impact_direction: string;
  affected_symbols: string[] | null;
  affected_sectors: string[] | null;
  category: string | null;
  ai_analysis: string | null;
  published_at: string;
  created_at: string;
}

export interface NewsSource {
  name: string;
  label: string;
  count: number;
}

export const newsApi = {
  getNews: (params?: {
    limit?: number;
    source?: string;
    category?: string;
    impact?: string;
    search?: string;
  }) => api.get<NewsItemData[]>('/news', { params }),
  getSources: () => api.get<NewsSource[]>('/news/sources'),
  getHighImpact: (hours?: number) =>
    api.get<NewsItemData[]>('/news/high-impact', { params: { hours } }),
  getById: (id: number) => api.get<NewsItemData>(`/news/${id}`),
  refresh: () => api.post<{ fetched: number; errors: string[] }>('/news/refresh'),
};

// Export Types
export interface PortfolioExport {
  csv: string;
  json: Record<string, unknown>[];
  generatedAt: string;
}

export interface ShariahExport {
  csv: string;
  json: Record<string, unknown>[];
  generatedAt: string;
  summary: {
    total: number;
    compliant: number;
    nonCompliant: number;
    pending: number;
  };
}

export const exportApi = {
  getPortfolio: () => api.get<PortfolioExport>('/export/portfolio'),
  getShariah: () => api.get<ShariahExport>('/export/shariah'),
  getPrices: (symbol: string, days?: number) =>
    api.get<{ csv: string; json: Record<string, unknown>[] }>(
      `/export/prices/${symbol}`,
      { params: { days } },
    ),
};

// Backtest Types
export interface BacktestTrade {
  date: string;
  type: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  reason: string;
}

export interface BacktestResult {
  strategy: string;
  symbol: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  finalCapital: number;
  totalReturn: number;
  totalReturnPercent: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  maxDrawdown: number;
  sharpeRatio: number | null;
  trades: BacktestTrade[];
  equityCurve: Array<{ date: string; equity: number }>;
  buyAndHoldReturn: number;
}

export interface BacktestStrategy {
  id: string;
  name: string;
  description: string;
}

export const backtestApi = {
  run: (params: {
    strategy: string;
    symbol: string;
    days?: number;
    capital?: number;
  }) =>
    api.get<BacktestResult>('/backtest/run', { params }),
  getStrategies: () => api.get<BacktestStrategy[]>('/backtest/strategies'),
  getSymbols: () => api.get<string[]>('/backtest/symbols'),
};

// Journey / Investment Tracker Types
export interface MonthlyDepositRecord {
  id: number;
  month: string;
  deposit_amount: number;
  deposit_date: string;
  portfolio_value_at_deposit: number;
  cumulative_deposited: number;
  source: string;
  notes: string | null;
  created_at: string;
}

export interface InvestmentKPIs {
  totalDeposited: number;
  currentPortfolioValue: number;
  totalProfitLoss: number;
  totalProfitLossPct: number;
  thisMonthReturn: number;
  thisMonthReturnPct: number;
  bestMonth: { month: string; returnPct: number } | null;
  worstMonth: { month: string; returnPct: number } | null;
  monthsInvested: number;
  positiveMonths: number;
  consecutiveDeposits: number;
  portfolioReturnPct: number;
  aspiReturnSamePeriod: number;
  beatingMarket: boolean;
  shariahCompliantPct: number;
  totalPurificationDue: number;
  totalDividendsReceived: number;
}

export interface InvestmentGoalData {
  id: number;
  target_amount: number;
  target_date: string | null;
  is_active: boolean;
  label: string | null;
  currentProgress: number;
  progressPercent: number;
  estimatedCompletionDate: string | null;
  monthlyDepositNeeded: number;
  onTrack: boolean;
  milestones: Array<{ percent: number; reached: boolean; reachedDate?: string }>;
}

export interface PortfolioHealthScore {
  overallScore: number;
  grade: string;
  diversification: { score: number; label: string };
  shariahCompliance: { score: number; label: string };
  riskLevel: { score: number; label: string };
  costEfficiency: { score: number; label: string };
  consistency: { score: number; label: string };
  suggestion: string;
}

export const journeyApi = {
  getJourney: () => api.get<MonthlyDepositRecord[]>('/journey'),
  getKPIs: () => api.get<InvestmentKPIs>('/journey/kpis'),
  getHealth: () => api.get<PortfolioHealthScore>('/journey/health'),
  getGoals: () => api.get<InvestmentGoalData[]>('/journey/goals'),
  recordDeposit: (data: {
    month: string;
    depositAmount: number;
    depositDate: string;
    notes?: string;
  }) => api.post<MonthlyDepositRecord>('/journey/deposit', data),
  createGoal: (data: {
    targetAmount: number;
    targetDate?: string;
    label?: string;
  }) => api.post<InvestmentGoalData>('/journey/goals', data),
  updateGoal: (id: number, data: { targetAmount?: number; targetDate?: string; label?: string }) =>
    api.put(`/journey/goals/${id}`, data),
  deleteGoal: (id: number) => api.delete(`/journey/goals/${id}`),
};

// ATrad Sync Types
export interface ATradHolding {
  symbol: string;
  companyName: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPL: number;
  unrealizedPLPct: number;
}

export interface ATradSyncStatus {
  lastSynced: string | null;
  syncSuccess: boolean;
  holdingsCount: number;
  buyingPower: number;
  error?: string;
  configured: boolean;
}

export const atradApi = {
  sync: () => api.post<{ message: string }>('/atrad/sync'),
  getStatus: () => api.get<ATradSyncStatus>('/atrad/status'),
  getHoldings: () => api.get<ATradHolding[]>('/atrad/holdings'),
  testConnection: () => api.post<{ success: boolean; message: string }>('/atrad/test'),
};

// Insights Types
export interface DynamicInsight {
  id: string;
  text: string;
  category: string;
  relevance: string;
  icon: string;
  actionText?: string;
  actionLink?: string;
  createdAt: string;
}

export interface MarketExplainer {
  id: string;
  trigger: string;
  headline: string;
  explanation: string;
  whatItMeans: string;
  actionSuggestion: string;
  createdAt: string;
  expiresAt: string;
}

export const insightsApi = {
  getCurrent: () => api.get<DynamicInsight[]>('/insights/current'),
  getExplainer: () => api.get<MarketExplainer | null>('/insights/explainer'),
  getTips: () => api.get<DynamicInsight[]>('/insights/tips'),
};

// Analysis / AI Pipeline Types
export interface MarketSnapshotData {
  id: number;
  date: string;
  aspi_close: number | null;
  aspi_change_pct: number | null;
  sp20_close: number | null;
  total_turnover: number | null;
  top_gainers: unknown;
  top_losers: unknown;
  created_at: string;
}

export interface StockScoreData {
  id: number;
  date: string;
  symbol: string;
  composite_score: number;
  data_days: number;
  is_placeholder: boolean;
  // Fundamentals (35%)
  earnings_growth_score: number;
  debt_health_score: number;
  roe_score: number;
  revenue_trend_score: number;
  // Valuation (25%)
  pe_score: number;
  pb_score: number;
  dividend_score: number;
  // Technical (25%)
  momentum_score: number;
  volume_score: number;
  week52_position_score: number;
  volatility_score: number;
  // Market context (15%)
  sector_score: number;
  liquidity_score: number;
  // Full component breakdown
  components?: Record<string, unknown>;
}

export interface AiRecommendationData {
  id: number;
  week_start: string;
  recommended_stock: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reasoning: string;
  price_outlook_3m: string | null; // JSON string with bear/base/bull objects
  risk_flags: string[] | null;
  alternative: string | null;
  portfolio_action: 'BUY' | 'HOLD' | 'WAIT' | null;
  suggested_allocation_lkr: number | null;
  model_used: string;
  created_at: string;
}

export interface DataStatusData {
  market_snapshot_days: number;
  portfolio_snapshot_days: number;
  scoring_ready: boolean;
  days_until_scoring_ready: number;
  last_snapshot_date: string | null;
  last_scoring_date: string | null;
}

export const analysisApi = {
  getLatestSnapshot: () => api.get<MarketSnapshotData | null>('/analysis/snapshot/latest'),
  getSnapshots: (days = 30) => api.get<MarketSnapshotData[]>(`/analysis/snapshots?days=${days}`),
  getScores: (limit = 10) => api.get<StockScoreData[]>(`/analysis/scores?limit=${limit}`),
  getRecommendation: () => api.get<AiRecommendationData | null>('/analysis/recommendation'),
  getDataStatus: () => api.get<DataStatusData>('/analysis/data-status'),
};

export default api;
