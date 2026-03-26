'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  portfolioApi,
  atradApi,
  analysisApi,
  type PortfolioHolding,
  type PortfolioSummary,
  type PortfolioShariahSummary,
  type PurificationSummary,
  type ATradSyncStatus,
  type PositionRiskData,
  type PortfolioRiskSummary,
} from '@/lib/api';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Plus,
  Pencil,
  Trash2,
  X,
  ShieldCheck,
  ShieldAlert,
  PieChart,
  Heart,
  RefreshCw,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { safeNum } from '@/lib/format';

export default function PortfolioPage() {
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [shariahSummary, setShariahSummary] =
    useState<PortfolioShariahSummary | null>(null);
  const [purification, setPurification] =
    useState<PurificationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [riskData, setRiskData] = useState<PortfolioRiskSummary | null>(null);
  const [atradStatus, setAtradStatus] = useState<ATradSyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [holdingsRes, summaryRes, shariahRes, purificationRes, riskRes] =
        await Promise.allSettled([
          portfolioApi.getAll(),
          portfolioApi.getSummary(),
          portfolioApi.getShariah(),
          portfolioApi.getPurification(),
          analysisApi.getPortfolioRisk(),
        ]);

      if (holdingsRes.status === 'fulfilled')
        setHoldings(holdingsRes.value.data);
      if (summaryRes.status === 'fulfilled')
        setSummary(summaryRes.value.data);
      if (shariahRes.status === 'fulfilled')
        setShariahSummary(shariahRes.value.data);
      if (purificationRes.status === 'fulfilled')
        setPurification(purificationRes.value.data);
      if (riskRes.status === 'fulfilled')
        setRiskData(riskRes.value.data);
    } catch (err) {
      setError('Failed to load portfolio data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    atradApi.getStatus().then((res) => setAtradStatus(res.data)).catch(() => {});
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleAtradSync = async () => {
    setSyncing(true);
    try {
      await atradApi.sync();
      await fetchData();
      const statusRes = await atradApi.getStatus();
      setAtradStatus(statusRes.data);
    } catch {
      // silent
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await portfolioApi.delete(id);
      await fetchData();
    } catch (err) {
      console.error('Failed to delete holding', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* ATrad sync banner */}
      {atradStatus?.configured && (
        <div className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm ${atradStatus.syncSuccess ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-yellow-500/20 bg-yellow-500/5'}`}>
          <RefreshCw className={`h-3.5 w-3.5 ${atradStatus.syncSuccess ? 'text-emerald-500' : 'text-yellow-500'}`} />
          <span className={atradStatus.syncSuccess ? 'text-emerald-400' : 'text-yellow-400'}>
            {atradStatus.syncSuccess
              ? `Last synced from ATrad: ${atradStatus.lastSynced ? new Date(atradStatus.lastSynced).toLocaleTimeString() : 'recently'}`
              : 'ATrad sync not yet connected'}
          </span>
          <button
            onClick={handleAtradSync}
            disabled={syncing}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs hover:bg-muted/50 transition-colors disabled:opacity-50"
          >
            {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Sync Now
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">My Portfolio</h2>
          <p className="text-muted-foreground">
            Track your CSE holdings and performance
          </p>
        </div>
        <Button
          onClick={() => {
            setShowAddForm(!showAddForm);
            setEditingId(null);
          }}
          className="gap-1"
        >
          {showAddForm ? (
            <>
              <X className="h-4 w-4" /> Cancel
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" /> Add Holding
            </>
          )}
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <p className="text-sm text-destructive">{error}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Make sure the backend server is running on port 4101
            </p>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Form */}
      {showAddForm && (
        <AddHoldingForm
          onSuccess={() => {
            setShowAddForm(false);
            fetchData();
          }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {editingId != null && (
        <EditHoldingForm
          holding={holdings.find((h) => h.id === editingId)!}
          onSuccess={() => {
            setEditingId(null);
            fetchData();
          }}
          onCancel={() => setEditingId(null)}
        />
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard
          title="Total Value"
          value={summary?.total_value ?? null}
          format="currency"
          loading={loading}
          icon={<Wallet className="h-4 w-4 text-muted-foreground" />}
        />
        <SummaryCard
          title="Total Invested"
          value={summary?.total_invested ?? null}
          format="currency"
          loading={loading}
          icon={<PieChart className="h-4 w-4 text-muted-foreground" />}
        />
        <SummaryCard
          title="Total P&L"
          value={summary?.total_pnl ?? null}
          format="pnl"
          percent={summary?.total_pnl_percent ?? null}
          loading={loading}
          icon={
            (summary?.total_pnl ?? 0) >= 0 ? (
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )
          }
        />
        <SummaryCard
          title="Shariah Compliant"
          value={holdings.length === 0 ? null : (shariahSummary?.compliant_percent ?? null)}
          format="percent"
          loading={loading}
          icon={<ShieldCheck className="h-4 w-4 text-green-500" />}
          emptyLabel="Add holdings to track"
        />
      </div>

      {/* Holdings Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Holdings ({holdings.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : holdings.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-sm text-muted-foreground">
                No holdings yet. Click &ldquo;Add Holding&rdquo; to get started.
              </p>
              {atradStatus?.syncSuccess && (atradStatus.holdingsCount ?? 0) === 0 && (
                <p className="text-xs text-blue-400/80">
                  Your AEL.N0000 purchase (200 shares) will appear here after T+2 settlement — approx. Tuesday 18 March.
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Avg Price</TableHead>
                    <TableHead className="text-right">Current</TableHead>
                    <TableHead className="text-right">P&L</TableHead>
                    <TableHead className="text-right">P&L %</TableHead>
                    <TableHead className="text-right">Alloc %</TableHead>
                    <TableHead>Shariah</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holdings.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/stocks/${h.symbol}`}
                          className="text-primary hover:underline"
                        >
                          {h.symbol}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate">
                        {h.name}
                      </TableCell>
                      <TableCell className="text-right">{h.quantity}</TableCell>
                      <TableCell className="text-right">
                        {Number(h.buy_price).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        {h.current_price != null
                          ? Number(h.current_price).toFixed(2)
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <PnLValue value={h.pnl} />
                      </TableCell>
                      <TableCell className="text-right">
                        <PnLValue value={h.pnl_percent} suffix="%" />
                      </TableCell>
                      <TableCell className="text-right">
                        {h.allocation_percent != null
                          ? safeNum(h.allocation_percent).toFixed(1) + '%'
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <ShariahBadge status={h.shariah_status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => {
                              setEditingId(h.id);
                              setShowAddForm(false);
                            }}
                            className="p-1 text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(h.id)}
                            className="p-1 text-muted-foreground hover:text-red-500"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Risk Management */}
      {riskData && riskData.positions.length > 0 && (
        <RiskManagementCard riskData={riskData} />
      )}

      {/* Allocation Charts */}
      {summary && summary.holdings_count > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <AllocationCard
            title="Stock Allocation"
            items={summary.allocation.map((a) => ({
              label: a.symbol,
              value: a.value,
              percent: a.percent,
            }))}
          />
          <AllocationCard
            title="Sector Allocation"
            items={summary.sector_allocation.map((a) => ({
              label: a.sector,
              value: a.value,
              percent: a.percent,
            }))}
          />
        </div>
      )}

      {/* Shariah Compliance Summary */}
      {shariahSummary && shariahSummary.holdings.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              <CardTitle className="text-base">
                Shariah Compliance Summary
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6 text-sm mb-4">
              <span className="text-emerald-500">
                {shariahSummary.compliant_count} Compliant
              </span>
              <span className="text-red-500">
                {shariahSummary.non_compliant_count} Non-Compliant
              </span>
              <span className="text-yellow-500">
                {shariahSummary.pending_count} Pending
              </span>
              <span className="text-muted-foreground">
                {safeNum(shariahSummary.compliant_percent).toFixed(1)}% of portfolio
                value is Shariah compliant
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Purification Calculator */}
      {holdings.length > 0 && (
        <PurificationSection
          holdings={holdings}
          purification={purification}
          onUpdate={fetchData}
        />
      )}
    </div>
  );
}

// ---------- Sub-components ----------

function SummaryCard({
  title,
  value,
  format,
  percent,
  loading,
  icon,
  emptyLabel,
}: {
  title: string;
  value: number | null;
  format: 'currency' | 'pnl' | 'percent';
  percent?: number | null;
  loading: boolean;
  icon: React.ReactNode;
  emptyLabel?: string;
}) {
  const formatValue = (v: number) => {
    const n = safeNum(v);
    if (format === 'percent') return n.toFixed(1) + '%';
    const prefix = format === 'pnl' ? (n >= 0 ? '+' : '') : '';
    return prefix + 'LKR ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const colorClass =
    format === 'pnl' && value != null
      ? value >= 0
        ? 'text-emerald-500'
        : 'text-red-500'
      : '';

  return (
    <Card hover>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-8 w-24 skeleton-shimmer rounded" />
        ) : (
          <div>
            <div className={`text-2xl font-bold num ${colorClass}`}>
              {value != null ? formatValue(value) : '—'}
            </div>
            {value == null && emptyLabel && (
              <p className="text-xs text-muted-foreground mt-1">{emptyLabel}</p>
            )}
            {percent != null && (
              <p className={`text-xs num font-medium ${percent >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {percent >= 0 ? '+' : ''}
                {safeNum(percent).toFixed(2)}%
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PnLValue({
  value,
  suffix = '',
}: {
  value: number | null;
  suffix?: string;
}) {
  if (value == null) return <span>—</span>;
  const color = value > 0 ? 'text-emerald-500' : value < 0 ? 'text-red-500' : '';
  return (
    <span className={`${color} num font-medium`}>
      {value > 0 ? '+' : ''}
      {safeNum(value).toFixed(2)}
      {suffix}
    </span>
  );
}

function ShariahBadge({ status }: { status: string }) {
  switch (status) {
    case 'compliant':
      return (
        <Badge variant="outline" className="border-emerald-500 text-emerald-500 text-xs">
          Compliant
        </Badge>
      );
    case 'non_compliant':
      return (
        <Badge variant="outline" className="border-red-500 text-red-500 text-xs">
          Non-Compliant
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="border-yellow-500 text-yellow-500 text-xs">
          Pending
        </Badge>
      );
  }
}

function AllocationCard({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; value: number; percent: number }>;
}) {
  const colors = [
    'bg-blue-500',
    'bg-green-500',
    'bg-yellow-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-cyan-500',
    'bg-orange-500',
    'bg-red-500',
    'bg-indigo-500',
    'bg-teal-500',
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <PieChart className="h-4 w-4" />
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {/* Bar visualization */}
        <div className="flex h-4 w-full overflow-hidden rounded-full mb-4">
          {items.map((item, i) => (
            <div
              key={item.label}
              className={`${colors[i % colors.length]}`}
              style={{ width: `${item.percent}%` }}
              title={`${item.label}: ${safeNum(item.percent).toFixed(1)}%`}
            />
          ))}
        </div>
        {/* Legend */}
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={item.label} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div
                  className={`h-3 w-3 rounded-full ${colors[i % colors.length]}`}
                />
                <span className="truncate max-w-[150px]">{item.label}</span>
              </div>
              <span className="text-muted-foreground">
                {safeNum(item.percent).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AddHoldingForm({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [symbol, setSymbol] = useState('');
  const [quantity, setQuantity] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [fees, setFees] = useState('');
  const [buyDate, setBuyDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!symbol.trim() || !quantity || !buyPrice || !buyDate) {
      setFormError('All fields except fees and notes are required');
      return;
    }

    setSubmitting(true);
    try {
      await portfolioApi.add({
        symbol: symbol.trim().toUpperCase(),
        quantity: Number(quantity),
        buy_price: Number(buyPrice),
        buy_date: buyDate,
        fees: fees ? Number(fees) : undefined,
        notes: notes.trim() || undefined,
      });
      onSuccess();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      const msg =
        axiosErr?.response?.data?.message ??
        'Failed to add holding. Use full CSE symbol format (e.g. JKH.N0000).';
      setFormError(msg);
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add New Holding</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 md:grid-cols-6">
          <div>
            <label className="text-xs text-muted-foreground">
              Symbol
            </label>
            <Input
              placeholder="e.g. JKH.N0000"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">
              Quantity
            </label>
            <Input
              type="number"
              min="1"
              placeholder="100"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">
              Buy Price (LKR)
            </label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="150.00"
              value={buyPrice}
              onChange={(e) => setBuyPrice(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">
              Broker Fees, LKR (optional)
            </label>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={fees}
              onChange={(e) => setFees(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">
              Buy Date
            </label>
            <Input
              type="date"
              value={buyDate}
              onChange={(e) => setBuyDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">
              Notes (optional)
            </label>
            <Input
              placeholder="Optional notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Adding...' : 'Add'}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
          {formError && (
            <p className="text-sm text-destructive col-span-full">
              {formError}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function PurificationSection({
  holdings,
  purification,
  onUpdate,
}: {
  holdings: PortfolioHolding[];
  purification: PurificationSummary | null;
  onUpdate: () => void;
}) {
  const [editingSymbol, setEditingSymbol] = useState<string | null>(null);
  const [dividends, setDividends] = useState('');
  const [rate, setRate] = useState('');
  const [saving, setSaving] = useState(false);

  const startEdit = (h: PortfolioHolding) => {
    setEditingSymbol(h.symbol);
    setDividends(String(h.dividends_received));
    setRate(String((safeNum(h.purification_rate) * 100).toFixed(2)));
  };

  const handleSave = async (holdingId: number) => {
    setSaving(true);
    try {
      await portfolioApi.update(holdingId, {
        dividends_received: Number(dividends),
        purification_rate: Number(rate) / 100,
      });
      setEditingSymbol(null);
      onUpdate();
    } catch (err) {
      console.error('Failed to update purification data', err);
    } finally {
      setSaving(false);
    }
  };

  const totalPurification = purification?.total_purification ?? 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Heart className="h-4 w-4 text-pink-500" />
          <CardTitle className="text-base">Purification Calculator</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Total */}
        <div className="flex items-center justify-between rounded-lg border border-pink-500/20 bg-pink-500/5 p-4">
          <div>
            <p className="text-sm text-muted-foreground">
              Total Purification Amount
            </p>
            <p className="text-2xl font-bold text-pink-500">
              LKR{' '}
              {safeNum(totalPurification).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <p>
              Total Dividends: LKR{' '}
              {safeNum(purification?.total_dividends).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </div>
        </div>

        {/* Per-holding table */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Shariah</TableHead>
              <TableHead className="text-right">Dividends (LKR)</TableHead>
              <TableHead className="text-right">Rate %</TableHead>
              <TableHead className="text-right">Purification (LKR)</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {holdings.map((h) => {
              const purEntry = purification?.holdings.find(
                (p) => p.symbol === h.symbol,
              );
              const isEditing = editingSymbol === h.symbol;
              const purAmount =
                h.shariah_status !== 'non_compliant'
                  ? h.dividends_received * h.purification_rate
                  : 0;

              return (
                <TableRow key={h.id}>
                  <TableCell className="font-medium">{h.symbol}</TableCell>
                  <TableCell className="max-w-[150px] truncate">
                    {h.name}
                  </TableCell>
                  <TableCell>
                    <ShariahBadge status={h.shariah_status} />
                  </TableCell>
                  <TableCell className="text-right">
                    {isEditing ? (
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={dividends}
                        onChange={(e) => setDividends(e.target.value)}
                        className="w-28 ml-auto"
                      />
                    ) : (
                      Number(h.dividends_received).toFixed(2)
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {isEditing ? (
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={rate}
                        onChange={(e) => setRate(e.target.value)}
                        className="w-20 ml-auto"
                      />
                    ) : (
                      (Number(h.purification_rate) * 100).toFixed(2) + '%'
                    )}
                  </TableCell>
                  <TableCell className="text-right text-pink-500">
                    {safeNum(purAmount).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    {isEditing ? (
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          onClick={() => handleSave(h.id)}
                          disabled={saving}
                        >
                          {saving ? '...' : 'Save'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingSymbol(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(h)}
                        className="p-1 text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <p className="text-xs text-muted-foreground italic">
          Purification amounts are estimates based on a default 3%
          non-compliant income ratio. Click the edit icon to enter actual
          dividends received and adjust the purification rate per stock. Consult
          a qualified Shariah scholar for exact calculations.
        </p>
      </CardContent>
    </Card>
  );
}

function RiskManagementCard({ riskData }: { riskData: PortfolioRiskSummary }) {
  const heatStatus = riskData.risk_status ?? 'SAFE';
  const heatPct = safeNum(riskData.total_heat_pct);

  const statusColor =
    heatStatus === 'DANGER'
      ? 'text-red-500 border-red-500/30 bg-red-500/5'
      : heatStatus === 'CAUTION'
      ? 'text-yellow-500 border-yellow-500/30 bg-yellow-500/5'
      : 'text-emerald-500 border-emerald-500/30 bg-emerald-500/5';

  const barColor =
    heatStatus === 'DANGER'
      ? 'bg-red-500'
      : heatStatus === 'CAUTION'
      ? 'bg-yellow-500'
      : 'bg-emerald-500';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" />
            <CardTitle className="text-base">Risk Management</CardTitle>
          </div>
          <div className={`flex items-center gap-2 rounded-lg border px-3 py-1 text-xs font-semibold ${statusColor}`}>
            {heatStatus === 'DANGER' ? (
              <AlertTriangle className="h-3.5 w-3.5" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )}
            Portfolio Heat: {heatPct.toFixed(1)}% — {heatStatus}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Heat bar */}
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>Portfolio Heat (% of capital at risk)</span>
            <span>{heatPct.toFixed(2)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${Math.min(heatPct * 5, 100)}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted-foreground/60">
            <span>0% Safe</span>
            <span>10% Caution</span>
            <span>20%+ Danger</span>
          </div>
        </div>

        {/* Per-position risk table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead className="text-right">Entry</TableHead>
                <TableHead className="text-right">Current</TableHead>
                <TableHead className="text-right">Stop-Loss</TableHead>
                <TableHead className="text-right">Take-Profit</TableHead>
                <TableHead className="text-right">R:R</TableHead>
                <TableHead className="text-right">Distance</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {riskData.positions.map((pos, index) => {
                const distPct = safeNum(pos.distance_to_stop_pct);
                const nearStop = distPct < 5 && distPct >= 0;
                const rr = safeNum(pos.risk_reward_ratio);
                return (
                  <TableRow key={`${pos.symbol}-${index}`}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        {nearStop && (
                          <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                        )}
                        {pos.symbol}
                      </div>
                    </TableCell>
                    <TableCell className="text-right num">
                      {Number(pos.entry_price).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right num">
                      {Number(pos.current_price).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`num font-medium ${nearStop ? 'text-red-500' : 'text-red-400'}`}>
                        {Number(pos.recommended_stop).toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="num font-medium text-emerald-500">
                        {Number(pos.take_profit).toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`num text-xs font-semibold ${rr >= 2 ? 'text-emerald-500' : rr >= 1 ? 'text-yellow-500' : 'text-red-500'}`}>
                        1:{rr.toFixed(1)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`num text-xs ${nearStop ? 'text-red-500 font-semibold' : 'text-muted-foreground'}`}>
                        {distPct.toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          pos.risk_status === 'DANGER'
                            ? 'border-red-500 text-red-500 text-xs'
                            : pos.risk_status === 'CAUTION'
                            ? 'border-yellow-500 text-yellow-500 text-xs'
                            : 'border-emerald-500 text-emerald-500 text-xs'
                        }
                      >
                        {pos.risk_status ?? 'SAFE'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs text-muted-foreground italic">
          Stop-loss: ATR-based (entry − 2×ATR) or support-buffered, whichever is tighter.
          Take-profit: minimum 1:2 risk-reward. Runs daily at 2:43 PM SLT.
        </p>
      </CardContent>
    </Card>
  );
}

function EditHoldingForm({
  holding,
  onSuccess,
  onCancel,
}: {
  holding: PortfolioHolding;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [quantity, setQuantity] = useState(String(holding.quantity));
  const [buyPrice, setBuyPrice] = useState(String(holding.buy_price));
  const [buyDate, setBuyDate] = useState(
    new Date(holding.buy_date).toISOString().split('T')[0],
  );
  const [notes, setNotes] = useState(holding.notes ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      await portfolioApi.update(holding.id, {
        quantity: Number(quantity),
        buy_price: Number(buyPrice),
        buy_date: buyDate,
        notes: notes.trim() || undefined,
      });
      onSuccess();
    } catch (err) {
      setFormError('Failed to update holding');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="text-base">
          Edit Holding — {holding.symbol}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 md:grid-cols-5">
          <div>
            <label className="text-xs text-muted-foreground">
              Quantity
            </label>
            <Input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">
              Buy Price (LKR)
            </label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={buyPrice}
              onChange={(e) => setBuyPrice(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">
              Buy Date
            </label>
            <Input
              type="date"
              value={buyDate}
              onChange={(e) => setBuyDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">
              Notes
            </label>
            <Input
              placeholder="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save'}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
          {formError && (
            <p className="text-sm text-destructive col-span-full">
              {formError}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
