import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  timeout: 10000,
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
  symbol: string | null;
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

export const stocksApi = {
  getAll: (params?: { sector?: string; shariah?: string }) =>
    api.get<Stock[]>('/stocks', { params }),
  getOne: (symbol: string) => api.get<Stock>(`/stocks/${symbol}`),
  getPrices: (symbol: string, days?: number) =>
    api.get<StockPrice[]>(`/stocks/${symbol}/prices`, { params: { days } }),
};

export const announcementsApi = {
  getRecent: (params?: { type?: string; limit?: number }) =>
    api.get<Announcement[]>('/announcements', { params }),
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
};

// Portfolio Types
export interface PortfolioHolding {
  id: number;
  symbol: string;
  name: string;
  sector: string | null;
  quantity: number;
  buy_price: number;
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
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  shariahStatus: string;
  generatedAt: string;
}

export const aiApi = {
  getStatus: () => api.get<AiStatus>('/ai/status'),
  getDailyBrief: () => api.get<DailyBrief>('/ai/daily-brief'),
  analyzeStock: (symbol: string) =>
    api.get<StockAnalysis>(`/ai/analyze/${symbol}`),
  chat: (message: string, history?: ChatMessage[]) =>
    api.post<{ role: 'assistant'; content: string; timestamp: string }>(
      '/ai/chat',
      { message, history: history ?? [] },
    ),
  getSignals: () => api.get<TradingSignal[]>('/ai/signals'),
};

export default api;
