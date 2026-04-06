import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 60000,
  withCredentials: true, // Send httpOnly cookies with every request
});

// Attach API key to every request so protected endpoints (approve/execute/cancel/create)
// can verify the caller is the dashboard owner and not a random public request.
api.interceptors.request.use((config) => {
  const apiKey = process.env.NEXT_PUBLIC_API_KEY;
  if (apiKey) {
    config.headers['X-API-Key'] = apiKey;
  }
  return config;
});

// Auto-refresh: on 401, attempt token refresh once, then retry the original request.
// If refresh also fails, redirect to login.
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}> = [];

function processQueue(error: unknown) {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(undefined);
    }
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Only intercept 401s, skip if already retried or if this IS the refresh call
    if (
      error.response?.status !== 401 ||
      originalRequest._retry ||
      originalRequest.url?.includes('/auth/')
    ) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      // Queue requests while refresh is in-flight
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then(() => api(originalRequest));
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      await axios.post(`${API_BASE}/auth/refresh`, {}, { withCredentials: true });
      processQueue(null);
      return api(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError);
      // Refresh failed — session expired, redirect to login
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

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
  getStatus: () =>
    api.get<{
      compliant_stocks: number;
      with_financials: number;
      missing: number;
      coverage_percent: number;
      last_cse_fetch: string | null;
    }>('/financials/status'),
  fetchFromCse: () =>
    api.post<{
      total: number;
      fetched: number;
      failed: number;
      results: Array<{ symbol: string; status: string; message?: string }>;
    }>('/financials/fetch-cse', {}),
  importCsv: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<{ imported: number; skipped: number; errors: string[] }>(
      '/financials/import-csv',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
  },
  scrapeCse: () =>
    api.post<{
      total: number;
      success: number;
      partial: number;
      failed: number;
      tier2TriggerStatus: string;
      results: Array<{
        symbol: string;
        status: 'success' | 'partial' | 'failed';
        dbStatus?: string;
        message?: string;
      }>;
    }>('/financials/scrape-cse', {}),
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
  byDirection: {
    BUY: { count: number; winRate: number | null; avgReturn: number | null };
    HOLD: { count: number; winRate: number | null; avgReturn: number | null };
    SELL: { count: number; winRate: number | null; avgReturn: number | null };
  };
  bestSignal: { symbol: string; direction: string; return_30d: number; signal_date: string } | null;
  worstSignal: { symbol: string; direction: string; return_30d: number; signal_date: string } | null;
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

export interface EconomicEvent {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast: string;
  previous: string;
}

export const globalApi = {
  getIndicators: () => api.get<GlobalIndicator[]>('/global/indicators'),
  refresh: () => api.post<{ message: string; errors: string[] }>('/global/refresh'),
  setManual: (data: { indicator: string; value: number; date?: string }) =>
    api.post('/global/manual', data),
  getEconomicCalendar: () => api.get<EconomicEvent[]>('/global/economic-calendar'),
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
  sharpeNote?: string;
  trades: BacktestTrade[];
  equityCurve: Array<{ date: string; equity: number }>;
  buyAndHoldReturn: number;
  error?: boolean;
  errorMessage?: string;
  dataPoints?: number;
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
  getCompliantSymbols: () => api.get<string[]>('/backtest/compliant-symbols'),
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

export interface ATradDetailedSyncStatus {
  lastSync: string | null;
  balance: number;
  holdingsCount: number;
  isStale: boolean;
  nextScheduledSync: string;
  syncSuccess: boolean;
  error?: string;
}

export interface SafetyCheckDetail {
  name: string;
  passed: boolean;
  reason: string;
  value?: number;
  limit?: number;
}

export interface SafetyCheckResult {
  passed: boolean;
  checks: SafetyCheckDetail[];
  rejectedBy?: string;
  checkedAt: string;
}

export interface TradeSafetyStatus {
  enabled: boolean;
  requireHumanApproval: boolean;
  limits: {
    maxSingleOrderLkr: number;
    maxDailyBuyLkr: number;
    maxPortfolioAllocationPct: number;
    minCashReserveLkr: number;
    maxDailyOrders: number;
    dailyLossLimitPct: number;
    limitOffsetPct: number;
  };
}

export const atradApi = {
  sync: () => api.post<{ message: string }>('/atrad/sync'),
  getStatus: () => api.get<ATradSyncStatus>('/atrad/status'),
  getSyncStatus: () => api.get<ATradDetailedSyncStatus>('/atrad/sync-status'),
  getHoldings: () => api.get<ATradHolding[]>('/atrad/holdings'),
  testConnection: () => api.post<{ success: boolean; message: string }>('/atrad/test'),
};

// Pending Orders / Trade Queue Types
export interface PendingOrder {
  id: number;
  symbol: string;
  order_type: string; // 'STOP_LOSS' | 'TAKE_PROFIT' | 'LIMIT_BUY'
  action: string;     // 'BUY' | 'SELL'
  quantity: number;
  trigger_price: number;
  limit_price: number | null;
  status: string;     // 'PENDING' | 'APPROVED' | 'EXECUTING' | 'EXECUTED' | 'FAILED' | 'CANCELLED' | 'REJECTED'
  source: string | null;
  reason: string | null;
  risk_data: Record<string, unknown> | null;
  strategy_id: string | null;       // which strategy generated this (e.g. 'MEAN_REVERSION')
  safety_check_result: SafetyCheckResult | null; // full safety check pipeline result
  approved_at: string | null;
  executed_at: string | null;
  atrad_order_id: string | null;
  execution_screenshot: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateOrderPayload {
  symbol: string;
  order_type: string;
  action: string;
  quantity: number;
  trigger_price: number;
  limit_price?: number;
  reason?: string;
  strategy_id?: string;
}

export interface CreateTradeQueuePayload {
  symbol: string;
  direction: 'BUY' | 'SELL';
  quantity: number;
  limit_price: number;
  strategy_id?: string;
  reasoning?: string;
}

export const ordersApi = {
  list: (status?: string) =>
    api.get<PendingOrder[]>('/atrad/orders', { params: status ? { status } : {} }),
  getActive: () => api.get<PendingOrder[]>('/atrad/orders/active'),
  getById: (id: number) => api.get<PendingOrder>(`/atrad/orders/${id}`),
  create: (payload: CreateOrderPayload) => api.post<PendingOrder>('/atrad/orders', payload),
  approve: (id: number) => api.post<PendingOrder>(`/atrad/orders/${id}/approve`),
  execute: (id: number) => api.post<PendingOrder>(`/atrad/orders/${id}/execute`),
  cancel: (id: number) => api.post<PendingOrder>(`/atrad/orders/${id}/cancel`),
  reject: (id: number) => api.post<PendingOrder>(`/atrad/orders/${id}/cancel`), // alias → cancel
};

export const tradeApi = {
  getQueue: () => api.get<PendingOrder[]>('/trade/queue'),
  getPending: () => api.get<PendingOrder[]>('/trade/queue/pending'),
  createQueueEntry: (payload: CreateTradeQueuePayload) =>
    api.post<{ created: boolean; order?: PendingOrder; safetyCheckResult: SafetyCheckResult; reason?: string }>('/trade/queue', payload),
  approve: (id: number) => api.post<PendingOrder>(`/trade/approve/${id}`),
  reject: (id: number) => api.post<PendingOrder>(`/trade/reject/${id}`),
  execute: (id: number) => api.post<PendingOrder>(`/trade/execute/${id}`),
  getSafetyStatus: () => api.get<TradeSafetyStatus>('/trade/safety-status'),
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
  // Phase 3: trade execution parameters
  suggested_entry_price: number | null;
  suggested_stop_loss: number | null;
  suggested_take_profit: number | null;
  suggested_shares: number | null;
  order_type: string | null;
  technical_summary: string | null;
  model_used: string;
  created_at: string;
}

export interface TechnicalSignalData {
  id: number;
  date: string;
  symbol: string;
  close_price: number | null;
  sma_20: number | null;
  sma_50: number | null;
  sma_trend: string | null;
  rsi_14: number | null;
  rsi_signal: string | null;
  macd_line: number | null;
  macd_signal_line: number | null;
  macd_histogram: number | null;
  macd_crossover: string | null;
  support_20d: number | null;
  resistance_20d: number | null;
  atr_14: number | null;
  volume_avg_20d: number | null;
  volume_ratio: number | null;
  volume_trend: string | null;
  candlestick_pattern: string | null;
  overall_signal: string;
  signal_score: number;
  signal_summary: string | null;
  created_at: string;
}

export interface PositionRiskData {
  id: number;
  date: string;
  symbol: string;
  entry_price: number;
  current_price: number;
  shares_held: number;
  stop_loss_atr: number | null;
  stop_loss_support: number | null;
  recommended_stop: number;
  take_profit: number;
  risk_per_share: number;
  reward_per_share: number;
  risk_reward_ratio: number;
  max_loss_lkr: number;
  max_gain_lkr: number;
  distance_to_stop_pct: number;
  position_heat_pct: number;
  portfolio_heat_pct: number | null;
  risk_status: string;
  created_at: string;
}

export interface PortfolioRiskSummary {
  positions: PositionRiskData[];
  total_heat_pct: number;
  risk_status: string;
  max_loss_lkr: number;
  max_gain_lkr: number;
}

export interface ModelPerformanceData {
  total_recommendations: number;
  outcomes_tracked: number;
  win_rate_1w: number | null;
  win_rate_1m: number | null;
  avg_return_1w: number | null;
  avg_return_1m: number | null;
  best_pick: { symbol: string; return_1m: number } | null;
  worst_pick: { symbol: string; return_1m: number } | null;
  last_updated: string;
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
  // Phase 3: Technical Analysis
  getTechnicals: (limit = 20) => api.get<TechnicalSignalData[]>(`/analysis/technicals?limit=${limit}`),
  getTechnicalForSymbol: (symbol: string) => api.get<TechnicalSignalData | null>(`/analysis/technicals/${symbol}`),
  runTechnicals: () => api.post<{ message: string }>('/analysis/run-technicals'),
  // Phase 3: Risk Management
  getRisk: () => api.get<PositionRiskData[]>('/analysis/risk'),
  getPortfolioRisk: () => api.get<PortfolioRiskSummary>('/analysis/risk/portfolio'),
  getRiskForSymbol: (symbol: string) => api.get<PositionRiskData | null>(`/analysis/risk/${symbol}`),
  runRisk: () => api.post<{ message: string }>('/analysis/run-risk'),
  // Phase 3: Model Performance
  getModelPerformance: () => api.get<ModelPerformanceData>('/analysis/model-performance'),
  getOutcomes: () => api.get('/analysis/outcomes'),
};

// ─── Demo Trading Types ──────────────────────────────────────────────────────

export interface DemoAccountData {
  id: number;
  name: string;
  initial_capital: number;
  cash_balance: number;
  total_fees_paid: number;
  strategy: string | null;
  is_active: boolean;
  created_at: string;
  // computed (from getAccount)
  holdings_value?: number;
  total_value?: number;
  portfolio_value?: number;
  total_return_pct?: number;
}

export interface DemoHoldingEnriched {
  id: number;
  demo_account_id: number;
  stock_id: number;
  symbol: string;
  quantity: number;
  avg_cost_basis: number;
  total_invested: number;
  realized_pnl: number;
  shariah_status: string;
  current_price: number;
  market_value: number;
  unrealized_pnl: number;
  pnl_pct: number;
}

export interface DemoTradeData {
  id: number;
  demo_account_id: number;
  stock_id: number;
  symbol: string;
  direction: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  total_value: number;
  fee: number;
  net_value: number;
  source: string;
  ai_reasoning: string | null;
  shariah_status: string;
  market_snapshot: Record<string, unknown> | null;
  executed_at: string;
  created_at: string;
}

export interface DemoPerformanceData {
  total_value: number;
  cash_balance: number;
  holdings_value: number;
  total_return: number;
  return_pct: number;
  win_rate: number;
  total_trades: number;
  total_sell_trades: number;
  profitable_trades: number;
  avg_return_per_trade: number;
  total_fees: number;
  shariah_compliance: number;
}

export interface DemoSnapshotData {
  id: number;
  demo_account_id: number;
  snapshot_date: string;
  portfolio_value: number;
  cash_balance: number;
  holdings_value: number;
  total_return_pct: number;
  aspi_value: number | null;
  aspi_return_pct: number | null;
  num_holdings: number;
  trades_today: number;
  created_at: string;
}

export interface DemoBenchmarkData {
  id: number;
  demo_account_id: number;
  benchmark_date: string;
  portfolio_return_pct: number;
  aspi_return_pct: number | null;
  random_return_pct: number | null;
  created_at: string;
}

export interface CreateDemoTradePayload {
  demo_account_id: number;
  symbol: string;
  direction: 'BUY' | 'SELL';
  quantity: number;
  source?: string;
  ai_reasoning?: string;
}

export const demoApi = {
  getAccounts: () => api.get<DemoAccountData[]>('/demo/accounts'),
  getAccount: (id: number) => api.get<DemoAccountData>(`/demo/accounts/${id}`),
  resetAccount: (id: number) => api.post<DemoAccountData>(`/demo/accounts/${id}/reset`),
  getHoldings: (accountId: number) => api.get<DemoHoldingEnriched[]>(`/demo/holdings/${accountId}`),
  getTrades: (accountId: number, page = 1, limit = 20) =>
    api.get<{ trades: DemoTradeData[]; total: number; page: number }>(
      '/demo/trades',
      { params: { demo_account_id: accountId, page, limit } },
    ),
  executeTrade: (payload: CreateDemoTradePayload) =>
    api.post<DemoTradeData>('/demo/trades', payload),
  getPerformance: (accountId: number) =>
    api.get<DemoPerformanceData>(`/demo/performance/${accountId}`),
  getSnapshots: (accountId: number) =>
    api.get<DemoSnapshotData[]>(`/demo/snapshots/${accountId}`),
  getBenchmarks: (accountId: number) =>
    api.get<DemoBenchmarkData[]>(`/demo/benchmarks/${accountId}`),
  triggerSnapshot: (accountId: number) =>
    api.post(`/demo/snapshots/trigger/${accountId}`),
  triggerAITrade: (accountId: number) =>
    api.post(`/demo/ai-trade/${accountId}`),
  getAILog: (accountId: number) => api.get(`/demo/ai-log/${accountId}`),
};

// ---------------------------------------------------------------------------
// Trade Opportunities
// ---------------------------------------------------------------------------

export interface StrengthInfo {
  score: number;
  label: 'WEAK' | 'MODERATE' | 'STRONG' | 'VERY_STRONG';
  factors: string[];
}

export interface TradeOpportunity {
  rank: number;
  symbol: string;
  company_name: string;
  sector: string | null;
  direction: 'BUY';
  current_price: number;
  suggested_entry: number;
  stop_loss: number;
  take_profit: number;
  risk_reward_ratio: string;
  position_size_shares: number;
  position_value_lkr: number;
  risk_per_trade_lkr: number;
  risk_per_trade_pct: number;
  strength: StrengthInfo;
  shariah_status: string;
  composite_score: number;
  technical_signal: string;
  reasoning: string;
}

export interface RiskSummary {
  daily_budget_pct: number;
  daily_budget_lkr: number;
  used_pct: number;
  used_lkr: number;
  remaining_pct: number;
  remaining_lkr: number;
  selected_trades: string[];
  selected_risk_total_pct: number;
}

export interface SelectionPreview {
  valid: boolean;
  trades: Array<{
    symbol: string;
    quantity: number;
    entry_price: number;
    risk_lkr: number;
    risk_pct: number;
  }>;
  total_risk_lkr: number;
  total_risk_pct: number;
  budget_remaining_after_lkr: number;
  exceeds_budget: boolean;
  message: string;
}

export const opportunitiesApi = {
  getOpportunities: () => api.get<TradeOpportunity[]>('/trade-opportunities'),
  getRiskSummary: (accountId = 1) =>
    api.get<RiskSummary>('/trade-opportunities/risk-summary', { params: { accountId } }),
  selectTrades: (symbols: string[], account_type = 'demo') =>
    api.post<SelectionPreview>('/trade-opportunities/select', { symbols, account_type }),
  executeTrades: (symbols: string[], account_id = 1) =>
    api.post<{ executed: string[]; failed: string[]; total_risk_lkr: number }>(
      '/trade-opportunities/execute',
      { symbols, account_id },
    ),
};

// ---------------------------------------------------------------------------
// Strategy Engine
// ---------------------------------------------------------------------------

export interface StrategyEngineStatus {
  regime: string | null;
  regimeConfidence: number | null;
  regimeReasoning: string | null;
  regimeIndicators: {
    aspi_current: number | null;
    sma_20: number | null;
    sma_50: number | null;
    atr_14: number | null;
    atr_50: number | null;
    breadth_advancing_pct: number | null;
    foreign_net_buying_mtd: number | null;
    week52_high: number | null;
  } | null;
  activeStrategies: Array<{ id: string; name: string; description: string }>;
  inactiveStrategies: Array<{ id: string; name: string; reason: string }>;
  todaySignalCount: number;
  lastRun: string | null;
  totalStrategiesInRegistry: number;
}

export interface StrategyEngineSignal {
  id: number;
  signal_date: string;
  symbol: string;
  strategy_id: string;
  strategy_name: string;
  direction: string;
  confidence: string;
  score: number;
  entry_price: number;
  stop_loss: number | null;
  take_profit: number | null;
  risk_reward_ratio: number | null;
  position_size_shares: number | null;
  position_size_lkr: number | null;
  reasoning: string[] | null;
  rules_triggered: Array<{ rule: string; actual: unknown; threshold: unknown }> | null;
  market_regime: string;
  expires_at: string;
  data_confidence: number | null;
  created_at: string;
}

export interface StrategyBacktestResult {
  id: string;
  strategy_id: string;
  strategy_name: string;
  run_date: string;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  avg_return_pct: number;
  max_drawdown: number;
  sharpe_ratio: number | null;
  total_return_pct: number;
  stocks_tested: number;
  trades_detail: Array<{
    symbol: string;
    entry_date: string;
    entry_price: number;
    exit_date: string;
    exit_price: number;
    return_pct: number;
    hold_days: number;
    exit_reason: string;
  }> | null;
  period_start: string | null;
  period_end: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export const strategyEngineApi = {
  getStatus: () =>
    api.get<{ success: boolean; data: StrategyEngineStatus }>('/strategy-engine/status'),
  getSignals: () =>
    api.get<{
      success: boolean;
      data: StrategyEngineSignal[];
      meta: { total: number; date: string };
    }>('/strategy-engine/signals'),
  runManually: () =>
    api.post<{
      success: boolean;
      data: { regime: string; regimeConfidence: number; signalsGenerated: number };
    }>('/strategy-engine/run'),
  runBacktests: () =>
    api.post<{ success: boolean; data: StrategyBacktestResult[] }>('/strategy-engine/run-backtests'),
  getBacktestResults: () =>
    api.get<{ success: boolean; data: StrategyBacktestResult[] }>('/strategy-engine/backtest-results'),
  getBacktestResultsByStrategy: (strategyId: string) =>
    api.get<{ success: boolean; data: StrategyBacktestResult[] }>(
      `/strategy-engine/backtest-results/${strategyId}`,
    ),
};

export default api;

