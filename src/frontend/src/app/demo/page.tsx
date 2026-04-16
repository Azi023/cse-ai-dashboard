'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  FlaskConical,
  TrendingUp,
  TrendingDown,
  Wallet,
  BarChart3,
  RefreshCw,
  Zap,
  RotateCcw,
  AlertTriangle,
  CheckCircle,
  Clock,
  ChevronUp,
  ChevronDown,
  Loader2,
  User,
  Bot,
  GitCompare,
} from 'lucide-react';
import {
  demoApi,
  stocksApi,
  paperTradingApi,
  type DemoAccountData,
  type DemoHoldingEnriched,
  type DemoSnapshotData,
  type Stock,
  type PaperPortfolioSummary,
  type PaperTradeRecord,
  type PaperPerformance,
} from '@/lib/api';
import { safeNum, fmtLKR, fmt2 } from '@/lib/format';
import { useShariahMode } from '@/contexts/shariah-mode-context';

const DEMO_ACCOUNT_ID = 1;
const CSE_FEE_RATE = 0.0112;

// ── Helpers ─────────────────────────────────────────────────────────────────

function ShariahBadge({ status }: { status: string }) {
  if (status === 'COMPLIANT')
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
        <CheckCircle className="h-3 w-3" /> Compliant
      </span>
    );
  if (status === 'NON_COMPLIANT')
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-500">
        <AlertTriangle className="h-3 w-3" /> Non-Compliant
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Clock className="h-3 w-3" /> Pending
    </span>
  );
}

function PnlCell({ value, pct }: { value: number; pct: number }) {
  const pos = value >= 0;
  const color = pos ? 'text-emerald-500' : 'text-red-500';
  return (
    <div className={`num ${color}`}>
      <div className="font-medium">
        {pos ? '+' : ''}
        {fmtLKR(value)}
      </div>
      <div className="text-xs">
        {pos ? '+' : ''}
        {fmt2(pct)}%
      </div>
    </div>
  );
}

type SortKey =
  | 'symbol'
  | 'quantity'
  | 'avg_cost_basis'
  | 'current_price'
  | 'unrealized_pnl'
  | 'pnl_pct';

type Tab = 'ai' | 'paper' | 'compare';

// ── Main Page ───────────────────────────────────────────────────────────────

export default function DemoPage() {
  const [activeTab, setActiveTab] = useState<Tab>('ai');
  const { shariahMode } = useShariahMode();

  return (
    <main className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Page Header */}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Demo Trading</h1>
            <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30 text-xs">
              VIRTUAL
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Paper trade with virtual capital using real CSE market data.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b">
          {(
            [
              { key: 'ai', label: 'AI Portfolio', icon: Bot },
              { key: 'paper', label: 'My Paper Trades', icon: User },
              { key: 'compare', label: 'Compare', icon: GitCompare },
            ] as const
          ).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'ai' && (
          <AIPortfolioTab shariahMode={shariahMode} />
        )}
        {activeTab === 'paper' && (
          <PaperTradingTab shariahMode={shariahMode} />
        )}
        {activeTab === 'compare' && <CompareTab />}
      </div>
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tab 1: AI Portfolio (existing demo trading)
// ═══════════════════════════════════════════════════════════════════════════

function AIPortfolioTab({ shariahMode }: { shariahMode: boolean }) {
  const [account, setAccount] = useState<DemoAccountData | null>(null);
  const [holdings, setHoldings] = useState<DemoHoldingEnriched[]>([]);
  const [snapshots, setSnapshots] = useState<DemoSnapshotData[]>([]);
  const [compliantStocks, setCompliantStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('symbol');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [tradeSymbol, setTradeSymbol] = useState('');
  const [tradeDir, setTradeDir] = useState<'BUY' | 'SELL'>('BUY');
  const [tradeQty, setTradeQty] = useState('');
  const [tradeLoading, setTradeLoading] = useState(false);
  const [tradeSuccess, setTradeSuccess] = useState<string | null>(null);
  const [tradeError, setTradeError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const stockFilter = shariahMode
        ? { shariah: 'COMPLIANT' }
        : {};
      const [acctRes, holdRes, snapRes, stockRes] = await Promise.allSettled([
        demoApi.getAccount(DEMO_ACCOUNT_ID),
        demoApi.getHoldings(DEMO_ACCOUNT_ID),
        demoApi.getSnapshots(DEMO_ACCOUNT_ID),
        stocksApi.getAll(stockFilter),
      ]);
      if (acctRes.status === 'fulfilled') setAccount(acctRes.value.data);
      else setError('Failed to load account');
      if (holdRes.status === 'fulfilled') setHoldings(holdRes.value.data);
      if (snapRes.status === 'fulfilled') setSnapshots(snapRes.value.data);
      if (stockRes.status === 'fulfilled')
        setCompliantStocks(stockRes.value.data.slice(0, 80));
    } finally {
      setLoading(false);
    }
  }, [shariahMode]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (compliantStocks.length > 0 && !tradeSymbol) {
      setTradeSymbol(compliantStocks[0].symbol);
    }
  }, [compliantStocks, tradeSymbol]);

  const handleAITrade = async () => {
    setAiLoading(true);
    setError(null);
    try {
      await demoApi.triggerAITrade(DEMO_ACCOUNT_ID);
      await fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI trade failed');
    } finally {
      setAiLoading(false);
    }
  };

  const handleReset = async () => {
    setResetLoading(true);
    try {
      await demoApi.resetAccount(DEMO_ACCOUNT_ID);
      setResetConfirm(false);
      await fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reset failed');
    } finally {
      setResetLoading(false);
    }
  };

  const handleTrade = async () => {
    if (!tradeSymbol || !tradeQty || parseInt(tradeQty) <= 0) {
      setTradeError('Enter a valid symbol and quantity');
      return;
    }
    setTradeLoading(true);
    setTradeError(null);
    setTradeSuccess(null);
    try {
      await demoApi.executeTrade({
        demo_account_id: DEMO_ACCOUNT_ID,
        symbol: tradeSymbol,
        direction: tradeDir,
        quantity: parseInt(tradeQty),
        source: 'MANUAL',
      });
      setTradeSuccess(`${tradeDir} ${tradeQty} x ${tradeSymbol} executed`);
      setTradeQty('');
      await fetchAll();
    } catch (e) {
      setTradeError(e instanceof Error ? e.message : 'Trade failed');
    } finally {
      setTradeLoading(false);
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortedHoldings = [...holdings].sort((a, b) => {
    const av = safeNum(a[sortKey] as unknown);
    const bv = safeNum(b[sortKey] as unknown);
    const aStr = String(a[sortKey] ?? '');
    const bStr = String(b[sortKey] ?? '');
    if (sortKey === 'symbol')
      return sortDir === 'asc'
        ? aStr.localeCompare(bStr)
        : bStr.localeCompare(aStr);
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  const chartData = snapshots
    .slice()
    .reverse()
    .map((s) => ({
      date: new Date(s.snapshot_date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      portfolio: parseFloat(String(s.total_return_pct)),
      aspi:
        s.aspi_return_pct != null
          ? parseFloat(String(s.aspi_return_pct))
          : null,
    }));

  const currentPrice =
    compliantStocks.find((s) => s.symbol === tradeSymbol)?.last_price ?? 0;
  const qty = parseInt(tradeQty) || 0;
  const estCost = qty * safeNum(currentPrice);
  const estFee = estCost * CSE_FEE_RATE;
  const estNet = tradeDir === 'BUY' ? estCost + estFee : estCost - estFee;

  const totalReturn = safeNum(account?.total_return_pct);
  const returnPos = totalReturn >= 0;

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col)
      return <span className="text-muted-foreground/30 ml-1">&#8597;</span>;
    return sortDir === 'asc' ? (
      <ChevronUp className="h-3 w-3 inline ml-1" />
    ) : (
      <ChevronDown className="h-3 w-3 inline ml-1" />
    );
  }

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={handleAITrade}
          disabled={aiLoading}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {aiLoading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <Zap className="h-4 w-4 mr-1" />
          )}
          Let AI Trade
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setResetConfirm(true)}
          className="text-red-500 border-red-500/30 hover:bg-red-500/10 hover:text-red-500"
        >
          <RotateCcw className="h-4 w-4 mr-1" />
          Reset
        </Button>
        <Button size="sm" variant="outline" onClick={fetchAll}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-red-500 text-sm flex-1">{error}</p>
          <button
            className="text-red-500/70 hover:text-red-500"
            onClick={() => setError(null)}
          >
            x
          </button>
        </div>
      )}

      {/* Summary Cards */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1 text-muted-foreground text-xs">
                <Wallet className="h-3.5 w-3.5" /> Portfolio Value
              </div>
              <div className="num text-xl font-bold">
                {fmtLKR(account?.total_value ?? account?.initial_capital)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1 text-muted-foreground text-xs">
                <BarChart3 className="h-3.5 w-3.5" /> Cash
              </div>
              <div className="num text-xl font-bold">
                {fmtLKR(account?.cash_balance)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1 text-muted-foreground text-xs">
                <TrendingUp className="h-3.5 w-3.5" /> Holdings
              </div>
              <div className="num text-xl font-bold">
                {fmtLKR(
                  account?.holdings_value ?? account?.portfolio_value,
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {holdings.length} stock{holdings.length !== 1 ? 's' : ''}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1 text-muted-foreground text-xs">
                {returnPos ? (
                  <TrendingUp className="h-3.5 w-3.5" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5" />
                )}
                Total Return
              </div>
              <div
                className={`num text-xl font-bold ${returnPos ? 'text-emerald-500' : 'text-red-500'}`}
              >
                {returnPos ? '+' : ''}
                {fmt2(totalReturn)}%
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Holdings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-amber-500" />
            AI Holdings
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : sortedHoldings.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <FlaskConical className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No holdings yet.</p>
              <p className="text-sm mt-1">
                Click &quot;Let AI Trade&quot; to start.
              </p>
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="space-y-2 md:hidden">
                {sortedHoldings.map((h) => (
                  <div
                    key={h.id}
                    className="rounded-lg border bg-card/50 px-3 py-2.5 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-sm">
                          {h.symbol}
                        </span>
                        {shariahMode && (
                          <ShariahBadge status={h.shariah_status} />
                        )}
                      </div>
                      <span
                        className={`text-sm font-semibold num ${safeNum(h.pnl_pct) >= 0 ? 'text-profit' : 'text-loss'}`}
                      >
                        {safeNum(h.pnl_pct) >= 0 ? '+' : ''}
                        {fmt2(h.pnl_pct)}%
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Shares</span>
                        <p className="font-medium num">
                          {safeNum(h.quantity).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Avg Cost</span>
                        <p className="font-medium num">
                          {fmt2(h.avg_cost_basis)}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Current</span>
                        <p className="font-medium num">
                          {fmt2(h.current_price)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {(
                        [
                          ['symbol', 'Stock'],
                          ['quantity', 'Shares'],
                          ['avg_cost_basis', 'Avg Cost'],
                          ['current_price', 'Current'],
                          ['unrealized_pnl', 'P&L'],
                          ['pnl_pct', 'P&L %'],
                        ] as [SortKey, string][]
                      ).map(([key, label]) => (
                        <TableHead
                          key={key}
                          className="cursor-pointer select-none hover:text-foreground"
                          onClick={() => handleSort(key)}
                        >
                          {label}
                          <SortIcon col={key} />
                        </TableHead>
                      ))}
                      {shariahMode && <TableHead>Shariah</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedHoldings.map((h) => (
                      <TableRow key={h.id}>
                        <TableCell className="font-mono font-semibold text-sm">
                          {h.symbol}
                        </TableCell>
                        <TableCell className="num text-sm">
                          {safeNum(h.quantity).toLocaleString()}
                        </TableCell>
                        <TableCell className="num text-sm">
                          LKR {fmt2(h.avg_cost_basis)}
                        </TableCell>
                        <TableCell className="num text-sm">
                          LKR {fmt2(h.current_price)}
                        </TableCell>
                        <TableCell>
                          <PnlCell
                            value={safeNum(h.unrealized_pnl)}
                            pct={safeNum(h.pnl_pct)}
                          />
                        </TableCell>
                        <TableCell
                          className={`num text-sm font-medium ${safeNum(h.pnl_pct) >= 0 ? 'text-profit' : 'text-loss'}`}
                        >
                          {safeNum(h.pnl_pct) >= 0 ? '+' : ''}
                          {fmt2(h.pnl_pct)}%
                        </TableCell>
                        {shariahMode && (
                          <TableCell>
                            <ShariahBadge status={h.shariah_status} />
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Equity Curve */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Equity Curve</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-48" />
          ) : chartData.length < 2 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
              Equity curve will appear after 2 trading days.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart
                data={chartData}
                margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
              >
                <defs>
                  <linearGradient
                    id="portfolioGrad"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="#3B82F6"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="#3B82F6"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  opacity={0.5}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                  tickFormatter={(v) => `${v.toFixed(1)}%`}
                />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  formatter={(v: unknown) => [`${safeNum(v).toFixed(2)}%`]}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="portfolio"
                  name="AI Portfolio"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  fill="url(#portfolioGrad)"
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="aspi"
                  name="ASPI"
                  stroke="#9CA3AF"
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                  fill="none"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Quick Trade */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4 text-blue-500" />
            Quick Demo Trade
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {tradeSuccess && (
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-3 text-emerald-600 dark:text-emerald-400 text-sm">
              <CheckCircle className="h-4 w-4 shrink-0" />
              {tradeSuccess}
              <button
                className="ml-auto"
                onClick={() => setTradeSuccess(null)}
              >
                x
              </button>
            </div>
          )}
          {tradeError && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-500 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {tradeError}
              <button
                className="ml-auto"
                onClick={() => setTradeError(null)}
              >
                x
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Stock{shariahMode ? ' (Shariah)' : ''}
              </label>
              <select
                value={tradeSymbol}
                onChange={(e) => setTradeSymbol(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background text-foreground px-3 text-sm"
                aria-label="Select stock"
              >
                {compliantStocks.map((s) => (
                  <option key={s.symbol} value={s.symbol}>
                    {s.symbol}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Direction
              </label>
              <div className="flex h-9">
                <button
                  onClick={() => setTradeDir('BUY')}
                  className={`flex-1 rounded-l-md border border-r-0 text-sm font-medium transition-colors ${
                    tradeDir === 'BUY'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-background text-muted-foreground border-input hover:bg-emerald-500/10'
                  }`}
                >
                  BUY
                </button>
                <button
                  onClick={() => setTradeDir('SELL')}
                  className={`flex-1 rounded-r-md border text-sm font-medium transition-colors ${
                    tradeDir === 'SELL'
                      ? 'bg-red-600 text-white border-red-600'
                      : 'bg-background text-muted-foreground border-input hover:bg-red-500/10'
                  }`}
                >
                  SELL
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Quantity
              </label>
              <Input
                type="number"
                min="1"
                placeholder="100"
                value={tradeQty}
                onChange={(e) => setTradeQty(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Est. Cost
              </label>
              <div className="h-9 rounded-md border border-input bg-muted px-3 flex items-center text-sm num text-muted-foreground">
                {estCost > 0 ? fmtLKR(estCost) : '---'}
              </div>
            </div>
          </div>
          {estCost > 0 && (
            <div className="flex items-center gap-6 text-xs text-muted-foreground num">
              <span>
                Fee (1.12%):{' '}
                <strong className="text-foreground">{fmtLKR(estFee)}</strong>
              </span>
              <span>
                Net {tradeDir === 'BUY' ? 'debit' : 'credit'}:{' '}
                <strong className="text-foreground">{fmtLKR(estNet)}</strong>
              </span>
            </div>
          )}
          <Button
            onClick={handleTrade}
            disabled={tradeLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {tradeLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Zap className="h-4 w-4 mr-2" />
            )}
            Execute Demo Trade
          </Button>
        </CardContent>
      </Card>

      {/* Reset modal */}
      {resetConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border rounded-xl p-6 max-w-sm w-full space-y-4">
            <div className="flex items-start gap-3">
              <RotateCcw className="h-6 w-6 text-red-500 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold">Reset Demo Account?</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  This will delete all trades, holdings, and snapshots. This
                  cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setResetConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleReset}
                disabled={resetLoading}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {resetLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : null}
                Yes, Reset
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tab 2: Paper Trading (human trades)
// ═══════════════════════════════════════════════════════════════════════════

function PaperTradingTab({ shariahMode }: { shariahMode: boolean }) {
  const [portfolio, setPortfolio] = useState<PaperPortfolioSummary | null>(
    null,
  );
  const [history, setHistory] = useState<PaperTradeRecord[]>([]);
  const [allStocks, setAllStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Trade form
  const [tradeSymbol, setTradeSymbol] = useState('');
  const [tradeDir, setTradeDir] = useState<'BUY' | 'SELL'>('BUY');
  const [tradeQty, setTradeQty] = useState('');
  const [tradeNotes, setTradeNotes] = useState('');
  const [tradeLoading, setTradeLoading] = useState(false);
  const [tradeSuccess, setTradeSuccess] = useState<string | null>(null);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const stockFilter = shariahMode ? { shariah: 'COMPLIANT' } : {};
      const [pRes, hRes, sRes] = await Promise.allSettled([
        paperTradingApi.getPortfolio('paper_human', 'stock'),
        paperTradingApi.getHistory('paper_human', 'stock'),
        stocksApi.getAll(stockFilter),
      ]);
      if (pRes.status === 'fulfilled') setPortfolio(pRes.value.data);
      if (hRes.status === 'fulfilled') setHistory(hRes.value.data);
      if (sRes.status === 'fulfilled')
        setAllStocks(sRes.value.data.slice(0, 100));
    } catch {
      setError('Failed to load paper trading data');
    } finally {
      setLoading(false);
    }
  }, [shariahMode]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (allStocks.length > 0 && !tradeSymbol) {
      setTradeSymbol(allStocks[0].symbol);
    }
  }, [allStocks, tradeSymbol]);

  const handleTrade = async () => {
    if (!tradeSymbol || !tradeQty || parseInt(tradeQty) <= 0) {
      setTradeError('Enter a valid symbol and quantity');
      return;
    }
    setTradeLoading(true);
    setTradeError(null);
    setTradeSuccess(null);
    try {
      await paperTradingApi.executeTrade({
        symbol: tradeSymbol,
        direction: tradeDir,
        quantity: parseInt(tradeQty),
        notes: tradeNotes || undefined,
        asset_type: 'stock',
      });
      setTradeSuccess(
        `${tradeDir} ${tradeQty} x ${tradeSymbol} executed`,
      );
      setTradeQty('');
      setTradeNotes('');
      await fetchAll();
    } catch (e) {
      setTradeError(e instanceof Error ? e.message : 'Trade failed');
    } finally {
      setTradeLoading(false);
    }
  };

  const handleReset = async () => {
    setResetLoading(true);
    try {
      await paperTradingApi.resetPortfolio('paper_human', 'stock');
      setResetConfirm(false);
      await fetchAll();
    } finally {
      setResetLoading(false);
    }
  };

  const currentPrice =
    allStocks.find((s) => s.symbol === tradeSymbol)?.last_price ?? 0;
  const qty = parseInt(tradeQty) || 0;
  const estCost = qty * safeNum(currentPrice);
  const estFee = estCost * CSE_FEE_RATE;

  const totalReturn = safeNum(portfolio?.total_return_pct);
  const returnPos = totalReturn >= 0;

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={fetchAll}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setResetConfirm(true)}
          className="text-red-500 border-red-500/30 hover:bg-red-500/10"
        >
          <RotateCcw className="h-4 w-4 mr-1" />
          Reset
        </Button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-500 text-sm">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1 text-muted-foreground text-xs">
                <Wallet className="h-3.5 w-3.5" /> Total Value
              </div>
              <div className="num text-xl font-bold">
                {fmtLKR(portfolio?.total_value)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1 text-muted-foreground text-xs">
                <BarChart3 className="h-3.5 w-3.5" /> Cash
              </div>
              <div className="num text-xl font-bold">
                {fmtLKR(portfolio?.current_cash)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1 text-muted-foreground text-xs">
                <TrendingUp className="h-3.5 w-3.5" /> Holdings
              </div>
              <div className="num text-xl font-bold">
                {fmtLKR(portfolio?.holdings_value)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {portfolio?.holdings.length ?? 0} positions
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1 text-muted-foreground text-xs">
                {returnPos ? (
                  <TrendingUp className="h-3.5 w-3.5" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5" />
                )}
                Return
              </div>
              <div
                className={`num text-xl font-bold ${returnPos ? 'text-emerald-500' : 'text-red-500'}`}
              >
                {returnPos ? '+' : ''}
                {fmt2(totalReturn)}%
              </div>
              <div
                className={`num text-xs mt-1 ${returnPos ? 'text-emerald-500' : 'text-red-500'}`}
              >
                {returnPos ? '+' : ''}
                {fmtLKR(portfolio?.total_return)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Holdings */}
      {portfolio && portfolio.holdings.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Your Holdings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 md:hidden">
              {portfolio.holdings.map((h) => (
                <div
                  key={h.symbol}
                  className="rounded-lg border bg-card/50 px-3 py-2.5 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold text-sm">
                      {h.symbol}
                    </span>
                    <span
                      className={`text-sm font-semibold num ${h.unrealized_pnl_pct >= 0 ? 'text-profit' : 'text-loss'}`}
                    >
                      {h.unrealized_pnl_pct >= 0 ? '+' : ''}
                      {fmt2(h.unrealized_pnl_pct)}%
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Qty</span>
                      <p className="font-medium num">{h.quantity}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Avg</span>
                      <p className="font-medium num">{fmt2(h.avg_cost)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">P&L</span>
                      <p
                        className={`font-medium num ${h.unrealized_pnl >= 0 ? 'text-profit' : 'text-loss'}`}
                      >
                        {fmtLKR(h.unrealized_pnl)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stock</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Avg Cost</TableHead>
                    <TableHead>Current</TableHead>
                    <TableHead>P&L</TableHead>
                    <TableHead>P&L %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {portfolio.holdings.map((h) => (
                    <TableRow key={h.symbol}>
                      <TableCell className="font-mono font-semibold">
                        {h.symbol}
                      </TableCell>
                      <TableCell className="num">{h.quantity}</TableCell>
                      <TableCell className="num">
                        LKR {fmt2(h.avg_cost)}
                      </TableCell>
                      <TableCell className="num">
                        LKR {fmt2(h.current_price)}
                      </TableCell>
                      <TableCell>
                        <PnlCell
                          value={h.unrealized_pnl}
                          pct={h.unrealized_pnl_pct}
                        />
                      </TableCell>
                      <TableCell
                        className={`num font-medium ${h.unrealized_pnl_pct >= 0 ? 'text-profit' : 'text-loss'}`}
                      >
                        {h.unrealized_pnl_pct >= 0 ? '+' : ''}
                        {fmt2(h.unrealized_pnl_pct)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Place Trade Form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4 text-orange-500" />
            Place Paper Trade
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {tradeSuccess && (
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-3 text-emerald-400 text-sm">
              <CheckCircle className="h-4 w-4 shrink-0" />
              {tradeSuccess}
              <button
                className="ml-auto"
                onClick={() => setTradeSuccess(null)}
              >
                x
              </button>
            </div>
          )}
          {tradeError && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-500 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {tradeError}
              <button
                className="ml-auto"
                onClick={() => setTradeError(null)}
              >
                x
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Stock
              </label>
              <select
                value={tradeSymbol}
                onChange={(e) => setTradeSymbol(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background text-foreground px-3 text-sm"
                aria-label="Select stock"
              >
                {allStocks.map((s) => (
                  <option key={s.symbol} value={s.symbol}>
                    {s.symbol}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Direction
              </label>
              <div className="flex h-9">
                <button
                  onClick={() => setTradeDir('BUY')}
                  className={`flex-1 rounded-l-md border border-r-0 text-sm font-medium transition-colors ${
                    tradeDir === 'BUY'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-background text-muted-foreground border-input'
                  }`}
                >
                  BUY
                </button>
                <button
                  onClick={() => setTradeDir('SELL')}
                  className={`flex-1 rounded-r-md border text-sm font-medium transition-colors ${
                    tradeDir === 'SELL'
                      ? 'bg-red-600 text-white border-red-600'
                      : 'bg-background text-muted-foreground border-input'
                  }`}
                >
                  SELL
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Quantity
              </label>
              <Input
                type="number"
                min="1"
                placeholder="100"
                value={tradeQty}
                onChange={(e) => setTradeQty(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Est. Cost
              </label>
              <div className="h-9 rounded-md border border-input bg-muted px-3 flex items-center text-sm num text-muted-foreground">
                {estCost > 0 ? fmtLKR(estCost) : '---'}
              </div>
            </div>
          </div>
          {estCost > 0 && (
            <div className="text-xs text-muted-foreground num">
              Fee (1.12%):{' '}
              <strong className="text-foreground">{fmtLKR(estFee)}</strong>
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Notes (optional)
            </label>
            <Input
              placeholder="Why are you making this trade?"
              value={tradeNotes}
              onChange={(e) => setTradeNotes(e.target.value)}
            />
          </div>
          <Button
            onClick={handleTrade}
            disabled={tradeLoading}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            {tradeLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Zap className="h-4 w-4 mr-2" />
            )}
            Place Paper Trade
          </Button>
        </CardContent>
      </Card>

      {/* Trade History */}
      {history.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Trade History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {history.slice(0, 20).map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <Badge
                      className={
                        t.direction === 'BUY'
                          ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30'
                          : 'bg-red-500/20 text-red-500 border-red-500/30'
                      }
                    >
                      {t.direction}
                    </Badge>
                    <span className="font-mono font-medium">{t.symbol}</span>
                    <span className="text-muted-foreground num">
                      {t.quantity} x LKR {fmt2(t.price)}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="num text-xs text-muted-foreground">
                      {new Date(t.executed_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                    {t.notes && (
                      <div className="text-xs text-muted-foreground/70 italic max-w-[200px] truncate">
                        {t.notes}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reset modal */}
      {resetConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border rounded-xl p-6 max-w-sm w-full space-y-4">
            <h3 className="font-semibold">Reset Paper Portfolio?</h3>
            <p className="text-muted-foreground text-sm">
              All trades and holdings will be deleted. Starting balance
              restored to LKR 1,000,000.
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setResetConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleReset}
                disabled={resetLoading}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {resetLoading && (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                )}
                Yes, Reset
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tab 3: Compare (AI vs Human)
// ═══════════════════════════════════════════════════════════════════════════

function CompareTab() {
  const [data, setData] = useState<{
    ai_demo: PaperPortfolioSummary;
    paper_human: PaperPortfolioSummary;
  } | null>(null);
  const [aiPerf, setAiPerf] = useState<PaperPerformance | null>(null);
  const [humanPerf, setHumanPerf] = useState<PaperPerformance | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const [cmpRes, aiRes, humanRes] = await Promise.allSettled([
          paperTradingApi.compare(),
          paperTradingApi.getPerformance('ai_demo', 'stock'),
          paperTradingApi.getPerformance('paper_human', 'stock'),
        ]);
        if (cmpRes.status === 'fulfilled') setData(cmpRes.value.data);
        if (aiRes.status === 'fulfilled') setAiPerf(aiRes.value.data);
        if (humanRes.status === 'fulfilled')
          setHumanPerf(humanRes.value.data);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <GitCompare className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p>No comparison data available yet.</p>
        <p className="text-sm mt-1">
          Start trading in both AI and Paper portfolios.
        </p>
      </div>
    );
  }

  const aiReturn = safeNum(data.ai_demo.total_return_pct);
  const humanReturn = safeNum(data.paper_human.total_return_pct);
  const aiWinning = aiReturn > humanReturn;

  // Merge equity curves for overlay chart
  const aiCurve = aiPerf?.equity_curve ?? [];
  const humanCurve = humanPerf?.equity_curve ?? [];
  const allDates = [
    ...new Set([
      ...aiCurve.map((p) => p.date),
      ...humanCurve.map((p) => p.date),
    ]),
  ].sort();
  const overlayData = allDates.map((date) => ({
    date,
    ai: aiCurve.find((p) => p.date === date)?.value ?? null,
    human: humanCurve.find((p) => p.date === date)?.value ?? null,
  }));

  const metrics = [
    {
      label: 'Total Value',
      ai: fmtLKR(data.ai_demo.total_value),
      human: fmtLKR(data.paper_human.total_value),
    },
    {
      label: 'Return %',
      ai: `${aiReturn >= 0 ? '+' : ''}${fmt2(aiReturn)}%`,
      human: `${humanReturn >= 0 ? '+' : ''}${fmt2(humanReturn)}%`,
    },
    {
      label: 'Cash',
      ai: fmtLKR(data.ai_demo.current_cash),
      human: fmtLKR(data.paper_human.current_cash),
    },
    {
      label: 'Positions',
      ai: String(data.ai_demo.holdings.length),
      human: String(data.paper_human.holdings.length),
    },
    {
      label: 'Total Trades',
      ai: String(aiPerf?.total_trades ?? 0),
      human: String(humanPerf?.total_trades ?? 0),
    },
    {
      label: 'Win Rate',
      ai: `${fmt2(aiPerf?.win_rate)}%`,
      human: `${fmt2(humanPerf?.win_rate)}%`,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Winner banner */}
      <div
        className={`flex items-center gap-3 rounded-xl border-2 p-4 ${
          aiWinning
            ? 'border-blue-500/30 bg-blue-500/5'
            : 'border-orange-500/30 bg-orange-500/5'
        }`}
      >
        {aiWinning ? (
          <Bot className="h-6 w-6 text-blue-500" />
        ) : (
          <User className="h-6 w-6 text-orange-500" />
        )}
        <div>
          <p className="font-semibold">
            {aiReturn === humanReturn
              ? "It's a tie!"
              : aiWinning
                ? 'AI is winning'
                : "You're winning!"}
          </p>
          <p className="text-sm text-muted-foreground">
            AI: {aiReturn >= 0 ? '+' : ''}
            {fmt2(aiReturn)}% vs You: {humanReturn >= 0 ? '+' : ''}
            {fmt2(humanReturn)}%
          </p>
        </div>
      </div>

      {/* Metrics table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Performance Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                <TableHead className="text-blue-500">
                  <Bot className="h-3.5 w-3.5 inline mr-1" />
                  AI Portfolio
                </TableHead>
                <TableHead className="text-orange-500">
                  <User className="h-3.5 w-3.5 inline mr-1" />
                  Your Portfolio
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.map((m) => (
                <TableRow key={m.label}>
                  <TableCell className="font-medium">{m.label}</TableCell>
                  <TableCell className="num">{m.ai}</TableCell>
                  <TableCell className="num">{m.human}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Equity overlay */}
      {overlayData.length > 1 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Equity Curves</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart
                data={overlayData}
                margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  opacity={0.5}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`}
                />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  formatter={(v: unknown) => [fmtLKR(safeNum(v))]}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="ai"
                  name="AI Portfolio"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  fill="none"
                  dot={false}
                  connectNulls
                />
                <Area
                  type="monotone"
                  dataKey="human"
                  name="Your Portfolio"
                  stroke="#F97316"
                  strokeWidth={2}
                  fill="none"
                  dot={false}
                  connectNulls
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
