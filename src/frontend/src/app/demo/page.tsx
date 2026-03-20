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
} from 'lucide-react';
import {
  demoApi,
  stocksApi,
  type DemoAccountData,
  type DemoHoldingEnriched,
  type DemoSnapshotData,
  type Stock,
} from '@/lib/api';
import { safeNum, fmtLKR, fmt2 } from '@/lib/format';

const DEMO_ACCOUNT_ID = 1;
const CSE_FEE_RATE = 0.0112; // 1.12%

// ── Helpers ───────────────────────────────────────────────────────────────────

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

type SortKey = 'symbol' | 'quantity' | 'avg_cost_basis' | 'current_price' | 'unrealized_pnl' | 'pnl_pct';

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DemoPage() {
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

  // Quick trade state
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
      const [acctRes, holdRes, snapRes, stockRes] = await Promise.allSettled([
        demoApi.getAccount(DEMO_ACCOUNT_ID),
        demoApi.getHoldings(DEMO_ACCOUNT_ID),
        demoApi.getSnapshots(DEMO_ACCOUNT_ID),
        stocksApi.getAll({ shariah: 'COMPLIANT' }),
      ]);

      if (acctRes.status === 'fulfilled') setAccount(acctRes.value.data);
      else setError('Failed to load account');

      if (holdRes.status === 'fulfilled') setHoldings(holdRes.value.data);
      if (snapRes.status === 'fulfilled') setSnapshots(snapRes.value.data);
      if (stockRes.status === 'fulfilled') setCompliantStocks(stockRes.value.data.slice(0, 80));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Pre-populate trade symbol
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
      setTradeSuccess(`${tradeDir} ${tradeQty} × ${tradeSymbol} executed`);
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
    else { setSortKey(key); setSortDir('asc'); }
  };

  const sortedHoldings = [...holdings].sort((a, b) => {
    const av = safeNum(a[sortKey] as unknown);
    const bv = safeNum(b[sortKey] as unknown);
    const aStr = String(a[sortKey] ?? '');
    const bStr = String(b[sortKey] ?? '');
    if (sortKey === 'symbol') {
      return sortDir === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    }
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  // Equity curve data
  const chartData = snapshots
    .slice()
    .reverse()
    .map((s) => ({
      date: new Date(s.snapshot_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      portfolio: parseFloat(String(s.total_return_pct)),
      aspi: s.aspi_return_pct != null ? parseFloat(String(s.aspi_return_pct)) : null,
    }));

  // Fee estimate for quick trade
  const currentPrice = compliantStocks.find((s) => s.symbol === tradeSymbol)?.last_price ?? 0;
  const qty = parseInt(tradeQty) || 0;
  const estCost = qty * safeNum(currentPrice);
  const estFee = estCost * CSE_FEE_RATE;
  const estNet = tradeDir === 'BUY' ? estCost + estFee : estCost - estFee;

  const totalReturn = safeNum(account?.total_return_pct);
  const returnPos = totalReturn >= 0;

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span className="text-muted-foreground/30 ml-1">↕</span>;
    return sortDir === 'asc'
      ? <ChevronUp className="h-3 w-3 inline ml-1" />
      : <ChevronDown className="h-3 w-3 inline ml-1" />;
  }

  return (
    <main className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* ── Page Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">Demo Trading Account</h1>
              <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30 text-xs">DEMO</Badge>
            </div>
            <p className="text-muted-foreground text-sm mt-1">
              Virtual paper trading with LKR 1,000,000 starting capital. Using real CSE market data with simulated execution.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              size="sm"
              onClick={handleAITrade}
              disabled={aiLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Zap className="h-4 w-4 mr-1" />}
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
        </div>

        {/* ── Error banner ── */}
        {error && (
          <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-red-500 text-sm flex-1">{error}</p>
            <button className="text-red-500/70 hover:text-red-500" onClick={() => setError(null)}>✕</button>
          </div>
        )}

        {/* ── Summary Cards ── */}
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1 text-muted-foreground text-xs">
                  <Wallet className="h-3.5 w-3.5" />
                  Portfolio Value
                </div>
                <div className="num text-xl font-bold">{fmtLKR(account?.total_value ?? account?.initial_capital)}</div>
                <div className="text-[10px] text-muted-foreground mt-1">VIRTUAL</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1 text-muted-foreground text-xs">
                  <BarChart3 className="h-3.5 w-3.5" />
                  Cash
                </div>
                <div className="num text-xl font-bold">{fmtLKR(account?.cash_balance)}</div>
                <div className="text-xs text-muted-foreground mt-1">Available to deploy</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1 text-muted-foreground text-xs">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Holdings
                </div>
                <div className="num text-xl font-bold">{fmtLKR(account?.holdings_value ?? account?.portfolio_value)}</div>
                <div className="text-xs text-muted-foreground mt-1">{holdings.length} stock{holdings.length !== 1 ? 's' : ''}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1 text-muted-foreground text-xs">
                  {returnPos ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  Total Return
                </div>
                <div className={`num text-xl font-bold ${returnPos ? 'text-emerald-500' : 'text-red-500'}`}>
                  {returnPos ? '+' : ''}{fmt2(totalReturn)}%
                </div>
                <div className={`num text-xs mt-1 ${returnPos ? 'text-emerald-500' : 'text-red-500'}`}>
                  {returnPos ? '+' : ''}{fmtLKR((account?.total_value ?? safeNum(account?.initial_capital)) - safeNum(account?.initial_capital))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Holdings Table ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-amber-500" />
              Holdings
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : sortedHoldings.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <FlaskConical className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No holdings yet.</p>
                <p className="text-sm mt-1">Use Quick Trade below or click &quot;Let AI Trade&quot; to start.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {([
                      ['symbol', 'Stock'],
                      ['quantity', 'Shares'],
                      ['avg_cost_basis', 'Avg Cost'],
                      ['current_price', 'Current'],
                      ['unrealized_pnl', 'P&L'],
                      ['pnl_pct', 'P&L %'],
                    ] as [SortKey, string][]).map(([key, label]) => (
                      <TableHead
                        key={key}
                        className="cursor-pointer select-none hover:text-foreground"
                        onClick={() => handleSort(key)}
                      >
                        {label}
                        <SortIcon col={key} />
                      </TableHead>
                    ))}
                    <TableHead>Shariah</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedHoldings.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="font-mono font-semibold text-sm">{h.symbol}</TableCell>
                      <TableCell className="num text-sm">{safeNum(h.quantity).toLocaleString()}</TableCell>
                      <TableCell className="num text-sm">LKR {fmt2(h.avg_cost_basis)}</TableCell>
                      <TableCell className="num text-sm">LKR {fmt2(h.current_price)}</TableCell>
                      <TableCell>
                        <PnlCell value={safeNum(h.unrealized_pnl)} pct={safeNum(h.pnl_pct)} />
                      </TableCell>
                      <TableCell className={`num text-sm font-medium ${safeNum(h.pnl_pct) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {safeNum(h.pnl_pct) >= 0 ? '+' : ''}{fmt2(h.pnl_pct)}%
                      </TableCell>
                      <TableCell><ShariahBadge status={h.shariah_status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* ── Equity Curve ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Equity Curve</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-48" />
            ) : chartData.length < 2 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                Equity curve will appear after 2 trading days of data.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${v.toFixed(1)}%`} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(v: unknown) => [`${safeNum(v).toFixed(2)}%`]}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="portfolio" name="AI Portfolio" stroke="#3B82F6" strokeWidth={2} fill="url(#portfolioGrad)" dot={false} />
                  <Area type="monotone" dataKey="aspi" name="ASPI" stroke="#9CA3AF" strokeWidth={1.5} strokeDasharray="4 2" fill="none" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* ── Quick Trade ── */}
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
                <button className="ml-auto" onClick={() => setTradeSuccess(null)}>✕</button>
              </div>
            )}
            {tradeError && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-500 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {tradeError}
                <button className="ml-auto" onClick={() => setTradeError(null)}>✕</button>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Stock (Shariah ✅)</label>
                <select
                  value={tradeSymbol}
                  onChange={(e) => setTradeSymbol(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background text-foreground px-3 text-sm"
                >
                  {compliantStocks.map((s) => (
                    <option key={s.symbol} value={s.symbol}>{s.symbol}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Direction</label>
                <div className="flex h-9">
                  <button
                    onClick={() => setTradeDir('BUY')}
                    className={`flex-1 rounded-l-md border border-r-0 text-sm font-medium transition-colors ${
                      tradeDir === 'BUY'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-background text-muted-foreground border-input hover:bg-emerald-500/10 hover:text-emerald-600'
                    }`}
                  >
                    BUY
                  </button>
                  <button
                    onClick={() => setTradeDir('SELL')}
                    className={`flex-1 rounded-r-md border text-sm font-medium transition-colors ${
                      tradeDir === 'SELL'
                        ? 'bg-red-600 text-white border-red-600'
                        : 'bg-background text-muted-foreground border-input hover:bg-red-500/10 hover:text-red-500'
                    }`}
                  >
                    SELL
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Quantity</label>
                <Input
                  type="number"
                  min="1"
                  placeholder="100"
                  value={tradeQty}
                  onChange={(e) => setTradeQty(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Est. Cost</label>
                <div className="h-9 rounded-md border border-input bg-muted px-3 flex items-center text-sm num text-muted-foreground">
                  {estCost > 0 ? fmtLKR(estCost) : '—'}
                </div>
              </div>
            </div>
            {estCost > 0 && (
              <div className="flex items-center gap-6 text-xs text-muted-foreground num">
                <span>Fee (1.12%): <strong className="text-foreground">{fmtLKR(estFee)}</strong></span>
                <span>Net {tradeDir === 'BUY' ? 'debit' : 'credit'}: <strong className="text-foreground">{fmtLKR(estNet)}</strong></span>
              </div>
            )}
            <div>
              <Button
                onClick={handleTrade}
                disabled={tradeLoading}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {tradeLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
                Execute Demo Trade
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Reset confirm modal ── */}
      {resetConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border rounded-xl p-6 max-w-sm w-full space-y-4">
            <div className="flex items-start gap-3">
              <RotateCcw className="h-6 w-6 text-red-500 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold">Reset Demo Account?</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  This will delete all trades, holdings, and snapshots, and restore the LKR 1,000,000 starting balance. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => setResetConfirm(false)}>Cancel</Button>
              <Button
                size="sm"
                onClick={handleReset}
                disabled={resetLoading}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {resetLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Yes, Reset
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
