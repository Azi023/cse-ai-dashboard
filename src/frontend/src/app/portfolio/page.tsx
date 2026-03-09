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
  type PortfolioHolding,
  type PortfolioSummary,
  type PortfolioShariahSummary,
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
  PieChart,
} from 'lucide-react';

export default function PortfolioPage() {
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [shariahSummary, setShariahSummary] =
    useState<PortfolioShariahSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [holdingsRes, summaryRes, shariahRes] = await Promise.allSettled([
        portfolioApi.getAll(),
        portfolioApi.getSummary(),
        portfolioApi.getShariah(),
      ]);

      if (holdingsRes.status === 'fulfilled')
        setHoldings(holdingsRes.value.data);
      if (summaryRes.status === 'fulfilled')
        setSummary(summaryRes.value.data);
      if (shariahRes.status === 'fulfilled')
        setShariahSummary(shariahRes.value.data);
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
    return () => clearInterval(interval);
  }, [fetchData]);

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
              Make sure the backend server is running on port 3001
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
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )
          }
        />
        <SummaryCard
          title="Shariah Compliant"
          value={shariahSummary?.compliant_percent ?? null}
          format="percent"
          loading={loading}
          icon={<ShieldCheck className="h-4 w-4 text-green-500" />}
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
            <p className="text-sm text-muted-foreground text-center py-8">
              No holdings yet. Click &ldquo;Add Holding&rdquo; to get started.
            </p>
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
                          ? h.allocation_percent.toFixed(1) + '%'
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
              <span className="text-green-500">
                {shariahSummary.compliant_count} Compliant
              </span>
              <span className="text-red-500">
                {shariahSummary.non_compliant_count} Non-Compliant
              </span>
              <span className="text-yellow-500">
                {shariahSummary.pending_count} Pending
              </span>
              <span className="text-muted-foreground">
                {shariahSummary.compliant_percent.toFixed(1)}% of portfolio
                value is Shariah compliant
              </span>
            </div>
          </CardContent>
        </Card>
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
}: {
  title: string;
  value: number | null;
  format: 'currency' | 'pnl' | 'percent';
  percent?: number | null;
  loading: boolean;
  icon: React.ReactNode;
}) {
  const formatValue = (v: number) => {
    if (format === 'percent') return v.toFixed(1) + '%';
    const prefix = format === 'pnl' ? (v >= 0 ? '+' : '') : '';
    return prefix + 'LKR ' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const colorClass =
    format === 'pnl' && value != null
      ? value >= 0
        ? 'text-green-500'
        : 'text-red-500'
      : '';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div>
            <div className={`text-2xl font-bold ${colorClass}`}>
              {value != null ? formatValue(value) : '—'}
            </div>
            {percent != null && (
              <p
                className={`text-xs ${percent >= 0 ? 'text-green-500' : 'text-red-500'}`}
              >
                {percent >= 0 ? '+' : ''}
                {percent.toFixed(2)}%
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
  const color = value > 0 ? 'text-green-500' : value < 0 ? 'text-red-500' : '';
  return (
    <span className={color}>
      {value > 0 ? '+' : ''}
      {value.toFixed(2)}
      {suffix}
    </span>
  );
}

function ShariahBadge({ status }: { status: string }) {
  switch (status) {
    case 'compliant':
      return (
        <Badge variant="outline" className="border-green-500 text-green-500 text-xs">
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
              title={`${item.label}: ${item.percent.toFixed(1)}%`}
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
                {item.percent.toFixed(1)}%
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
  const [buyDate, setBuyDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!symbol.trim() || !quantity || !buyPrice || !buyDate) {
      setFormError('All fields except notes are required');
      return;
    }

    setSubmitting(true);
    try {
      await portfolioApi.add({
        symbol: symbol.trim().toUpperCase(),
        quantity: Number(quantity),
        buy_price: Number(buyPrice),
        buy_date: buyDate,
        notes: notes.trim() || undefined,
      });
      onSuccess();
    } catch (err) {
      setFormError('Failed to add holding');
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
        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-6">
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
        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-5">
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
