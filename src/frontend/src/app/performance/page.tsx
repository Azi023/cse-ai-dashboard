'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import {
  signalTrackingApi,
  strategyEngineApi,
  type PerformanceStats,
  type SignalRecordData,
  type StrategyBacktestResult,
} from '@/lib/api';
import { Target, TrendingUp, TrendingDown, Minus, RefreshCw, Trophy, AlertTriangle, Zap } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

function StatCard({
  label,
  value,
  suffix,
  color,
}: {
  label: string;
  value: string | number | null;
  suffix?: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-2xl font-bold mt-1', color)}>
        {value ?? '--'}
        {suffix && <span className="text-sm font-normal ml-0.5">{suffix}</span>}
      </p>
    </div>
  );
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatShortDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

export default function PerformancePage() {
  const [stats, setStats] = useState<PerformanceStats | null>(null);
  const [signals, setSignals] = useState<SignalRecordData[]>([]);
  const [backtestResults, setBacktestResults] = useState<StrategyBacktestResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    Promise.allSettled([
      signalTrackingApi.getPerformance(),
      signalTrackingApi.getSignals(200),
    ]).then(([statsRes, signalsRes]) => {
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
      if (signalsRes.status === 'fulfilled') setSignals(signalsRes.value.data);
      setLoading(false);
    });
    strategyEngineApi.getBacktestResults().then(res => setBacktestResults(res.data.data)).catch(() => {});
  }, []);

  const handleCheckOutcomes = async () => {
    setChecking(true);
    try {
      await signalTrackingApi.checkOutcomes();
      const [statsRes, signalsRes] = await Promise.allSettled([
        signalTrackingApi.getPerformance(),
        signalTrackingApi.getSignals(200),
      ]);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
      if (signalsRes.status === 'fulfilled') setSignals(signalsRes.value.data);
    } catch {
      // silent
    } finally {
      setChecking(false);
    }
  };

  // Build cumulative return chart data from BUY signals with 7d return
  const cumulativeChartData = useMemo(() => {
    const buySignals = signals
      .filter((s) => s.direction === 'BUY' && s.return_7d != null)
      .slice()
      .sort((a, b) => new Date(a.signal_date).getTime() - new Date(b.signal_date).getTime());

    let cumulative = 0;
    return buySignals.map((s) => {
      cumulative += Number(s.return_7d ?? 0);
      return {
        date: formatShortDate(s.signal_date),
        cumulative: Math.round(cumulative * 100) / 100,
        symbol: s.symbol,
      };
    });
  }, [signals]);

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">AI Signal Performance</h2>
          <p className="text-muted-foreground">
            Track accuracy and returns of AI trading signals
          </p>
        </div>
        <button
          onClick={handleCheckOutcomes}
          disabled={checking}
          className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn('h-4 w-4', checking && 'animate-spin')} />
          Check Outcomes
        </button>
      </div>

      {/* Strategy Backtest Results */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">Strategy Engine — Backtest Validation</CardTitle>
            </div>
            <Badge variant="outline" className="text-xs">
              Activated March 28, 2026
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {backtestResults.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              No backtest results yet. Run backtests from the{' '}
              <a href="/backtest" className="text-primary hover:underline">Backtest</a> page.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Strategy</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground">Status</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Trades</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Win Rate</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Avg Return</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Sharpe</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Max DD</th>
                  </tr>
                </thead>
                <tbody>
                  {backtestResults.map((r) => (
                    <tr key={r.strategy_id} className="border-b hover:bg-muted/20">
                      <td className="px-3 py-2 font-medium text-sm">{r.strategy_name}</td>
                      <td className="px-3 py-2 text-center">
                        <Badge
                          variant="outline"
                          className={r.is_active
                            ? 'text-[10px] text-emerald-500 border-emerald-600/30 bg-emerald-500/10'
                            : 'text-[10px] text-muted-foreground border-muted-foreground/30'
                          }
                        >
                          {r.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right text-sm">{r.total_trades}</td>
                      <td className={`px-3 py-2 text-right text-sm font-medium ${
                        Number(r.win_rate) >= 60 ? 'text-emerald-500' :
                        Number(r.win_rate) >= 50 ? 'text-yellow-500' : 'text-red-500'
                      }`}>
                        {r.total_trades > 0 ? `${Number(r.win_rate).toFixed(1)}%` : '—'}
                      </td>
                      <td className={`px-3 py-2 text-right text-sm ${Number(r.avg_return_pct) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {r.total_trades > 0 ? `${Number(r.avg_return_pct) >= 0 ? '+' : ''}${Number(r.avg_return_pct).toFixed(2)}%` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-sm text-muted-foreground">
                        {r.sharpe_ratio != null ? Number(r.sharpe_ratio).toFixed(2) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-sm text-red-500">
                        {r.total_trades > 0 ? `${Number(r.max_drawdown).toFixed(2)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-3">
            Win rate threshold: 50% minimum to activate. Only validated strategies generate live signals.
          </p>
        </CardContent>
      </Card>

      {/* Onboarding message when no signals exist */}
      {!loading && signals.length === 0 && (
        <Card>
          <CardContent className="py-10 space-y-4">
            <div className="text-center space-y-3">
              <div className="rounded-full bg-primary/10 p-4 w-16 h-16 flex items-center justify-center mx-auto">
                <Target className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">Your AI Signal History</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                This page automatically tracks every stock suggestion the AI makes. Once signals are generated on the Signals page, they&apos;ll appear here with their outcomes after 7 and 30 days. No action needed — tracking is fully automatic.
              </p>
            </div>
            <details className="max-w-md mx-auto">
              <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground text-center">
                How does this work?
              </summary>
              <div className="mt-3 rounded-lg border p-4 text-sm text-muted-foreground space-y-2">
                <p><strong>Win Rate</strong> = % of signals where the stock moved in the predicted direction within the timeframe.</p>
                <p><strong>7-day signals:</strong> Evaluated after 7 trading days. Did the BUY signal go up? Did the SELL signal go down?</p>
                <p><strong>30-day signals:</strong> Evaluated after 30 trading days for a longer-term view of AI accuracy.</p>
                <p>The system checks prices daily and automatically marks signals as won or lost — you don&apos;t need to do anything.</p>
              </div>
            </details>
            <p className="text-xs text-muted-foreground text-center">
              Go to <a href="/signals" className="text-primary hover:underline">Signals</a> to generate your first AI signals.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Performance Summary Cards */}
      {stats && stats.totalSignals > 0 && (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Total Signals" value={stats.totalSignals} />
          <StatCard label="Completed" value={stats.completedSignals} />
          <StatCard label="Pending" value={stats.pendingSignals} />
          <StatCard
            label="Win Rate (7d)"
            value={stats.winRate7d}
            suffix="%"
            color={stats.winRate7d != null && stats.winRate7d >= 50 ? 'text-green-500' : 'text-red-500'}
          />
          <StatCard
            label="Win Rate (30d)"
            value={stats.winRate30d}
            suffix="%"
            color={stats.winRate30d != null && stats.winRate30d >= 50 ? 'text-green-500' : 'text-red-500'}
          />
          <StatCard
            label="Avg Return (30d)"
            value={stats.avgReturn30d != null ? `${stats.avgReturn30d > 0 ? '+' : ''}${stats.avgReturn30d}` : null}
            suffix="%"
            color={stats.avgReturn30d != null && stats.avgReturn30d >= 0 ? 'text-green-500' : 'text-red-500'}
          />
        </div>
      )}

      {/* Confidence + Direction Breakdown */}
      {stats && stats.totalSignals > 0 && (
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
          {/* By Confidence */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Performance by Confidence Level</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 grid-cols-3">
                {(['HIGH', 'MEDIUM', 'LOW'] as const).map((conf) => {
                  const data = stats.byConfidence[conf];
                  return (
                    <div key={conf} className="rounded-lg border p-3 text-center">
                      <Badge
                        variant="outline"
                        className={cn(
                          'mb-2',
                          conf === 'HIGH'
                            ? 'border-green-600 text-green-500'
                            : conf === 'MEDIUM'
                              ? 'border-yellow-600 text-yellow-500'
                              : 'border-muted-foreground/40 text-muted-foreground',
                        )}
                      >
                        {conf}
                      </Badge>
                      <p className="text-2xl font-bold">{data.count}</p>
                      <p className="text-xs text-muted-foreground">signals</p>
                      {data.winRate != null && (
                        <p className={cn('text-sm font-medium mt-1', data.winRate >= 50 ? 'text-green-500' : 'text-red-500')}>
                          {data.winRate}% win rate
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* By Direction */}
          {stats.byDirection && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Performance by Signal Type</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 grid-cols-3">
                  {(['BUY', 'HOLD', 'SELL'] as const).map((dir) => {
                    const data = stats.byDirection[dir];
                    return (
                      <div key={dir} className="rounded-lg border p-3 text-center">
                        <div className="flex items-center justify-center mb-2">
                          {dir === 'BUY' ? (
                            <TrendingUp className="h-4 w-4 text-green-500" />
                          ) : dir === 'SELL' ? (
                            <TrendingDown className="h-4 w-4 text-red-500" />
                          ) : (
                            <Minus className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className={cn('ml-1 text-xs font-semibold',
                            dir === 'BUY' ? 'text-green-500' : dir === 'SELL' ? 'text-red-500' : 'text-muted-foreground'
                          )}>{dir}</span>
                        </div>
                        <p className="text-2xl font-bold">{data.count}</p>
                        <p className="text-xs text-muted-foreground">signals</p>
                        {data.winRate != null && (
                          <p className={cn('text-sm font-medium mt-1', data.winRate >= 50 ? 'text-green-500' : 'text-red-500')}>
                            {data.winRate}% win rate
                          </p>
                        )}
                        {data.avgReturn != null && (
                          <p className={cn('text-xs mt-0.5', data.avgReturn >= 0 ? 'text-green-400' : 'text-red-400')}>
                            avg {data.avgReturn > 0 ? '+' : ''}{data.avgReturn}%
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Best & Worst Signals */}
      {stats && (stats.bestSignal || stats.worstSignal) && (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          {stats.bestSignal && (
            <Card className="border-green-600/30">
              <CardContent className="pt-4 pb-4 flex items-center gap-4">
                <div className="rounded-full bg-green-500/10 p-2.5">
                  <Trophy className="h-5 w-5 text-green-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Best Signal</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Link href={`/stocks/${stats.bestSignal.symbol}`} className="font-semibold text-primary hover:underline">
                      {stats.bestSignal.symbol}
                    </Link>
                    <Badge variant="outline" className="text-[10px] h-4 px-1 text-green-500 border-green-600/40">
                      {stats.bestSignal.direction}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{formatDate(stats.bestSignal.signal_date)}</p>
                </div>
                <p className="text-xl font-bold text-green-500">
                  +{Number(stats.bestSignal.return_30d).toFixed(2)}%
                </p>
              </CardContent>
            </Card>
          )}
          {stats.worstSignal && stats.worstSignal.symbol !== stats.bestSignal?.symbol && (
            <Card className="border-red-600/30">
              <CardContent className="pt-4 pb-4 flex items-center gap-4">
                <div className="rounded-full bg-red-500/10 p-2.5">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Worst Signal</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Link href={`/stocks/${stats.worstSignal.symbol}`} className="font-semibold text-primary hover:underline">
                      {stats.worstSignal.symbol}
                    </Link>
                    <Badge variant="outline" className="text-[10px] h-4 px-1 text-red-500 border-red-600/40">
                      {stats.worstSignal.direction}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{formatDate(stats.worstSignal.signal_date)}</p>
                </div>
                <p className="text-xl font-bold text-red-500">
                  {Number(stats.worstSignal.return_30d).toFixed(2)}%
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Cumulative BUY Return Chart */}
      {cumulativeChartData.length >= 2 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Cumulative Return — Following All BUY Signals (7-day)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={cumulativeChartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                  tickFormatter={(v) => `${v.toFixed(1)}%`}
                />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                  formatter={(v: unknown, _name: unknown, props: { payload?: { symbol?: string } }) => [
                    `${Number(v).toFixed(2)}%`,
                    props.payload?.symbol ?? 'Cumulative',
                  ]}
                />
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 2" />
                <Line
                  type="monotone"
                  dataKey="cumulative"
                  name="Cumulative Return"
                  stroke="#3B82F6"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Sum of 7-day returns from all BUY signals in order. Assumes equal allocation to each signal.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Signal History */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm">Signal History</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 rounded bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : signals.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No signals recorded yet. AI signals will be automatically tracked when generated.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Date</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Symbol</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Signal</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Entry</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">7d</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">14d</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">30d</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {signals.map((signal) => (
                    <tr key={signal.id} className="border-b hover:bg-muted/20">
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {formatDate(signal.signal_date)}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/stocks/${signal.symbol}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {signal.symbol}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          {signal.direction === 'BUY' ? (
                            <TrendingUp className="h-3 w-3 text-green-500" />
                          ) : signal.direction === 'SELL' ? (
                            <TrendingDown className="h-3 w-3 text-red-500" />
                          ) : (
                            <Minus className="h-3 w-3 text-muted-foreground" />
                          )}
                          <span className="text-xs">{signal.direction}</span>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] h-4 px-1',
                              signal.confidence === 'HIGH'
                                ? 'text-green-500'
                                : signal.confidence === 'MEDIUM'
                                  ? 'text-yellow-500'
                                  : 'text-muted-foreground',
                            )}
                          >
                            {signal.confidence}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        Rs. {Number(signal.price_at_signal).toFixed(2)}
                      </td>
                      {(['return_7d', 'return_14d', 'return_30d'] as const).map((field) => {
                        const val = signal[field];
                        return (
                          <td
                            key={field}
                            className={cn(
                              'px-3 py-2 text-right text-xs',
                              val != null && val > 0 ? 'text-green-500' : val != null && val < 0 ? 'text-red-500' : 'text-muted-foreground',
                            )}
                          >
                            {val != null ? `${val > 0 ? '+' : ''}${Number(val).toFixed(2)}%` : '--'}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-center">
                        <Badge
                          variant={
                            signal.outcome === 'win'
                              ? 'default'
                              : signal.outcome === 'loss'
                                ? 'destructive'
                                : 'secondary'
                          }
                          className={cn(
                            'text-[10px]',
                            signal.outcome === 'win' && 'bg-green-600',
                          )}
                        >
                          {signal.outcome}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
