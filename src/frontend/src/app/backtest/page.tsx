'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  backtestApi,
  strategyEngineApi,
  type BacktestResult,
  type BacktestStrategy,
  type StrategyBacktestResult,
} from '@/lib/api';
import { FlaskConical, TrendingUp, TrendingDown, Loader2, AlertCircle, Info, Activity, ChevronDown, ChevronRight, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { safeNum } from '@/lib/format';

function StatBox({
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
    <div className="rounded-lg border p-3 text-center">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={cn('text-lg font-bold mt-0.5', color)}>
        {value ?? '--'}
        {suffix && <span className="text-xs font-normal ml-0.5">{suffix}</span>}
      </p>
    </div>
  );
}

export default function BacktestPage() {
  const [strategies, setStrategies] = useState<BacktestStrategy[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [compliantChips, setCompliantChips] = useState<string[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState('RSI_OVERSOLD');
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [symbolSearch, setSymbolSearch] = useState('');
  const [capital, setCapital] = useState(10000);
  const [days, setDays] = useState(365);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Strategy Engine validation state
  const [engineResults, setEngineResults] = useState<StrategyBacktestResult[]>([]);
  const [engineLoading, setEngineLoading] = useState(false);
  const [runningBacktests, setRunningBacktests] = useState(false);
  const [expandedStrategy, setExpandedStrategy] = useState<string | null>(null);

  useEffect(() => {
    Promise.allSettled([
      backtestApi.getStrategies(),
      backtestApi.getSymbols(),
      backtestApi.getCompliantSymbols(),
      strategyEngineApi.getBacktestResults(),
    ]).then(([stratRes, symRes, compliantRes, engineRes]) => {
      if (stratRes.status === 'fulfilled') setStrategies(stratRes.value.data);
      if (symRes.status === 'fulfilled') {
        setSymbols(symRes.value.data);
        if (symRes.value.data.length > 0) setSelectedSymbol(symRes.value.data[0]);
      }
      if (compliantRes.status === 'fulfilled' && compliantRes.value.data.length > 0) {
        setCompliantChips(compliantRes.value.data);
      }
      if (engineRes.status === 'fulfilled') {
        setEngineResults(engineRes.value.data.data ?? []);
      }
      setInitialLoading(false);
    });
  }, []);

  const handleRunEngineBacktests = async () => {
    setRunningBacktests(true);
    try {
      await strategyEngineApi.runBacktests();
      const res = await strategyEngineApi.getBacktestResults();
      setEngineResults(res.data.data ?? []);
    } catch {
      // ignore
    }
    setRunningBacktests(false);
  };

  const runBacktest = async () => {
    if (!selectedSymbol) return;
    setLoading(true);
    try {
      const res = await backtestApi.run({
        strategy: selectedStrategy,
        symbol: selectedSymbol,
        days,
        capital,
      });
      setResult(res.data);
    } catch {
      setResult(null);
    }
    setLoading(false);
  };

  const filteredSymbols = symbolSearch
    ? symbols.filter((s) => s.toLowerCase().includes(symbolSearch.toLowerCase()))
    : symbols;

  const selectedStrategyInfo = strategies.find((s) => s.id === selectedStrategy);

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-primary" />
          Strategy Backtester
        </h2>
        <p className="text-muted-foreground text-sm">
          Test trading strategies against historical CSE price data
        </p>
      </div>

      {/* Strategy Engine Validation */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">Strategy Engine — Backtest Validation</CardTitle>
            </div>
            <button
              onClick={handleRunEngineBacktests}
              disabled={runningBacktests}
              className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/30 disabled:opacity-50"
            >
              {runningBacktests ? (
                <><Loader2 className="h-3 w-3 animate-spin" />Running all 5 strategies...</>
              ) : (
                <><Play className="h-3 w-3" />Run Backtests</>
              )}
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Validates each strategy against 62,671 rows of real historical data. Only strategies with ≥50% win rate go live.
          </p>
        </CardHeader>
        <CardContent>
          {engineLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading results...
            </div>
          ) : engineResults.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4">
              No backtest results yet. Click &ldquo;Run Backtests&rdquo; to validate all 5 strategies against historical data.
            </div>
          ) : (
            <div className="space-y-2">
              {/* Summary table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-2 pr-4 font-medium">Strategy</th>
                      <th className="text-right py-2 px-2 font-medium">Trades</th>
                      <th className="text-right py-2 px-2 font-medium">Win Rate</th>
                      <th className="text-right py-2 px-2 font-medium">Avg Return</th>
                      <th className="text-right py-2 px-2 font-medium">Max DD</th>
                      <th className="text-right py-2 px-2 font-medium">Sharpe</th>
                      <th className="text-right py-2 pl-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {engineResults.map((r) => (
                      <>
                        <tr
                          key={r.strategy_id}
                          className="border-b border-muted/30 hover:bg-muted/10 cursor-pointer"
                          onClick={() =>
                            setExpandedStrategy(
                              expandedStrategy === r.strategy_id ? null : r.strategy_id,
                            )
                          }
                        >
                          <td className="py-2.5 pr-4">
                            <div className="flex items-center gap-1.5">
                              {expandedStrategy === r.strategy_id ? (
                                <ChevronDown className="h-3 w-3 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                              )}
                              <span className="font-medium">{r.strategy_name}</span>
                            </div>
                          </td>
                          <td className="text-right py-2.5 px-2 text-muted-foreground">
                            {r.total_trades}
                          </td>
                          <td className="text-right py-2.5 px-2">
                            <span
                              className={cn(
                                'font-semibold',
                                Number(r.win_rate) >= 60
                                  ? 'text-green-400'
                                  : Number(r.win_rate) >= 50
                                    ? 'text-yellow-400'
                                    : 'text-red-400',
                              )}
                            >
                              {safeNum(r.win_rate).toFixed(1)}%
                            </span>
                          </td>
                          <td className="text-right py-2.5 px-2">
                            <span
                              className={
                                Number(r.avg_return_pct) >= 0 ? 'text-green-400' : 'text-red-400'
                              }
                            >
                              {Number(r.avg_return_pct) >= 0 ? '+' : ''}
                              {safeNum(r.avg_return_pct).toFixed(1)}%
                            </span>
                          </td>
                          <td className="text-right py-2.5 px-2 text-red-400/80">
                            -{safeNum(r.max_drawdown).toFixed(1)}%
                          </td>
                          <td className="text-right py-2.5 px-2 text-muted-foreground">
                            {r.sharpe_ratio !== null ? safeNum(r.sharpe_ratio).toFixed(2) : '—'}
                          </td>
                          <td className="text-right py-2.5 pl-2">
                            <Badge
                              variant={r.is_active ? 'default' : 'secondary'}
                              className={cn(
                                'text-[10px]',
                                r.is_active
                                  ? 'bg-green-500/20 text-green-400 border-green-500/30'
                                  : 'bg-muted/50 text-muted-foreground',
                              )}
                            >
                              {r.is_active ? 'ACTIVE' : 'INACTIVE'}
                            </Badge>
                          </td>
                        </tr>
                        {expandedStrategy === r.strategy_id && (
                          <tr key={`${r.strategy_id}-expand`} className="bg-muted/5">
                            <td colSpan={7} className="px-6 py-3">
                              {r.notes && (
                                <p className="text-xs text-muted-foreground mb-2">{r.notes}</p>
                              )}
                              {r.trades_detail && r.trades_detail.length > 0 ? (
                                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                                  <table className="w-full text-[11px]">
                                    <thead className="sticky top-0 bg-background">
                                      <tr className="text-muted-foreground border-b">
                                        <th className="text-left py-1.5 pr-3">Symbol</th>
                                        <th className="text-left py-1.5 pr-3">Entry Date</th>
                                        <th className="text-right py-1.5 px-2">Entry</th>
                                        <th className="text-right py-1.5 px-2">Exit</th>
                                        <th className="text-right py-1.5 px-2">Return</th>
                                        <th className="text-right py-1.5 px-2">Days</th>
                                        <th className="text-left py-1.5 pl-2">Exit Reason</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {r.trades_detail.slice(0, 50).map((t, idx) => (
                                        <tr
                                          key={idx}
                                          className="border-b border-muted/20 hover:bg-muted/10"
                                        >
                                          <td className="py-1.5 pr-3 font-medium">{t.symbol}</td>
                                          <td className="py-1.5 pr-3 text-muted-foreground">
                                            {t.entry_date}
                                          </td>
                                          <td className="text-right py-1.5 px-2">
                                            {safeNum(t.entry_price).toFixed(2)}
                                          </td>
                                          <td className="text-right py-1.5 px-2">
                                            {safeNum(t.exit_price).toFixed(2)}
                                          </td>
                                          <td
                                            className={cn(
                                              'text-right py-1.5 px-2 font-semibold',
                                              t.return_pct >= 0 ? 'text-green-400' : 'text-red-400',
                                            )}
                                          >
                                            {t.return_pct >= 0 ? '+' : ''}
                                            {safeNum(t.return_pct).toFixed(1)}%
                                          </td>
                                          <td className="text-right py-1.5 px-2 text-muted-foreground">
                                            {t.hold_days}d
                                          </td>
                                          <td className="py-1.5 pl-2 text-muted-foreground truncate max-w-[200px]">
                                            {t.exit_reason}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">
                                  No individual trade data available for this strategy.
                                </p>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-muted-foreground pt-1">
                Backtested on historical CSE price data. Active = win rate ≥ 50%. Only active strategies generate live signals.
                {engineResults[0]?.period_start && (
                  <span> Data period: {engineResults[0].period_start} to {engineResults[0].period_end}.</span>
                )}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configuration */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Strategy selection */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {strategies.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedStrategy(s.id)}
                className={cn(
                  'rounded-lg border p-3 text-left transition-colors',
                  selectedStrategy === s.id
                    ? 'border-primary bg-primary/5'
                    : 'hover:bg-muted/30',
                )}
              >
                <p className="font-medium text-sm">{s.name}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.description}</p>
              </button>
            ))}
          </div>

          {/* Quick-select: Shariah-compliant stocks with sufficient price history */}
          <div>
            <label className="text-xs text-muted-foreground block mb-2">
              Quick Select — Shariah Compliant (with price history)
            </label>
            <div className="flex flex-wrap gap-2">
              {initialLoading ? (
                <span className="text-xs text-muted-foreground">Loading compliant stocks...</span>
              ) : compliantChips.length === 0 ? (
                <span className="text-xs text-muted-foreground">No compliant stocks with sufficient data yet</span>
              ) : (
                compliantChips.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSelectedSymbol(s)}
                    className={cn(
                      'rounded-md border px-3 py-1 text-xs font-medium transition-colors',
                      selectedSymbol === s
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'hover:bg-muted/50 text-muted-foreground',
                    )}
                  >
                    {s.replace('.N0000', '')}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Parameters */}
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Symbol</label>
              <input
                type="text"
                value={symbolSearch}
                onChange={(e) => setSymbolSearch(e.target.value)}
                placeholder="Search symbol..."
                className="w-full rounded-md border bg-background px-3 py-2 text-sm mb-1"
              />
              <select
                value={selectedSymbol}
                onChange={(e) => setSelectedSymbol(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                size={filteredSymbols.length > 5 ? 5 : undefined}
              >
                {initialLoading ? (
                  <option>Loading...</option>
                ) : filteredSymbols.length === 0 ? (
                  <option disabled>No symbols found</option>
                ) : (
                  filteredSymbols.map((s) => (
                    <option key={s} value={s}>{s.replace('.N0000', '')} — {s}</option>
                  ))
                )}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Capital (LKR)</label>
              <input
                type="number"
                value={capital}
                onChange={(e) => setCapital(parseInt(e.target.value) || 10000)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Days</label>
              <select
                value={days}
                onChange={(e) => setDays(parseInt(e.target.value))}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value={90}>90 days</option>
                <option value={180}>180 days</option>
                <option value={365}>1 year</option>
                <option value={730}>2 years</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={runBacktest}
                disabled={loading || !selectedSymbol}
                className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  'Run Backtest'
                )}
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {result && result.error && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="flex items-start gap-3 pt-4">
            <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
            <p className="text-sm text-yellow-200">{result.errorMessage}</p>
          </CardContent>
        </Card>
      )}
      {result && !result.error && (
        <>
          {/* Summary Stats */}
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-4">
            <StatBox
              label="Final Capital"
              value={`LKR ${safeNum(result.finalCapital).toLocaleString()}`}
              color={result.totalReturn >= 0 ? 'text-green-500' : 'text-red-500'}
            />
            <StatBox
              label="Total Return"
              value={`${result.totalReturnPercent > 0 ? '+' : ''}${result.totalReturnPercent}`}
              suffix="%"
              color={result.totalReturnPercent >= 0 ? 'text-green-500' : 'text-red-500'}
            />
            <StatBox label="Win Rate" value={result.winRate} suffix="%" />
            <StatBox label="Trades" value={result.totalTrades} />
          </div>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
            <StatBox
              label="Max Drawdown"
              value={result.maxDrawdown}
              suffix="%"
              color="text-red-500"
            />
            <StatBox
              label="Sharpe Ratio"
              value={result.sharpeRatio ?? '--'}
              color={
                result.sharpeRatio == null ? undefined
                  : result.sharpeRatio >= 1 ? 'text-green-500'
                  : result.sharpeRatio >= 0 ? 'text-yellow-500'
                  : 'text-red-500'
              }
            />
            <StatBox
              label="Buy & Hold"
              value={`${result.buyAndHoldReturn > 0 ? '+' : ''}${result.buyAndHoldReturn}`}
              suffix="%"
              color={result.buyAndHoldReturn >= 0 ? 'text-green-500' : 'text-red-500'}
            />
          </div>

          {/* Strategy vs Buy & Hold comparison */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Strategy vs Buy & Hold</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground w-28">Strategy</span>
                  <div className="flex-1 bg-muted/30 rounded-full h-6 overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full flex items-center justify-end pr-2',
                        result.totalReturnPercent >= 0 ? 'bg-green-500/30' : 'bg-red-500/30',
                      )}
                      style={{
                        width: `${Math.min(Math.max(Math.abs(result.totalReturnPercent) + 10, 10), 100)}%`,
                      }}
                    >
                      <span className="text-xs font-medium">
                        {result.totalReturnPercent > 0 ? '+' : ''}
                        {result.totalReturnPercent}%
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground w-28">Buy & Hold</span>
                  <div className="flex-1 bg-muted/30 rounded-full h-6 overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full flex items-center justify-end pr-2',
                        result.buyAndHoldReturn >= 0 ? 'bg-blue-500/30' : 'bg-red-500/30',
                      )}
                      style={{
                        width: `${Math.min(Math.max(Math.abs(result.buyAndHoldReturn) + 10, 10), 100)}%`,
                      }}
                    >
                      <span className="text-xs font-medium">
                        {result.buyAndHoldReturn > 0 ? '+' : ''}
                        {result.buyAndHoldReturn}%
                      </span>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {result.totalReturnPercent > result.buyAndHoldReturn
                    ? `Strategy outperformed buy & hold by ${(result.totalReturnPercent - result.buyAndHoldReturn).toFixed(1)}%.`
                    : result.totalReturnPercent < result.buyAndHoldReturn
                      ? `Buy & hold outperformed the strategy by ${(result.buyAndHoldReturn - result.totalReturnPercent).toFixed(1)}%.`
                      : 'Strategy matched buy & hold performance.'}
                  {result.sharpeRatio != null && (
                    <span className="ml-2">
                      Sharpe Ratio {result.sharpeRatio}
                      {result.sharpeRatio >= 1 ? ' — good risk-adjusted return.' : result.sharpeRatio >= 0 ? ' — modest risk-adjusted return.' : ' — returns did not compensate for risk.'}
                    </span>
                  )}
                  {result.sharpeNote && (
                    <span className="block mt-1 text-yellow-400/80">{result.sharpeNote}</span>
                  )}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Trade History */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                Trade History ({result.trades.length} trades)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {result.trades.length === 0 ? (
                <div className="space-y-3 py-2">
                  <div className="flex items-start gap-3 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                    <Info className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                    <div className="text-sm space-y-1">
                      <p className="font-medium text-blue-200">No trades triggered</p>
                      <p className="text-muted-foreground">
                        {result.strategy === 'RSI_OVERSOLD' &&
                          `The RSI strategy looks for RSI < 30 (oversold). ${result.symbol} never reached oversold conditions during this period — it was in a sustained trend throughout.`}
                        {result.strategy === 'SMA_CROSSOVER' &&
                          `The Trend Following strategy looks for a golden cross (20-day MA crossing above 50-day MA). No trend reversal was detected for ${result.symbol} during this period.`}
                        {result.strategy === 'VALUE_SCREEN' &&
                          `The Buy Below SMA50 strategy looks for the price to drop 10%+ below its 50-day average. ${result.symbol} didn't dip that far during this period.`}
                        {!['RSI_OVERSOLD', 'SMA_CROSSOVER', 'VALUE_SCREEN'].includes(result.strategy) &&
                          'The strategy criteria were not met during this period.'}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Buy & hold comparison: if you had bought and held {result.symbol} throughout, return would have been{' '}
                    <span className={result.buyAndHoldReturn >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {result.buyAndHoldReturn > 0 ? '+' : ''}{result.buyAndHoldReturn}%
                    </span>
                    . Try a different time window or stock to find more signal activity.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Date</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Type</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Price</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Qty</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.trades.map((trade, i) => (
                        <tr key={i} className="border-b hover:bg-muted/20">
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {trade.date}
                          </td>
                          <td className="px-3 py-2">
                            <Badge
                              variant={trade.type === 'BUY' ? 'default' : 'destructive'}
                              className={cn(
                                'text-[10px]',
                                trade.type === 'BUY' && 'bg-green-600',
                              )}
                            >
                              {trade.type}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {safeNum(trade.price).toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-right">{trade.quantity}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground max-w-[300px] truncate">
                            {trade.reason}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Backtesting uses historical data and does not account for slippage, brokerage costs, or
        market impact. Past performance does not guarantee future results.
      </p>
    </div>
  );
}
