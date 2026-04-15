'use client';

import { useCallback, useEffect, useState } from 'react';
import { Play, Pause, Trash2, Plus, RefreshCw, Loader2 } from 'lucide-react';
import { cryptoDcaApi, type DCAPlan, type DCAPerformance } from '@/lib/api';

const SUPPORTED_SYMBOLS = ['BTC/USDT', 'ETH/USDT'] as const;
const FREQUENCIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
] as const;

function formatUsd(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPct(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

export function DcaPanel() {
  const [plans, setPlans] = useState<DCAPlan[]>([]);
  const [performance, setPerformance] = useState<DCAPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [newSymbol, setNewSymbol] =
    useState<(typeof SUPPORTED_SYMBOLS)[number]>('BTC/USDT');
  const [newAmount, setNewAmount] = useState('50');
  const [newFrequency, setNewFrequency] =
    useState<(typeof FREQUENCIES)[number]['value']>('weekly');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [plansRes, perfRes] = await Promise.all([
        cryptoDcaApi.listPlans(),
        cryptoDcaApi.performance().catch(() => ({ data: null })),
      ]);
      setPlans(plansRes.data);
      setPerformance(perfRes.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load DCA plans');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(newAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Amount must be a positive number');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await cryptoDcaApi.createPlan({
        symbol: newSymbol,
        amount_usdt: amount,
        frequency: newFrequency,
      });
      setShowForm(false);
      setNewAmount('50');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create plan');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (plan: DCAPlan) => {
    try {
      if (plan.is_active) {
        await cryptoDcaApi.pausePlan(plan.id);
      } else {
        await cryptoDcaApi.resumePlan(plan.id);
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Toggle failed');
    }
  };

  const handleDelete = async (plan: DCAPlan) => {
    if (!confirm(`Delete DCA plan for ${plan.symbol}? This cannot be undone.`))
      return;
    try {
      await cryptoDcaApi.deletePlan(plan.id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  return (
    <section
      aria-label="DCA plans"
      className="rounded-xl border bg-card p-6 space-y-4"
    >
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            DCA — Dollar Cost Averaging
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Automated recurring crypto buys. Paper trading only — no real
            exchange orders placed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground hover:text-foreground hover:bg-accent"
            aria-label="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setShowForm((s) => !s)}
            className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {showForm ? 'Cancel' : 'New plan'}
          </button>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-md border bg-muted/40 p-4 space-y-3"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-xs text-muted-foreground space-y-1 block">
              Symbol
              <select
                value={newSymbol}
                onChange={(e) =>
                  setNewSymbol(
                    e.target.value as (typeof SUPPORTED_SYMBOLS)[number],
                  )
                }
                className="mt-1 block w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              >
                {SUPPORTED_SYMBOLS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground space-y-1 block">
              Amount per buy (USDT)
              <input
                type="number"
                min="1"
                step="0.01"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                className="mt-1 block w-full rounded-md border bg-background px-2 py-1.5 text-sm num"
              />
            </label>
            <label className="text-xs text-muted-foreground space-y-1 block">
              Frequency
              <select
                value={newFrequency}
                onChange={(e) =>
                  setNewFrequency(
                    e.target.value as (typeof FREQUENCIES)[number]['value'],
                  )
                }
                className="mt-1 block w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              >
                {FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            Create plan
          </button>
        </form>
      )}

      {performance && plans.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <Metric label="Invested" value={formatUsd(performance.totals.totalInvested)} />
          <Metric label="Current value" value={formatUsd(performance.totals.currentValue)} />
          <Metric
            label="P&L"
            value={formatUsd(performance.totals.unrealizedPnl)}
            tone={performance.totals.unrealizedPnl >= 0 ? 'up' : 'down'}
          />
          <Metric
            label="P&L %"
            value={formatPct(performance.totals.pnlPct)}
            tone={performance.totals.pnlPct >= 0 ? 'up' : 'down'}
          />
        </div>
      )}

      {loading && plans.length === 0 ? (
        <SkeletonRows />
      ) : plans.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No DCA plans yet. Create one to start recurring buys on BTC/USDT or
          ETH/USDT.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {plans.map((plan) => {
            const perf = performance?.plans.find((p) => p.id === plan.id);
            const paused = !plan.is_active;
            return (
              <li
                key={plan.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{plan.symbol}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatUsd(Number(plan.amount_usdt))} / {plan.frequency}
                    </span>
                    {paused && (
                      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-400">
                        Paused
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground num">
                    invested {formatUsd(Number(plan.total_invested))} ·{' '}
                    {Number(plan.total_units_bought).toFixed(6)} coins · avg{' '}
                    {formatUsd(Number(plan.average_cost))}
                    {perf && (
                      <span
                        className={`ml-2 ${perf.unrealized_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                      >
                        {formatPct(perf.pnl_pct)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggle(plan)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground hover:text-foreground hover:bg-accent"
                    aria-label={paused ? 'Resume plan' : 'Pause plan'}
                  >
                    {paused ? (
                      <Play className="h-4 w-4" aria-hidden />
                    ) : (
                      <Pause className="h-4 w-4" aria-hidden />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(plan)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                    aria-label="Delete plan"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'up' | 'down';
}) {
  const color =
    tone === 'up'
      ? 'text-emerald-400'
      : tone === 'down'
        ? 'text-red-400'
        : 'text-foreground';
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`mt-0.5 text-sm font-semibold num ${color}`}>{value}</div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-14 rounded-md border bg-muted/20 animate-pulse"
        />
      ))}
    </div>
  );
}
