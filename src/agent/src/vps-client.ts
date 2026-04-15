import { config } from './config';
import { logger } from './utils/logger';

interface HeartbeatResponse {
  status: 'ok';
  serverTime: string;
  marketOpen: boolean;
}

interface PendingTrade {
  id: number;
  symbol: string;
  action: string;
  quantity: number;
  triggerPrice: number;
  limitPrice: number | null;
  orderType: string;
  reason: string | null;
  strategyId: string | null;
  source: string | null;
  approvedAt: string | null;
}

interface ExecutionReport {
  tradeQueueId: number;
  status: 'FILLED' | 'PARTIAL' | 'REJECTED' | 'ERROR';
  fillPrice?: number;
  filledQuantity?: number;
  atradOrderRef?: string;
  screenshotPath?: string;
  notes?: string;
}

interface PortfolioHolding {
  symbol: string;
  quantity: number;
  avgCost: number;
  marketValue: number;
  unrealizedGain: number;
}

interface SyncTriggerResponse {
  shouldSync: boolean;
  reason: string;
}

const BASE_URL = `${config.vpsUrl}/api/internal/agent`;

async function agentFetch<T>(
  path: string,
  options?: { method?: string; body?: unknown },
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const method = options?.method ?? 'GET';

  const fetchOptions: RequestInit = {
    method,
    headers: {
      'X-Agent-Key': config.agentSecret,
      'Content-Type': 'application/json',
    },
  };

  if (options?.body) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, fetchOptions);

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`${method} ${path} → HTTP ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

export const vpsClient = {
  async heartbeat(): Promise<HeartbeatResponse> {
    return agentFetch<HeartbeatResponse>('/heartbeat');
  },

  async getPendingTrades(): Promise<PendingTrade[]> {
    return agentFetch<PendingTrade[]>('/pending-trades');
  },

  async reportExecution(report: ExecutionReport): Promise<{ success: boolean }> {
    return agentFetch<{ success: boolean }>('/report-execution', {
      method: 'POST',
      body: report,
    });
  },

  async syncPortfolio(data: {
    cashBalance: number;
    holdings: PortfolioHolding[];
  }): Promise<{ success: boolean; updated: number }> {
    return agentFetch<{ success: boolean; updated: number }>('/sync-portfolio', {
      method: 'POST',
      body: data,
    });
  },

  async getSyncTrigger(): Promise<SyncTriggerResponse> {
    return agentFetch<SyncTriggerResponse>('/sync-trigger');
  },
};

export type { PendingTrade, ExecutionReport, PortfolioHolding, SyncTriggerResponse };
