'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  TrendingUp,
  TrendingDown,
  BarChart3,
  ShieldCheck,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import {
  demoApi,
  type DemoPerformanceData,
  type DemoBenchmarkData,
  type DemoTradeData,
  type DemoHoldingEnriched,
} from '@/lib/api';
import { safeNum, fmtLKR, fmt2, fmt1 } from '@/lib/format';

const DEMO_ACCOUNT_ID = 1;

const SECTOR_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16',
];

// ── Source Badge ──────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: string }) {
  const cfg: Record<string, string> = {
    AI_AUTO: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    MANUAL: 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30',
    AI_SIGNAL: 'bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg[source] ?? 'bg-muted text-muted-foreground border-border'}`}>
      {source?.replace('_', ' ') ?? 'MANUAL'}
    </span>
  );
}

// ── Metric Card ───────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="text-xs text-muted-foreground mb-1">{label}</div>
        <div className={`num text-xl font-bold ${color ?? ''}`}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1 num">{sub}</div>}
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DemoPerformancePage() {
  const [performance, setPerformance] = useState<DemoPerformanceData | null>(null);
  const [benchmarks, setBenchmarks] = useState<DemoBenchmarkData[]>([]);
  const [trades, setTrades] = useState<DemoTradeData[]>([]);
  const [tradeTotal, setTradeTotal] = useState(0);
  const [tradePage, setTradePage] = useState(1);
  const [holdings, setHoldings] = useState<DemoHoldingEnriched[]>([]);
  const [loading, setLoading] = useState(true);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [dirFilter, setDirFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [srcFilter, setSrcFilter] = useState<'ALL' | 'AI_AUTO' | 'MANUAL' | 'AI_SIGNAL'>('ALL');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [perfRes, benchRes, holdRes] = await Promise.allSettled([
        demoApi.getPerformance(DEMO_ACCOUNT_ID),
        demoApi.getBenchmarks(DEMO_ACCOUNT_ID),
        demoApi.getHoldings(DEMO_ACCOUNT_ID),
      ]);
      if (perfRes.status === 'fulfilled') setPerformance(perfRes.value.data);
      if (benchRes.status === 'fulfilled') setBenchmarks(benchRes.value.data);
      if (holdRes.status === 'fulfilled') setHoldings(holdRes.value.data);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTrades = useCallback(async (page: number) => {
    setTradesLoading(true);
    try {
      const res = await demoApi.getTrades(DEMO_ACCOUNT_ID, page, 20);
      setTrades(res.data.trades);
      setTradeTotal(res.data.total);
    } catch {
      // non-critical
    } finally {
      setTradesLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { fetchTrades(tradePage); }, [fetchTrades, tradePage]);

  const toggleRow = (id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Chart data ─────────────────────────────────────────────────────────────

  const benchmarkChartData = benchmarks
    .slice()
    .reverse()
    .map((b) => ({
      date: new Date(b.benchmark_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      portfolio: parseFloat(String(b.portfolio_return_pct ?? 0)),
      aspi: b.aspi_return_pct != null ? parseFloat(String(b.aspi_return_pct)) : null,
      random: b.random_return_pct != null ? parseFloat(String(b.random_return_pct)) : null,
    }));

  // ── Sector allocation pie ──────────────────────────────────────────────────
  // Group holdings by inferred sector (symbol prefix approximation or use market_value)
  const sectorMap = new Map<string, number>();
  for (const h of holdings) {
    const sector = 'Holdings'; // TODO: wire to stock.sector when available
    sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + safeNum(h.market_value));
  }
  const pieData = Array.from(sectorMap.entries()).map(([name, value]) => ({ name, value }));

  // ── Filtered trades ────────────────────────────────────────────────────────
  const filteredTrades = trades.filter((t) => {
    if (dirFilter !== 'ALL' && t.direction !== dirFilter) return false;
    if (srcFilter !== 'ALL' && t.source !== srcFilter) return false;
    return true;
  });

  const totalPages = Math.ceil(tradeTotal / 20);

  // ── Shariah compliance ─────────────────────────────────────────────────────
  const compliantPct = safeNum(performance?.shariah_compliance ?? 100);
  const compliantCount = holdings.filter((h) => h.shariah_status === 'COMPLIANT').length;

  return (
    <main className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">Demo Performance</h1>
              <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30 text-xs">DEMO</Badge>
            </div>
            <p className="text-muted-foreground text-sm mt-1">
              AI portfolio benchmarked against ASPI and random picks.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={fetchAll}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {error && (
          <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-red-500 text-sm">{error}</p>
          </div>
        )}

        {/* ── Hero: AI vs ASPI vs Random ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-blue-500" />
              AI Portfolio vs Benchmarks (cumulative return %)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-56" />
            ) : benchmarkChartData.length < 2 ? (
              <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">
                Benchmark comparison will appear after 2+ trading days.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={benchmarkChartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${v.toFixed(1)}%`} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(v: unknown) => [`${safeNum(v).toFixed(2)}%`]}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="portfolio" name="AI Portfolio" stroke="#3B82F6" strokeWidth={3} dot={false} />
                  <Line type="monotone" dataKey="aspi" name="ASPI" stroke="#9CA3AF" strokeWidth={2} strokeDasharray="5 3" dot={false} />
                  <Line type="monotone" dataKey="random" name="Random Picks" stroke="#F59E0B" strokeWidth={2} strokeDasharray="2 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* ── Performance Metrics ── */}
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20" />)}
          </div>
        ) : performance ? (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <MetricCard
              label="Win Rate"
              value={performance.total_sell_trades > 0 ? `${fmt1(performance.win_rate)}%` : '—'}
              sub={performance.total_sell_trades > 0
                ? `${performance.profitable_trades}/${performance.total_sell_trades} sells`
                : 'No sells yet'}
              color={performance.win_rate >= 50 ? 'text-emerald-500' : 'text-red-500'}
            />
            <MetricCard
              label="Total Return"
              value={`${performance.return_pct >= 0 ? '+' : ''}${fmt2(performance.return_pct)}%`}
              sub={fmtLKR(performance.total_return)}
              color={performance.return_pct >= 0 ? 'text-emerald-500' : 'text-red-500'}
            />
            <MetricCard
              label="Total Trades"
              value={String(performance.total_trades)}
              sub={`${performance.total_sell_trades} sells`}
            />
            <MetricCard
              label="Avg Trade Return"
              value={performance.total_sell_trades > 0
                ? `${performance.avg_return_per_trade >= 0 ? '+' : ''}${fmtLKR(performance.avg_return_per_trade)}`
                : '—'}
              sub="per closed trade"
              color={performance.avg_return_per_trade > 0 ? 'text-emerald-500' : undefined}
            />
            <MetricCard
              label="Total Fees Paid"
              value={fmtLKR(performance.total_fees)}
              sub="1.12% CSE rate"
            />
          </div>
        ) : null}

        {/* ── Trade Log ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
              <CardTitle className="text-base">Trade Log</CardTitle>
              <div className="flex gap-2 flex-wrap">
                <select
                  value={dirFilter}
                  onChange={(e) => setDirFilter(e.target.value as typeof dirFilter)}
                  className="h-8 rounded-md border border-input bg-background text-foreground px-2 text-xs"
                  aria-label="Filter by trade direction"
                >
                  <option value="ALL">All Directions</option>
                  <option value="BUY">Buy</option>
                  <option value="SELL">Sell</option>
                </select>
                <select
                  value={srcFilter}
                  onChange={(e) => setSrcFilter(e.target.value as typeof srcFilter)}
                  className="h-8 rounded-md border border-input bg-background text-foreground px-2 text-xs"
                  aria-label="Filter by trade source"
                >
                  <option value="ALL">All Sources</option>
                  <option value="AI_AUTO">AI Auto</option>
                  <option value="MANUAL">Manual</option>
                  <option value="AI_SIGNAL">AI Signal</option>
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {tradesLoading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : filteredTrades.length === 0 ? (
              <div className="text-center py-10 space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Your trade history will appear here</p>
                <p className="text-xs text-muted-foreground">Use Quick Trade or Let AI Trade on the Demo Portfolio page to get started</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead>Dir</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Fee</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Reasoning</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTrades.map((t) => (
                      <>
                        <TableRow key={t.id} className="cursor-pointer hover:bg-muted/30" onClick={() => t.ai_reasoning && toggleRow(t.id)}>
                          <TableCell className="text-muted-foreground">
                            {t.ai_reasoning
                              ? expandedRows.has(t.id)
                                ? <ChevronDown className="h-3.5 w-3.5" />
                                : <ChevronRight className="h-3.5 w-3.5" />
                              : null}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(t.executed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                          </TableCell>
                          <TableCell className="font-mono font-semibold text-sm">{t.symbol}</TableCell>
                          <TableCell>
                            <span className={`text-sm font-semibold ${t.direction === 'BUY' ? 'text-emerald-500' : 'text-red-500'}`}>
                              {t.direction === 'BUY' ? <TrendingUp className="h-3.5 w-3.5 inline mr-0.5" /> : <TrendingDown className="h-3.5 w-3.5 inline mr-0.5" />}
                              {t.direction}
                            </span>
                          </TableCell>
                          <TableCell className="num text-sm">{safeNum(t.quantity).toLocaleString()}</TableCell>
                          <TableCell className="num text-sm">LKR {fmt2(t.price)}</TableCell>
                          <TableCell className="num text-sm text-muted-foreground">LKR {fmt2(t.fee)}</TableCell>
                          <TableCell><SourceBadge source={t.source} /></TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                            {t.ai_reasoning ? (
                              <span className="text-blue-500 dark:text-blue-400 cursor-pointer">View reasoning ↓</span>
                            ) : '—'}
                          </TableCell>
                        </TableRow>
                        {expandedRows.has(t.id) && t.ai_reasoning && (
                          <TableRow key={`${t.id}-expand`} className="bg-muted/20">
                            <TableCell colSpan={9} className="py-3 px-4">
                              <div className="text-sm text-muted-foreground italic border-l-2 border-blue-500/50 pl-3">
                                {t.ai_reasoning}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    ))}
                  </TableBody>
                </Table>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
                    <span>Page {tradePage} of {totalPages} ({tradeTotal} total trades)</span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" disabled={tradePage <= 1} onClick={() => setTradePage((p) => p - 1)}>
                        Previous
                      </Button>
                      <Button size="sm" variant="outline" disabled={tradePage >= totalPages} onClick={() => setTradePage((p) => p + 1)}>
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Bottom row: Sector Pie + Shariah ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Sector Allocation */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Sector Allocation</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-40" />
              ) : holdings.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
                  No holdings to show allocation.
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width={160} height={160}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={2}>
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={SECTOR_COLORS[i % SECTOR_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                        formatter={(v: unknown) => [fmtLKR(v)]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 flex-1">
                    {pieData.map((entry, i) => {
                      const totalVal = pieData.reduce((s, e) => s + e.value, 0);
                      const pct = totalVal > 0 ? (entry.value / totalVal) * 100 : 0;
                      return (
                        <div key={entry.name} className="flex items-center gap-2 text-sm">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: SECTOR_COLORS[i % SECTOR_COLORS.length] }} />
                          <span className="text-muted-foreground flex-1">{entry.name}</span>
                          <span className="num font-medium">{pct.toFixed(1)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Shariah Compliance */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                Shariah Compliance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <Skeleton className="h-24" />
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-sm">Compliance Rate</span>
                    <span className={`num text-2xl font-bold ${compliantPct >= 100 ? 'text-emerald-500' : 'text-amber-500'}`}>
                      {fmt1(compliantPct)}%
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${compliantPct >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                      style={{ width: `${Math.min(100, compliantPct)}%` }}
                    />
                  </div>
                  {compliantPct < 100 && compliantPct > 0 && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                      Some stocks pending Shariah screening data — not confirmed non-compliant
                    </p>
                  )}
                  <div className="text-sm text-muted-foreground space-y-1">
                    {holdings.length === 0 ? (
                      <p>No holdings yet.</p>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-emerald-500" />
                          <span>
                            {compliantCount} of {holdings.length} holding{holdings.length !== 1 ? 's' : ''} {compliantCount === holdings.length ? 'are' : 'is'} AAOIFI compliant
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground pl-6">
                          Purification pending: LKR 0.00
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
