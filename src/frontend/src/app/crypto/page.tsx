'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Bitcoin,
  TrendingUp,
  TrendingDown,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Shield,
  Loader2,
  AlertTriangle,
  Clock,
  BarChart2,
  Pause,
  Play,
  Trash2,
  Plus,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import axios from 'axios';
import { DcaPanel } from '@/components/crypto/dca-panel';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || '/api',
  timeout: 60000,
  withCredentials: true,
});

// ── Types ──────────────────────────────────────────────────────────────────

interface Ticker {
  symbol: string;
  price: number;
  change24h: number;
  changePct24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  timestamp: string;
}

interface Holding {
  asset: string;
  amount: number;
  valueUSD: number;
  price: number;
}

interface Portfolio {
  balance: Record<string, number>;
  totalValueUSD: number;
  holdings: Holding[];
}

interface PaperTrade {
  id: string;
  type: 'BUY' | 'SELL';
  symbol: string;
  amount: number;
  price: number;
  total: number;
  timestamp: string;
}

interface TechnicalIndicators {
  sma_20: number;
  sma_50: number;
  rsi_14: number;
  macd_line: number;
  macd_signal: number;
  macd_histogram: number;
  bollinger_upper: number;
  bollinger_lower: number;
  overall_signal: 'BULLISH' | 'NEUTRAL' | 'BEARISH';
  signal_score: number;
  close_price: number;
}

interface TechnicalAnalysis {
  symbol: string;
  daily: TechnicalIndicators | null;
  hourly: TechnicalIndicators | null;
}

interface DcaPlan {
  id: number;
  symbol: string;
  amount_usdt: number;
  frequency: string;
  is_active: boolean;
  total_invested: number;
  total_units_bought: number;
  average_cost: number;
  last_execution: string | null;
}

interface DcaPerformancePlan {
  id: number;
  symbol: string;
  total_invested: number;
  current_value: number;
  unrealized_pnl: number;
  pnl_pct: number;
}

interface DcaPerformance {
  plans: DcaPerformancePlan[];
  totals: {
    totalInvested: number;
    currentValue: number;
    unrealizedPnl: number;
    pnlPct: number;
  };
}

interface OhlcvBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ChartPoint {
  date: string;
  close: number;
}

type ChartRange = '7d' | '30d' | '90d';

const CHART_RANGE_LIMITS: Record<ChartRange, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

// ── Sub-components ─────────────────────────────────────────────────────────

interface SignalScoreBarProps {
  score: number;
}

function SignalScoreBar({ score }: SignalScoreBarProps) {
  const clamped = Math.max(-100, Math.min(100, score));
  const isPositive = clamped >= 0;
  const width = Math.abs(clamped);
  const marginLeft = isPositive ? '50%' : `${50 - width}%`;

  return (
    <div className="h-2 rounded-full bg-muted overflow-hidden relative">
      {/* centre marker */}
      <div className="absolute left-1/2 top-0 w-px h-full bg-border z-10" />
      <div
        className={`h-full absolute top-0 ${isPositive ? 'bg-emerald-500' : 'bg-red-500'}`}
        style={{ width: `${width}%`, left: marginLeft }}
      />
    </div>
  );
}

interface TechnicalCardProps {
  analysis: TechnicalAnalysis;
  label: string;
}

function TechnicalCard({ analysis, label }: TechnicalCardProps) {
  // Use daily if available, fall back to hourly
  const d = analysis.daily ?? analysis.hourly;

  if (!d) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-muted-foreground" />
            {label} Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            Waiting for technical analysis data. Signals compute hourly.
          </p>
        </CardContent>
      </Card>
    );
  }

  const score = Number(d.signal_score) || 0;
  const rsi = Number(d.rsi_14) || 50;
  const sma20 = Number(d.sma_20) || 0;
  const sma50 = Number(d.sma_50) || 0;
  const closePrice = Number(d.close_price) || 0;
  const macdLine = Number(d.macd_line) || 0;
  const macdSignal = Number(d.macd_signal) || 0;
  const macdHist = Number(d.macd_histogram) || 0;
  const bollUpper = Number(d.bollinger_upper) || 0;
  const bollLower = Number(d.bollinger_lower) || 0;

  const signalColor =
    d.overall_signal === 'BULLISH'
      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
      : d.overall_signal === 'BEARISH'
        ? 'bg-red-500/10 text-red-400 border-red-500/30'
        : 'bg-amber-500/10 text-amber-400 border-amber-500/30';

  const rsiColor =
    rsi < 30
      ? 'text-emerald-400'
      : rsi > 70
        ? 'text-red-400'
        : 'text-amber-400';

  const rsiLabel = rsi < 30 ? 'Oversold' : rsi > 70 ? 'Overbought' : 'Neutral';

  const priceVsSma20 = closePrice > sma20 ? 'text-emerald-400' : 'text-red-400';
  const priceVsSma50 = closePrice > sma50 ? 'text-emerald-400' : 'text-red-400';

  const macdColor = macdHist >= 0 ? 'text-emerald-400' : 'text-red-400';

  const bollMid = (bollUpper + bollLower) / 2;
  const bollPos =
    closePrice > bollUpper
      ? 'Above upper band'
      : closePrice < bollLower
        ? 'Below lower band'
        : closePrice > bollMid
          ? 'Upper half'
          : 'Lower half';

  const timeframeLabel = analysis.daily ? 'Daily' : 'Hourly';

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-muted-foreground" />
            {label} Analysis
            <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground border-border">
              {timeframeLabel}
            </Badge>
          </span>
          <Badge variant="outline" className={`text-xs ${signalColor}`}>
            {d.overall_signal}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Signal score */}
        <div>
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Signal Score</span>
            <span className={`font-mono font-medium ${score >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {score > 0 ? '+' : ''}{score}
            </span>
          </div>
          <SignalScoreBar score={score} />
        </div>

        {/* RSI */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">RSI (14)</span>
          <span className={`font-mono font-medium ${rsiColor}`}>
            {rsi.toFixed(1)} — {rsiLabel}
          </span>
        </div>

        {/* SMA */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">vs SMA20</span>
            <span className={`font-mono font-medium ${priceVsSma20}`}>
              {closePrice > sma20 ? '▲' : '▼'} ${sma20.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">vs SMA50</span>
            <span className={`font-mono font-medium ${priceVsSma50}`}>
              {closePrice > sma50 ? '▲' : '▼'} ${sma50.toLocaleString()}
            </span>
          </div>
        </div>

        {/* MACD */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground">MACD</p>
            <p className={`font-mono font-medium ${macdColor}`}>{macdLine.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Signal</p>
            <p className="font-mono font-medium text-foreground">{macdSignal.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Histogram</p>
            <p className={`font-mono font-medium ${macdColor}`}>{macdHist.toFixed(2)}</p>
          </div>
        </div>

        {/* Bollinger */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Bollinger</span>
          <span className="text-muted-foreground font-mono">
            {bollLower.toLocaleString()} – {bollUpper.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Position</span>
          <span className="text-foreground">{bollPos}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export default function CryptoPage() {
  const [btcTicker, setBtcTicker] = useState<Ticker | null>(null);
  const [ethTicker, setEthTicker] = useState<Ticker | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Trade form
  const [tradeSymbol, setTradeSymbol] = useState('BTC/USDT');
  const [tradeAmount, setTradeAmount] = useState('');

  // DCA state
  const [dcaPlans, setDcaPlans] = useState<DcaPlan[]>([]);
  const [dcaPerformance, setDcaPerformance] = useState<DcaPerformance | null>(null);
  const [dcaLoading, setDcaLoading] = useState(false);
  const [showDcaForm, setShowDcaForm] = useState(false);
  const [newDcaSymbol, setNewDcaSymbol] = useState('BTC/USDT');
  const [newDcaAmount, setNewDcaAmount] = useState('');
  const [newDcaFrequency, setNewDcaFrequency] = useState('daily');

  // Technical analysis state
  const [btcAnalysis, setBtcAnalysis] = useState<TechnicalAnalysis | null>(null);
  const [ethAnalysis, setEthAnalysis] = useState<TechnicalAnalysis | null>(null);

  // Chart state
  const [chartRange, setChartRange] = useState<ChartRange>('30d');
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [btc, eth, port, hist] = await Promise.all([
        api.get<Ticker>('/crypto/ticker/BTC-USDT').then((r) => r.data),
        api.get<Ticker>('/crypto/ticker/ETH-USDT').then((r) => r.data),
        api.get<Portfolio>('/crypto/paper/portfolio').then((r) => r.data),
        api.get<PaperTrade[]>('/crypto/paper/history').then((r) => r.data),
      ]);
      setBtcTicker(btc);
      setEthTicker(eth);
      setPortfolio(port);
      setTrades(hist);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load crypto data');
    } finally {
      setLoading(false);
    }

    // DCA — non-blocking
    try {
      const [plans, perf] = await Promise.all([
        api.get<DcaPlan[]>('/crypto/dca/plans').then((r) => r.data),
        api.get<DcaPerformance>('/crypto/dca/performance').then((r) => r.data),
      ]);
      setDcaPlans(plans);
      setDcaPerformance(perf);
    } catch {
      // DCA endpoints optional — don't break page
    }

    // Technical analysis — non-blocking
    try {
      const [btcA, ethA] = await Promise.all([
        api.get<TechnicalAnalysis>('/crypto/analysis/BTC-USDT').then((r) => r.data),
        api.get<TechnicalAnalysis>('/crypto/analysis/ETH-USDT').then((r) => r.data),
      ]);
      setBtcAnalysis(btcA);
      setEthAnalysis(ethA);
    } catch {
      // Analysis endpoints optional — don't break page
    }
  }, []);

  const fetchChart = useCallback(
    async (range: ChartRange) => {
      setChartLoading(true);
      try {
        const limit = CHART_RANGE_LIMITS[range];
        const raw = await api
          .get<OhlcvBar[]>(`/crypto/ohlcv-history/BTC-USDT?timeframe=1d&limit=${limit}`)
          .then((r) => r.data);
        const points: ChartPoint[] = raw.map((bar) => ({
          date: new Date(bar.time).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          }),
          close: bar.close,
        }));
        setChartData(points);
      } catch {
        // Chart is optional — don't break page
      } finally {
        setChartLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    fetchChart(chartRange);
  }, [chartRange, fetchChart]);

  const executeTrade = async (type: 'buy' | 'sell') => {
    const amount = parseFloat(tradeAmount);
    if (!amount || amount <= 0) return;

    setTradeLoading(true);
    try {
      await api.post(`/crypto/paper/${type}`, {
        symbol: tradeSymbol,
        amount,
      });
      setTradeAmount('');
      await fetchData();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : err instanceof Error
            ? err.message
            : 'Trade failed';
      setError(msg ?? 'Trade failed');
    } finally {
      setTradeLoading(false);
    }
  };

  const createDcaPlan = async () => {
    const amount = parseFloat(newDcaAmount);
    if (!amount || amount <= 0) return;

    setDcaLoading(true);
    try {
      await api.post('/crypto/dca/create', {
        symbol: newDcaSymbol,
        amountUsdt: amount,
        frequency: newDcaFrequency,
      });
      setNewDcaAmount('');
      setShowDcaForm(false);
      const [plans, perf] = await Promise.all([
        api.get<DcaPlan[]>('/crypto/dca/plans').then((r) => r.data),
        api.get<DcaPerformance>('/crypto/dca/performance').then((r) => r.data),
      ]);
      setDcaPlans(plans);
      setDcaPerformance(perf);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : err instanceof Error
            ? err.message
            : 'Failed to create DCA plan';
      setError(msg ?? 'Failed to create DCA plan');
    } finally {
      setDcaLoading(false);
    }
  };

  const toggleDcaPlan = async (plan: DcaPlan) => {
    setDcaLoading(true);
    try {
      const action = plan.is_active ? 'pause' : 'resume';
      await api.put(`/crypto/dca/plans/${plan.id}/${action}`);
      const plans = await api.get<DcaPlan[]>('/crypto/dca/plans').then((r) => r.data);
      setDcaPlans(plans);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : err instanceof Error
            ? err.message
            : 'Failed to update DCA plan';
      setError(msg ?? 'Failed to update DCA plan');
    } finally {
      setDcaLoading(false);
    }
  };

  const deleteDcaPlan = async (id: number) => {
    setDcaLoading(true);
    try {
      await api.delete(`/crypto/dca/plans/${id}`);
      const [plans, perf] = await Promise.all([
        api.get<DcaPlan[]>('/crypto/dca/plans').then((r) => r.data),
        api.get<DcaPerformance>('/crypto/dca/performance').then((r) => r.data),
      ]);
      setDcaPlans(plans);
      setDcaPerformance(perf);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : err instanceof Error
            ? err.message
            : 'Failed to delete DCA plan';
      setError(msg ?? 'Failed to delete DCA plan');
    } finally {
      setDcaLoading(false);
    }
  };

  const formatUSD = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  const formatCrypto = (n: number) => {
    if (n >= 1) return n.toFixed(4);
    if (n >= 0.001) return n.toFixed(6);
    return n.toFixed(8);
  };

  const formatPnl = (n: number) => {
    const sign = n >= 0 ? '+' : '';
    return `${sign}${formatUSD(n)}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Bitcoin className="h-7 w-7 text-orange-500" />
            Crypto Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Shariah-compliant cryptocurrency paper trading
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs font-bold"
          >
            PAPER TRADING
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchData}
            className="text-muted-foreground"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-center gap-2 text-red-400 text-sm">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-xs underline">
            dismiss
          </button>
        </div>
      )}

      {/* Price Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { ticker: btcTicker, icon: Bitcoin, color: 'text-orange-500' },
          { ticker: ethTicker, icon: TrendingUp, color: 'text-blue-400' },
        ].map(({ ticker, icon: Icon, color }) =>
          ticker ? (
            <Card key={ticker.symbol} className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg bg-muted ${color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{ticker.symbol}</p>
                      <p className="text-xl font-bold text-foreground font-mono">
                        {formatUSD(ticker.price)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className={`flex items-center gap-1 ${ticker.changePct24h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                    >
                      {ticker.changePct24h >= 0 ? (
                        <ArrowUpRight className="h-4 w-4" />
                      ) : (
                        <ArrowDownRight className="h-4 w-4" />
                      )}
                      <span className="font-mono font-medium">
                        {ticker.changePct24h >= 0 ? '+' : ''}
                        {ticker.changePct24h.toFixed(2)}%
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Vol: {formatUSD(ticker.volume24h)}
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                      <Shield className="h-3 w-3 text-emerald-500" />
                      <span className="text-xs text-emerald-500">Halal</span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                  <span>H: {formatUSD(ticker.high24h)}</span>
                  <span>L: {formatUSD(ticker.low24h)}</span>
                </div>
              </CardContent>
            </Card>
          ) : null,
        )}
      </div>

      {/* Portfolio + Trade Form */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Portfolio */}
        <Card className="lg:col-span-2 bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Wallet className="h-4 w-4 text-muted-foreground" />
              Paper Portfolio
            </CardTitle>
          </CardHeader>
          <CardContent>
            {portfolio && (
              <>
                <p className="text-2xl font-bold text-foreground font-mono mb-4">
                  {formatUSD(portfolio.totalValueUSD)}
                </p>
                <div className="space-y-2">
                  {portfolio.holdings.map((h) => (
                    <div
                      key={h.asset}
                      className="flex items-center justify-between py-2 border-b border-border last:border-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{h.asset}</span>
                        <span className="text-xs text-muted-foreground font-mono">
                          {h.asset === 'USDT' ? '' : formatCrypto(h.amount)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono text-foreground">
                          {formatUSD(h.valueUSD)}
                        </span>
                        {h.asset !== 'USDT' && h.price > 0 && (
                          <p className="text-xs text-muted-foreground">
                            @ {formatUSD(h.price)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Trade Form */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Paper Trade</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Pair</label>
              <select
                value={tradeSymbol}
                onChange={(e) => setTradeSymbol(e.target.value)}
                className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm text-foreground"
              >
                <option value="BTC/USDT">BTC/USDT</option>
                <option value="ETH/USDT">ETH/USDT</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Amount ({tradeSymbol.split('/')[0]})
              </label>
              <Input
                type="number"
                step="any"
                min="0"
                placeholder="0.001"
                value={tradeAmount}
                onChange={(e) => setTradeAmount(e.target.value)}
                className="font-mono"
              />
            </div>
            {tradeAmount && btcTicker && ethTicker && (
              <p className="text-xs text-muted-foreground">
                ~{' '}
                {formatUSD(
                  parseFloat(tradeAmount) *
                    (tradeSymbol === 'BTC/USDT' ? btcTicker.price : ethTicker.price),
                )}
              </p>
            )}
            <div className="flex gap-2">
              <Button
                onClick={() => executeTrade('buy')}
                disabled={tradeLoading || !tradeAmount}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {tradeLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Buy'
                )}
              </Button>
              <Button
                onClick={() => executeTrade('sell')}
                disabled={tradeLoading || !tradeAmount}
                variant="destructive"
                className="flex-1"
              >
                {tradeLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Sell'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trade History */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Trade History</CardTitle>
        </CardHeader>
        <CardContent>
          {trades.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No paper trades yet. Place your first trade above.
            </p>
          ) : (
            <div className="space-y-1">
              <div className="grid grid-cols-5 gap-2 text-xs text-muted-foreground font-medium py-2 border-b border-border">
                <span>Time</span>
                <span>Type</span>
                <span>Pair</span>
                <span className="text-right">Amount</span>
                <span className="text-right">Total</span>
              </div>
              {[...trades].reverse().slice(0, 20).map((t) => (
                <div
                  key={t.id}
                  className="grid grid-cols-5 gap-2 text-sm py-2 border-b border-border/50 last:border-0"
                >
                  <span className="text-muted-foreground text-xs font-mono">
                    {new Date(t.timestamp).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span>
                    <Badge
                      variant="outline"
                      className={
                        t.type === 'BUY'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs'
                          : 'bg-red-500/10 text-red-400 border-red-500/30 text-xs'
                      }
                    >
                      {t.type}
                    </Badge>
                  </span>
                  <span className="text-foreground">{t.symbol}</span>
                  <span className="text-right font-mono text-foreground">
                    {formatCrypto(t.amount)}
                  </span>
                  <span className="text-right font-mono text-foreground">
                    {formatUSD(t.total)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── DCA Plans ──────────────────────────────────────────────────────── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              DCA Plans (Auto-Buy)
            </span>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs"
              >
                PAPER
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDcaForm((v) => !v)}
                className="h-7 px-2 text-muted-foreground"
              >
                <Plus className="h-3 w-3 mr-1" />
                <span className="text-xs">New Plan</span>
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Performance summary */}
          {dcaPerformance && dcaPerformance.totals.totalInvested > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-muted/40 border border-border">
              <div>
                <p className="text-xs text-muted-foreground">Total Invested</p>
                <p className="font-mono font-medium text-foreground text-sm">
                  {formatUSD(dcaPerformance.totals.totalInvested)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Current Value</p>
                <p className="font-mono font-medium text-foreground text-sm">
                  {formatUSD(dcaPerformance.totals.currentValue)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Unrealized P&L</p>
                <p
                  className={`font-mono font-medium text-sm ${dcaPerformance.totals.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                >
                  {formatPnl(dcaPerformance.totals.unrealizedPnl)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Return</p>
                <p
                  className={`font-mono font-medium text-sm ${dcaPerformance.totals.pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                >
                  {dcaPerformance.totals.pnlPct >= 0 ? '+' : ''}
                  {dcaPerformance.totals.pnlPct.toFixed(2)}%
                </p>
              </div>
            </div>
          )}

          {/* Empty state hint */}
          {dcaPlans.length > 0 && dcaPlans.every((p) => !p.last_execution) && (
            <p className="text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2">
              No DCA executions yet — first execution runs on Monday (weekly plans) or tomorrow (daily plans).
            </p>
          )}

          {/* Plan list */}
          {dcaPlans.length === 0 && !showDcaForm ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No DCA plans yet. Create one to start automated paper buying.
            </p>
          ) : (
            <div className="space-y-2">
              {dcaPlans.map((plan) => {
                const perfPlan = dcaPerformance?.plans.find((p) => p.id === plan.id);
                return (
                  <div
                    key={plan.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg border border-border bg-muted/20"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${plan.is_active ? 'bg-emerald-500' : 'bg-muted-foreground'}`}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-foreground text-sm">{plan.symbol}</span>
                          <Badge
                            variant="outline"
                            className="text-xs bg-muted text-muted-foreground border-border capitalize"
                          >
                            {plan.frequency}
                          </Badge>
                          <span className="font-mono text-xs text-muted-foreground">
                            {formatUSD(plan.amount_usdt)}/cycle
                          </span>
                        </div>
                        <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                          <span>Invested: {formatUSD(plan.total_invested)}</span>
                          <span>Avg cost: {plan.average_cost > 0 ? formatUSD(plan.average_cost) : '—'}</span>
                          {plan.last_execution && (
                            <span>
                              Last:{' '}
                              {new Date(plan.last_execution).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {perfPlan && perfPlan.total_invested > 0 && (
                        <span
                          className={`font-mono text-xs ${perfPlan.unrealized_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                        >
                          {formatPnl(perfPlan.unrealized_pnl)} ({perfPlan.pnl_pct >= 0 ? '+' : ''}
                          {perfPlan.pnl_pct.toFixed(2)}%)
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleDcaPlan(plan)}
                        disabled={dcaLoading}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                        title={plan.is_active ? 'Pause plan' : 'Resume plan'}
                      >
                        {plan.is_active ? (
                          <Pause className="h-3 w-3" />
                        ) : (
                          <Play className="h-3 w-3" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteDcaPlan(plan.id)}
                        disabled={dcaLoading}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                        title="Delete plan"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Create new plan form */}
          {showDcaForm && (
            <div className="border border-border rounded-lg p-4 bg-muted/20 space-y-3">
              <p className="text-xs font-medium text-foreground">New DCA Plan</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Pair</label>
                  <select
                    value={newDcaSymbol}
                    onChange={(e) => setNewDcaSymbol(e.target.value)}
                    className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm text-foreground"
                  >
                    <option value="BTC/USDT">BTC/USDT</option>
                    <option value="ETH/USDT">ETH/USDT</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Amount (USDT)</label>
                  <Input
                    type="number"
                    step="any"
                    min="1"
                    placeholder="100"
                    value={newDcaAmount}
                    onChange={(e) => setNewDcaAmount(e.target.value)}
                    className="font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Frequency</label>
                  <select
                    value={newDcaFrequency}
                    onChange={(e) => setNewDcaFrequency(e.target.value)}
                    className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm text-foreground"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={createDcaPlan}
                  disabled={dcaLoading || !newDcaAmount}
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {dcaLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Create Plan'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDcaForm(false)}
                  className="text-muted-foreground"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Technical Analysis ─────────────────────────────────────────────── */}
      {(btcAnalysis || ethAnalysis) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {btcAnalysis && <TechnicalCard analysis={btcAnalysis} label="BTC/USDT" />}
          {ethAnalysis && <TechnicalCard analysis={ethAnalysis} label="ETH/USDT" />}
        </div>
      )}

      {/* ── Price Chart ────────────────────────────────────────────────────── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <span className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
              BTC/USDT Price Chart
            </span>
            <div className="flex gap-1">
              {(['7d', '30d', '90d'] as ChartRange[]).map((range) => (
                <Button
                  key={range}
                  variant={chartRange === range ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setChartRange(range)}
                  className="h-7 px-2 text-xs"
                >
                  {range}
                </Button>
              ))}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chartLoading ? (
            <div className="h-64 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-64 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">No chart data available.</p>
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="btcGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    width={60}
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: 'hsl(var(--foreground))',
                    }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(value: any) => [
                      typeof value === 'number' ? formatUSD(value as number) : String(value ?? ''),
                      'Close',
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="close"
                    stroke="#22c55e"
                    strokeWidth={2}
                    fill="url(#btcGradient)"
                    dot={false}
                    activeDot={{ r: 4, fill: '#22c55e' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <DcaPanel />
    </div>
  );
}
