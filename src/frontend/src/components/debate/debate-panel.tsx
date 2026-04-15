'use client';

import { useCallback, useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Scale, RefreshCw, Loader2, AlertTriangle, Sparkles } from 'lucide-react';
import { debateApi, type DebateResult } from '@/lib/api';

interface DebatePanelProps {
  symbol: string;
  /**
   * If true, render in compact mode for the dashboard widget. Default false
   * for the full stock-detail view.
   */
  compact?: boolean;
}

function formatLkr(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `LKR ${n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function daysAgo(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const diff = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diff <= 0) return 'today';
  if (diff === 1) return 'yesterday';
  return `${diff} days ago`;
}

export function DebatePanel({ symbol, compact = false }: DebatePanelProps) {
  const [debate, setDebate] = useState<DebateResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLatest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await debateApi.getForSymbol(symbol);
      setDebate('bull_thesis' in res.data ? (res.data as DebateResult) : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load debate');
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    void fetchLatest();
  }, [fetchLatest]);

  if (loading && !debate) {
    return (
      <div className="rounded-xl border bg-card p-6">
        <div className="h-24 rounded-md bg-muted/20 animate-pulse" />
      </div>
    );
  }

  if (!debate) {
    return (
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4" aria-hidden />
          No debate run yet for {symbol}. Runs weekly on signal-triggered
          stocks.
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <article
        aria-label={`Debate for ${debate.symbol}`}
        className="rounded-xl border bg-card p-4 space-y-2"
      >
        <header className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{debate.symbol}</span>
            {debate.confidence_score != null && (
              <span className="rounded-full border bg-muted/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                {debate.confidence_score}% confidence
              </span>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground">
            {daysAgo(debate.debate_date)}
          </span>
        </header>
        <p className="text-xs text-muted-foreground line-clamp-3">
          {debate.synthesis}
        </p>
        {debate.price_target_p50 != null && (
          <div className="flex items-center gap-3 text-[11px] num">
            <span className="text-red-400">
              p10 {formatLkr(debate.price_target_p10)}
            </span>
            <span className="text-foreground">
              p50 {formatLkr(debate.price_target_p50)}
            </span>
            <span className="text-emerald-400">
              p90 {formatLkr(debate.price_target_p90)}
            </span>
          </div>
        )}
      </article>
    );
  }

  return (
    <section className="rounded-xl border bg-card p-6 space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" aria-hidden />
            Bull vs Bear — {debate.symbol}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            3-agent debate · generated {daysAgo(debate.debate_date)} · priced at{' '}
            {formatLkr(debate.price_at_debate)} · {debate.tokens_used} tokens ({debate.provider})
          </p>
        </div>
        <button
          type="button"
          onClick={fetchLatest}
          disabled={loading}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50"
          aria-label="Refresh debate"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden />
          )}
        </button>
      </header>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <AlertTriangle className="h-4 w-4" aria-hidden />
          {error}
        </div>
      )}

      {/* Synthesis + targets */}
      <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Synthesis
        </h3>
        <p className="text-sm leading-relaxed">{debate.synthesis}</p>
        {debate.price_target_p50 != null && (
          <div className="grid grid-cols-3 gap-3 pt-2">
            <TargetTile
              label="Pessimistic"
              value={formatLkr(debate.price_target_p10)}
              tone="down"
              sub="p10"
            />
            <TargetTile
              label="Base case"
              value={formatLkr(debate.price_target_p50)}
              tone="neutral"
              sub="p50"
            />
            <TargetTile
              label="Optimistic"
              value={formatLkr(debate.price_target_p90)}
              tone="up"
              sub="p90"
            />
          </div>
        )}
        {debate.confidence_score != null && (
          <div className="text-[11px] text-muted-foreground">
            Confidence: {debate.confidence_score}/100
          </div>
        )}
      </div>

      {/* Bull + Bear theses side-by-side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ThesisCard
          title="Bull thesis"
          icon={<TrendingUp className="h-4 w-4 text-emerald-400" aria-hidden />}
          body={debate.bull_thesis}
          tone="up"
        />
        <ThesisCard
          title="Bear thesis"
          icon={<TrendingDown className="h-4 w-4 text-red-400" aria-hidden />}
          body={debate.bear_thesis}
          tone="down"
        />
      </div>

      {/* Risks + catalysts */}
      {((debate.key_risks?.length ?? 0) > 0 ||
        (debate.catalysts?.length ?? 0) > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {(debate.key_risks?.length ?? 0) > 0 && (
            <div className="rounded-md border bg-red-500/5 p-3">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-red-400 mb-1.5">
                Key risks
              </h4>
              <ul className="space-y-1 text-muted-foreground">
                {debate.key_risks!.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-red-400">·</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(debate.catalysts?.length ?? 0) > 0 && (
            <div className="rounded-md border bg-emerald-500/5 p-3">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-emerald-400 mb-1.5">
                Catalysts
              </h4>
              <ul className="space-y-1 text-muted-foreground">
                {debate.catalysts!.map((c, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-emerald-400">·</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        This is analysis, not advice. Debate runs weekly on signal-triggered
        stocks and caches for 7 days.
      </p>
    </section>
  );
}

function TargetTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: 'up' | 'down' | 'neutral';
}) {
  const color =
    tone === 'up'
      ? 'text-emerald-400'
      : tone === 'down'
        ? 'text-red-400'
        : 'text-foreground';
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="text-[10px] text-muted-foreground">{sub}</span>
      </div>
      <div className={`mt-0.5 text-sm font-semibold num ${color}`}>{value}</div>
    </div>
  );
}

function ThesisCard({
  title,
  icon,
  body,
  tone,
}: {
  title: string;
  icon: React.ReactNode;
  body: string;
  tone: 'up' | 'down';
}) {
  const border =
    tone === 'up' ? 'border-emerald-500/30' : 'border-red-500/30';
  return (
    <article className={`rounded-md border ${border} bg-card p-4`}>
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
        {icon}
        {title}
      </h3>
      <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
        {body}
      </p>
    </article>
  );
}
