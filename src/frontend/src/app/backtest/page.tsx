'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  backtestApi,
  type BacktestResult,
  type BacktestStrategy,
} from '@/lib/api';
import { FlaskConical, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const [selectedStrategy, setSelectedStrategy] = useState('RSI_OVERSOLD');
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [symbolSearch, setSymbolSearch] = useState('');
  const [capital, setCapital] = useState(10000);
  const [days, setDays] = useState(365);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      backtestApi.getStrategies(),
      backtestApi.getSymbols(),
    ]).then(([stratRes, symRes]) => {
      if (stratRes.status === 'fulfilled') setStrategies(stratRes.value.data);
      if (symRes.status === 'fulfilled') {
        setSymbols(symRes.value.data);
        if (symRes.value.data.length > 0) setSelectedSymbol(symRes.value.data[0]);
      }
      setInitialLoading(false);
    });
  }, []);

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

          {/* Quick-select popular stocks */}
          <div>
            <label className="text-xs text-muted-foreground block mb-2">Popular Stocks</label>
            <div className="flex flex-wrap gap-2">
              {['JKH.N0000', 'SAMP.N0000', 'COMB.N0000', 'HNB.N0000', 'DIAL.N0000'].map((s) => (
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
              ))}
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
      {result && (
        <>
          {/* Summary Stats */}
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            <StatBox
              label="Final Capital"
              value={`LKR ${result.finalCapital.toLocaleString()}`}
              color={result.totalReturn >= 0 ? 'text-green-500' : 'text-red-500'}
            />
            <StatBox
              label="Total Return"
              value={`${result.totalReturnPercent > 0 ? '+' : ''}${result.totalReturnPercent}`}
              suffix="%"
              color={result.totalReturnPercent >= 0 ? 'text-green-500' : 'text-red-500'}
            />
            <StatBox label="Win Rate" value={result.winRate} suffix="%" />
            <StatBox label="Total Trades" value={result.totalTrades} />
            <StatBox
              label="Max Drawdown"
              value={result.maxDrawdown}
              suffix="%"
              color="text-red-500"
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
                    ? 'Strategy outperformed buy & hold.'
                    : result.totalReturnPercent < result.buyAndHoldReturn
                      ? 'Buy & hold outperformed the strategy.'
                      : 'Strategy matched buy & hold performance.'}
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
                <p className="text-sm text-muted-foreground text-center py-4">
                  No trades generated. The strategy criteria were not met during this period.
                </p>
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
                            {trade.price.toFixed(2)}
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
