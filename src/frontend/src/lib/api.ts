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

export const portfolioApi = {
  getAll: () => api.get<PortfolioHolding[]>('/portfolio'),
  getSummary: () => api.get<PortfolioSummary>('/portfolio/summary'),
  getShariah: () => api.get<PortfolioShariahSummary>('/portfolio/shariah'),
  add: (data: {
    symbol: string;
    quantity: number;
    buy_price: number;
    buy_date: string;
    notes?: string;
  }) => api.post('/portfolio', data),
  update: (
    id: number,
    data: {
      quantity?: number;
      buy_price?: number;
      buy_date?: string;
      notes?: string;
    },
  ) => api.put(`/portfolio/${id}`, data),
  delete: (id: number) => api.delete(`/portfolio/${id}`),
};

export default api;
