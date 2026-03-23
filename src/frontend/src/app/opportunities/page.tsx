'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  opportunitiesApi,
  type TradeOpportunity,
  type RiskSummary,
  type SelectionPreview,
} from '@/lib/api';
import {
  TrendingUp,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  CheckSquare,
  Square,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  Zap,
  BarChart3,
  Filter,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import { format } from 'date-fns';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STRENGTH_CONFIG = {
  VERY_STRONG: { color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30', bar: 'bg-blue-500' },
  STRONG: { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', bar: 'bg-emerald-500' },
  MODERATE: { color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30', bar: 'bg-yellow-500' },
  WEAK: { color: 'text-muted-foreground', bg: 'bg-muted/20 border-muted-foreground/20', bar: 'bg-muted-foreground' },
};

function fmtLkr(n: number): string {
  return `LKR ${n.toLocaleString('en-LK', { maximumFractionDigits: 0 })}`;
}

function fmtPrice(n: number): string {
  return n.toFixed(2);
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function RiskBudgetBar({ summary }: { summary: RiskSummary }) {
  const usedPct = Math.min(100, (summary.used_pct / summary.daily_budget_pct) * 100);
  const isExceeded = summary.used_pct >= summary.daily_budget_pct;

  return (
    <Card className="border-primary/20 bg-card/60">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Daily Risk Budget</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {summary.daily_budget_pct}% max
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">
              Used: <span className={`font-medium num ${isExceeded ? 'text-red-400' : 'text-foreground'}`}>
                {fmtLkr(summary.used_lkr)}
              </span>
            </span>
            <span className="text-muted-foreground">
              Remaining: <span className="font-medium text-emerald-400 num">{fmtLkr(summary.remaining_lkr)}</span>
            </span>
          </div>
        </div>
        <div className="h-2 w-full rounded-full bg-muted/40 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${isExceeded ? 'bg-red-500' : 'bg-primary'}`}
            style={{ width: `${usedPct}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-[10px] text-muted-foreground num">
          <span>0%</span>
          <span>{summary.used_pct.toFixed(2)}% used of {summary.daily_budget_pct}%</span>
          <span>{summary.daily_budget_pct}%</span>
        </div>
      </CardContent>
    </Card>
  );
}

function StrengthBar({ score, label }: { score: number; label: TradeOpportunity['strength']['label'] }) {
  const cfg = STRENGTH_CONFIG[label];
  const pct = (score / 10) * 100;

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-muted/40 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${cfg.bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-bold num ${cfg.color}`}>{score.toFixed(1)}</span>
    </div>
  );
}

function OpportunityCard({
  opp,
  selected,
  onToggle,
}: {
  opp: TradeOpportunity;
  selected: boolean;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STRENGTH_CONFIG[opp.strength.label];
  const isCompliant = opp.shariah_status === 'COMPLIANT';

  return (
    <Card
      className={`transition-all duration-150 cursor-pointer ${
        selected ? 'ring-2 ring-primary border-primary/50' : 'hover:border-muted-foreground/30'
      }`}
    >
      <CardContent className="p-4">
        {/* Header row */}
        <div className="flex items-start gap-3">
          {/* Checkbox */}
          <button
            onClick={onToggle}
            className="mt-0.5 text-primary hover:text-primary/80 flex-shrink-0"
          >
            {selected ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5 text-muted-foreground" />}
          </button>

          {/* Rank + Symbol */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground num">#{opp.rank}</span>
              <span className="font-bold text-sm font-mono">{opp.symbol.replace('.N0000', '')}</span>
              <span className="text-xs text-muted-foreground truncate">{opp.company_name}</span>
              {isCompliant && (
                <Badge className="text-[9px] px-1 py-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                  <ShieldCheck className="h-2.5 w-2.5 mr-0.5" />
                  Halal
                </Badge>
              )}
              {opp.sector && (
                <span className="text-[10px] text-muted-foreground/70 border border-border/50 rounded px-1">
                  {opp.sector}
                </span>
              )}
            </div>

            {/* Strength bar */}
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${cfg.color}`}>
                  {opp.strength.label.replace('_', ' ')}
                </span>
                <span className="text-[10px] text-muted-foreground">{opp.technical_signal}</span>
              </div>
              <StrengthBar score={opp.strength.score} label={opp.strength.label} />
            </div>
          </div>

          {/* Price col */}
          <div className="text-right flex-shrink-0">
            <div className="text-lg font-bold num">LKR {fmtPrice(opp.current_price)}</div>
            <div className="text-xs text-muted-foreground">Current</div>
          </div>
        </div>

        {/* Risk/Reward row */}
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-md bg-muted/20 p-2">
            <div className="text-muted-foreground mb-0.5">Entry</div>
            <div className="font-medium num">{fmtPrice(opp.suggested_entry)}</div>
          </div>
          <div className="rounded-md bg-red-500/5 border border-red-500/10 p-2">
            <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
              <ArrowDownRight className="h-3 w-3 text-red-400" />
              Stop
            </div>
            <div className="font-medium text-red-400 num">{fmtPrice(opp.stop_loss)}</div>
          </div>
          <div className="rounded-md bg-emerald-500/5 border border-emerald-500/10 p-2">
            <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
              <ArrowUpRight className="h-3 w-3 text-emerald-400" />
              Target
            </div>
            <div className="font-medium text-emerald-400 num">{fmtPrice(opp.take_profit)}</div>
          </div>
        </div>

        {/* Position sizing row */}
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span className="num">
            {opp.position_size_shares} shares @ {fmtLkr(opp.position_value_lkr)}
          </span>
          <span>
            Risk: <span className="text-red-400 font-medium num">{fmtLkr(opp.risk_per_trade_lkr)}</span>
            {' | '}
            R:R <span className="text-emerald-400 font-medium">{opp.risk_reward_ratio}</span>
          </span>
        </div>

        {/* Expand/collapse factors */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 w-full flex items-center justify-between text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          <span>Why this stock?</span>
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>

        {expanded && (
          <div className="mt-2 space-y-1">
            {opp.strength.factors.map((f, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <span className="text-primary mt-0.5">•</span>
                <span>{f}</span>
              </div>
            ))}
            {opp.reasoning && (
              <p className="text-[11px] text-muted-foreground/70 mt-1.5 italic border-t border-border/30 pt-1.5">
                {opp.reasoning}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConfirmationModal({
  preview,
  onConfirm,
  onCancel,
  executing,
}: {
  preview: SelectionPreview;
  onConfirm: () => void;
  onCancel: () => void;
  executing: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-md border-border/50 shadow-2xl">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Confirm Trades</CardTitle>
            <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {preview.exceeds_budget && (
            <div className="flex items-center gap-2 rounded-md bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {preview.message}
            </div>
          )}

          <div className="space-y-2">
            {preview.trades.map((t) => (
              <div key={t.symbol} className="flex items-center justify-between text-sm">
                <span className="font-mono font-medium">{t.symbol.replace('.N0000', '')}</span>
                <span className="text-muted-foreground num">{t.quantity} shares</span>
                <span className="num">{fmtLkr(t.entry_price * t.quantity)}</span>
                <span className="text-red-400 text-xs num">Risk {fmtLkr(t.risk_lkr)}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-border/30 pt-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total risk</span>
              <span className="font-medium num text-red-400">
                {fmtLkr(preview.total_risk_lkr)} ({preview.total_risk_pct.toFixed(2)}%)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Budget remaining after</span>
              <span className="font-medium num text-emerald-400">
                {fmtLkr(preview.budget_remaining_after_lkr)}
              </span>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={onCancel}
              className="flex-1 rounded-md border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={!preview.valid || executing}
              className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {executing ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Executing...</>
              ) : (
                'Execute on Demo'
              )}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type FilterType = 'ALL' | 'SHARIAH' | 'BUY' | 'STRONG';
type SortType = 'STRENGTH' | 'RISK_REWARD' | 'PRICE';

export default function OpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<TradeOpportunity[]>([]);
  const [riskSummary, setRiskSummary] = useState<RiskSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [sort, setSort] = useState<SortType>('STRENGTH');
  const [preview, setPreview] = useState<SelectionPreview | null>(null);
  const [executing, setExecuting] = useState(false);
  const [executeResult, setExecuteResult] = useState<{ executed: string[]; failed: string[] } | null>(null);

  const fetchData = async () => {
    try {
      const [oppRes, riskRes] = await Promise.allSettled([
        opportunitiesApi.getOpportunities(),
        opportunitiesApi.getRiskSummary(),
      ]);
      if (oppRes.status === 'fulfilled') setOpportunities(oppRes.value.data);
      else setError('Failed to load opportunities');
      if (riskRes.status === 'fulfilled') setRiskSummary(riskRes.value.data);
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = useMemo(() => {
    let list = [...opportunities];
    if (filter === 'SHARIAH') list = list.filter((o) => o.shariah_status === 'COMPLIANT');
    if (filter === 'BUY') list = list.filter((o) => o.technical_signal === 'BUY');
    if (filter === 'STRONG') list = list.filter((o) => o.strength.label === 'STRONG' || o.strength.label === 'VERY_STRONG');

    if (sort === 'RISK_REWARD') {
      list = [...list].sort((a, b) => b.composite_score - a.composite_score);
    } else if (sort === 'PRICE') {
      list = [...list].sort((a, b) => a.current_price - b.current_price);
    }
    // Default: already sorted by strength from backend

    return list;
  }, [opportunities, filter, sort]);

  const selectedOpps = opportunities.filter((o) => selected.has(o.symbol));
  const totalSelectedRisk = selectedOpps.reduce((s, o) => s + o.risk_per_trade_lkr, 0);
  const budgetPct = riskSummary ? (totalSelectedRisk / riskSummary.remaining_lkr) * riskSummary.daily_budget_pct : 0;
  const exceedsBudget = riskSummary ? totalSelectedRisk > riskSummary.remaining_lkr : false;

  const toggleSelect = (symbol: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  };

  const handleReview = async () => {
    if (selected.size === 0) return;
    try {
      const res = await opportunitiesApi.selectTrades(Array.from(selected));
      setPreview(res.data);
    } catch {
      setError('Failed to preview selection');
    }
  };

  const handleExecute = async () => {
    if (!preview) return;
    setExecuting(true);
    try {
      const res = await opportunitiesApi.executeTrades(Array.from(selected));
      setExecuteResult(res.data);
      setPreview(null);
      setSelected(new Set());
      // Refresh data
      await fetchData();
    } catch {
      setError('Execution failed');
    } finally {
      setExecuting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Trade Opportunities
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {format(new Date(), 'EEEE, MMMM d, yyyy')} — Ranked by strength score
          </p>
        </div>
        <button
          onClick={fetchData}
          className="text-xs text-muted-foreground hover:text-foreground border rounded-md px-2.5 py-1 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Risk budget bar */}
      {riskSummary && <RiskBudgetBar summary={riskSummary} />}

      {/* Execute result banner */}
      {executeResult && (
        <div className={`rounded-md p-3 text-sm flex items-center gap-2 ${
          executeResult.failed.length === 0
            ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
            : 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-400'
        }`}>
          <TrendingUp className="h-4 w-4 flex-shrink-0" />
          Executed: {executeResult.executed.join(', ')}{executeResult.failed.length > 0 && ` | Failed: ${executeResult.failed.join(', ')}`}
          <button onClick={() => setExecuteResult(null)} className="ml-auto">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-md bg-red-500/10 border border-red-500/30 text-red-400 p-3 text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Filters + Sort */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        {(['ALL', 'SHARIAH', 'BUY', 'STRONG'] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              filter === f
                ? 'bg-primary/10 text-primary'
                : 'border text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
          >
            {f === 'SHARIAH' ? 'Shariah Only' : f === 'BUY' ? 'BUY Only' : f === 'STRONG' ? 'Strong+' : f}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Sort:</span>
          {(['STRENGTH', 'RISK_REWARD', 'PRICE'] as SortType[]).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`rounded-md px-2 py-1 text-xs transition-colors ${
                sort === s ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {s === 'RISK_REWARD' ? 'Score' : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* No data */}
      {filtered.length === 0 && !loading && (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">No opportunities found</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              {opportunities.length === 0
                ? 'Run stock scoring and technical analysis first, or check back after market open.'
                : 'Try changing the filter.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Opportunity cards */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((opp) => (
          <OpportunityCard
            key={opp.symbol}
            opp={opp}
            selected={selected.has(opp.symbol)}
            onToggle={() => toggleSelect(opp.symbol)}
          />
        ))}
      </div>

      {/* Sticky bottom bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur px-4 py-3">
          <div className="container max-w-[1400px] mx-auto flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium">
                {selected.size} trade{selected.size !== 1 ? 's' : ''} selected
              </span>
              <span className="text-sm text-muted-foreground ml-2 num">
                Risk: {fmtLkr(totalSelectedRisk)}
                {riskSummary && (
                  <span className={exceedsBudget ? ' text-red-400' : ' text-muted-foreground'}>
                    {' '}({budgetPct.toFixed(1)}% of {riskSummary.daily_budget_pct}% budget)
                  </span>
                )}
              </span>
              {exceedsBudget && (
                <span className="ml-2 text-xs text-red-400 font-medium">
                  <AlertTriangle className="h-3 w-3 inline mr-0.5" />
                  Exceeds daily risk limit!
                </span>
              )}
            </div>
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs text-muted-foreground hover:text-foreground border rounded-md px-2.5 py-1.5 transition-colors"
            >
              Clear
            </button>
            <button
              onClick={handleReview}
              className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Review & Execute
            </button>
          </div>
        </div>
      )}

      {/* Bottom padding to avoid content hidden behind sticky bar */}
      {selected.size > 0 && <div className="h-16" />}

      {/* Confirmation modal */}
      {preview && (
        <ConfirmationModal
          preview={preview}
          onConfirm={handleExecute}
          onCancel={() => setPreview(null)}
          executing={executing}
        />
      )}
    </div>
  );
}
