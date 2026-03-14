'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { aiApi, type TradingSignal, type AiStatus } from '@/lib/api';
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
  Shield,
  Filter,
  Loader2,
  Clock,
} from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { useDisplayMode } from '@/contexts/display-mode-context';
import { getSimpleLabel } from '@/lib/simple-mode-constants';
import { safeNum } from '@/lib/format';

const directionConfig = {
  BUY: { icon: TrendingUp, color: 'text-green-500', bg: 'bg-green-500/10', label: 'Buy Signal' },
  HOLD: { icon: Minus, color: 'text-yellow-500', bg: 'bg-yellow-500/10', label: 'Hold' },
  SELL: { icon: TrendingDown, color: 'text-red-500', bg: 'bg-red-500/10', label: 'Sell Signal' },
};

const confidenceColor = {
  HIGH: 'bg-green-600/20 text-green-500 border-green-600/30',
  MEDIUM: 'bg-yellow-600/20 text-yellow-500 border-yellow-600/30',
  LOW: 'bg-gray-600/20 text-gray-400 border-gray-600/30',
};

export default function SignalsPage() {
  const { isSimple } = useDisplayMode();
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dirFilter, setDirFilter] = useState<'ALL' | 'BUY' | 'HOLD' | 'SELL'>('ALL');
  const [confFilter, setConfFilter] = useState<'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');
  const [shariahOnly, setShariahOnly] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [signalsRes, statusRes] = await Promise.allSettled([
          aiApi.getSignals(),
          aiApi.getStatus(),
        ]);
        if (signalsRes.status === 'fulfilled') setSignals(signalsRes.value.data);
        else setError('Failed to load signals');
        if (statusRes.status === 'fulfilled') setAiStatus(statusRes.value.data);
      } catch {
        setError('Failed to load signals');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const filtered = useMemo(() => {
    return signals.filter((s) => {
      if (dirFilter !== 'ALL' && s.direction !== dirFilter) return false;
      if (confFilter !== 'ALL' && s.confidence !== confFilter) return false;
      if (shariahOnly && s.shariahStatus !== 'compliant') return false;
      return true;
    });
  }, [signals, dirFilter, confFilter, shariahOnly]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {isSimple ? 'Stock Suggestions' : 'Trading Signals'}
          </h2>
          <p className="text-muted-foreground text-sm">
            {isSimple
              ? `${filtered.length} suggestion${filtered.length !== 1 ? 's' : ''} based on market data`
              : `${filtered.length} active signal${filtered.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        {aiStatus && (
          <Badge
            variant="secondary"
            className={
              aiStatus.mode === 'live'
                ? 'bg-green-600/20 text-green-500 border-green-600/30'
                : 'bg-yellow-600/20 text-yellow-500 border-yellow-600/30'
            }
          >
            {aiStatus.mode === 'live' ? 'Live AI' : 'Mock Mode'}
          </Badge>
        )}
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <div className="flex gap-1">
          {(['ALL', 'BUY', 'HOLD', 'SELL'] as const).map((dir) => (
            <button
              key={dir}
              onClick={() => setDirFilter(dir)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                dirFilter === dir
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted/50'
              }`}
            >
              {dir === 'ALL' ? 'All' : dir}
            </button>
          ))}
        </div>
        {!isSimple && (
          <>
            <span className="text-muted-foreground text-xs">|</span>
            <div className="flex gap-1">
              {(['ALL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((conf) => (
                <button
                  key={conf}
                  onClick={() => setConfFilter(conf)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    confFilter === conf
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  {conf === 'ALL' ? 'All Confidence' : conf}
                </button>
              ))}
            </div>
          </>
        )}
        <span className="text-muted-foreground text-xs">|</span>
        <button
          onClick={() => setShariahOnly(!shariahOnly)}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            shariahOnly
              ? 'bg-green-500/10 text-green-500 border border-green-500/30'
              : 'text-muted-foreground hover:bg-muted/50'
          }`}
        >
          <Shield className="h-3 w-3" />
          Shariah Only
        </button>
      </div>

      {/* Signal Cards */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No signals match the current filters.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((signal, i) => {
            const cfg = directionConfig[signal.direction];
            const Icon = cfg.icon;

            return (
              <Card key={`${signal.symbol}-${i}`}>
                <CardContent className="pt-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`rounded-lg p-2 ${cfg.bg}`}>
                        <Icon className={`h-5 w-5 ${cfg.color}`} />
                      </div>
                      <div>
                        <Link
                          href={`/stocks/${signal.symbol}`}
                          className="font-semibold hover:underline"
                        >
                          {signal.symbol}
                        </Link>
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {signal.name}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">
                        LKR {safeNum(signal.currentPrice).toFixed(2)}
                      </div>
                      <Badge variant="outline" className={cfg.color}>
                        {cfg.label}
                      </Badge>
                    </div>
                  </div>

                  {isSimple && signal.rationale_simple ? (
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {signal.rationale_simple}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {signal.reasoning}
                    </p>
                  )}

                  {signal.suggested_holding_period && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
                      <Clock className="h-3 w-3" />
                      <span>{signal.suggested_holding_period}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={confidenceColor[signal.confidence]}>
                        {isSimple ? getSimpleLabel(signal.confidence) : signal.confidence}
                      </Badge>
                      {signal.shariahStatus === 'compliant' && (
                        <Badge
                          variant="outline"
                          className="border-green-600/30 text-green-500"
                        >
                          <Shield className="h-3 w-3 mr-1" />
                          Shariah
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(signal.generatedAt), 'HH:mm')}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Signals are generated for educational purposes only and do not constitute investment
        advice. Always conduct your own research.
      </p>
    </div>
  );
}
