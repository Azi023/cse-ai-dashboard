'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { aiApi, strategyEngineApi, type TradingSignal, type AiStatus, type StrategyEngineStatus, type StrategyEngineSignal } from '@/lib/api';
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
  Shield,
  Filter,
  Loader2,
  Clock,
  Activity,
  Zap,
  Bot,
} from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { useDisplayMode } from '@/contexts/display-mode-context';
import { getSimpleLabel } from '@/lib/simple-mode-constants';
import { safeNum } from '@/lib/format';

const regimeColors: Record<string, string> = {
  TRENDING_UP: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  TRENDING_DOWN: 'bg-red-500/10 text-red-400 border-red-500/20',
  RANGING: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  HIGH_VOLATILITY: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  RECOVERY: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  CRISIS: 'bg-red-900/20 text-red-300 border-red-700/30',
};

const directionConfig = {
  BUY: { icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'Buy Signal' },
  HOLD: { icon: Minus, color: 'text-yellow-500', bg: 'bg-yellow-500/10', label: 'Hold' },
  SELL: { icon: TrendingDown, color: 'text-red-500', bg: 'bg-red-500/10', label: 'Sell Signal' },
};

const confidenceColor = {
  HIGH: 'bg-emerald-600/20 text-emerald-500 border-emerald-600/30',
  MEDIUM: 'bg-yellow-600/20 text-yellow-500 border-yellow-600/30',
  LOW: 'bg-muted text-muted-foreground border-muted-foreground/30',
};

export default function SignalsPage() {
  const { isSimple } = useDisplayMode();
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [engineStatus, setEngineStatus] = useState<StrategyEngineStatus | null>(null);
  const [engineSignals, setEngineSignals] = useState<StrategyEngineSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dirFilter, setDirFilter] = useState<'ALL' | 'BUY' | 'HOLD' | 'SELL'>('ALL');
  const [confFilter, setConfFilter] = useState<'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');
  const [shariahOnly, setShariahOnly] = useState(true);
  const [strategyOnly, setStrategyOnly] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [signalsRes, statusRes, engineStatusRes, engineSignalsRes] =
          await Promise.allSettled([
            aiApi.getSignals(),
            aiApi.getStatus(),
            strategyEngineApi.getStatus(),
            strategyEngineApi.getSignals(),
          ]);
        if (signalsRes.status === 'fulfilled') setSignals(signalsRes.value.data);
        else setError('Failed to load signals');
        if (statusRes.status === 'fulfilled') setAiStatus(statusRes.value.data);
        if (engineStatusRes.status === 'fulfilled')
          setEngineStatus(engineStatusRes.value.data.data);
        if (engineSignalsRes.status === 'fulfilled')
          setEngineSignals(engineSignalsRes.value.data.data);
        setLastUpdated(new Date());
      } catch {
        setError('Failed to load signals');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Map: symbol → strategy signals (for badge display)
  const strategySignalsBySymbol = useMemo(() => {
    const map = new Map<string, StrategyEngineSignal[]>();
    for (const sig of engineSignals) {
      if (!map.has(sig.symbol)) map.set(sig.symbol, []);
      map.get(sig.symbol)!.push(sig);
    }
    return map;
  }, [engineSignals]);

  const filtered = useMemo(() => {
    return signals.filter((s) => {
      if (dirFilter !== 'ALL' && s.direction !== dirFilter) return false;
      if (confFilter !== 'ALL' && s.confidence !== confFilter) return false;
      if (shariahOnly && s.shariahStatus !== 'compliant') return false;
      if (strategyOnly && !strategySignalsBySymbol.has(s.symbol)) return false;
      return true;
    });
  }, [signals, dirFilter, confFilter, shariahOnly, strategyOnly, strategySignalsBySymbol]);

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
            {lastUpdated && (
              <span className="text-[11px] text-muted-foreground/50 ml-2">
                · Fetched {lastUpdated.toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} SLT
              </span>
            )}
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

      {/* Strategy Engine Regime Bar */}
      {engineStatus?.regime && (
        <div className={`flex items-center justify-between rounded-lg border px-4 py-3 ${regimeColors[engineStatus.regime] ?? 'bg-muted text-muted-foreground border-muted'}`}>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <span className="text-sm font-medium">
              Market Regime: <span className="font-semibold">{engineStatus.regime.replace(/_/g, ' ')}</span>
            </span>
            {engineStatus.regimeConfidence && (
              <span className="text-xs opacity-70">({engineStatus.regimeConfidence}% confidence)</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {engineStatus.activeStrategies.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Zap className="h-3 w-3 opacity-70" />
                <span className="text-xs opacity-80">
                  {engineStatus.activeStrategies.map((s) => s.name).join(' · ')}
                </span>
              </div>
            )}
            {engineStatus.todaySignalCount > 0 && (
              <Badge variant="outline" className="text-xs border-current/30">
                {engineStatus.todaySignalCount} strategy signal{engineStatus.todaySignalCount !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>
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
              ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30'
              : 'text-muted-foreground hover:bg-muted/50'
          }`}
        >
          <Shield className="h-3 w-3" />
          Shariah Only
        </button>
        <span className="text-muted-foreground text-xs">|</span>
        <button
          onClick={() => setStrategyOnly(!strategyOnly)}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            strategyOnly
              ? 'bg-blue-500/10 text-blue-500 border border-blue-500/30'
              : 'text-muted-foreground hover:bg-muted/50'
          }`}
        >
          <Bot className="h-3 w-3" />
          Strategy Only
          {strategyOnly && engineSignals.length > 0 && (
            <span className="ml-1 text-[10px] opacity-70">({strategySignalsBySymbol.size})</span>
          )}
        </button>
      </div>

      {/* Signal Cards */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <Clock className="h-8 w-8 text-muted-foreground/40 mx-auto" />
            <p className="text-sm font-medium text-muted-foreground">
              {signals.length === 0
                ? 'Signals generate daily at market close (2:45 PM)'
                : 'No signals match the current filters'}
            </p>
            {signals.length === 0 && (
              <p className="text-xs text-muted-foreground">
                The AI analyses all Shariah-compliant stocks after each trading session.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((signal, i) => {
            const cfg = directionConfig[signal.direction];
            const Icon = cfg.icon;

            return (
              <Card key={`${signal.symbol}-${i}`} hover>
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
                      <div className="font-semibold num">
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

                  {/* Confidence bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>Confidence</span>
                      <span className={confidenceColor[signal.confidence].split(' ')[1]}>{signal.confidence}</span>
                    </div>
                    <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          signal.confidence === 'HIGH'
                            ? 'w-full bg-emerald-500'
                            : signal.confidence === 'MEDIUM'
                            ? 'w-2/3 bg-yellow-500'
                            : 'w-1/3 bg-gray-500'
                        }`}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={confidenceColor[signal.confidence]}>
                        {isSimple ? getSimpleLabel(signal.confidence) : signal.confidence}
                      </Badge>
                      {signal.shariahStatus === 'compliant' ? (
                        <Badge
                          variant="outline"
                          className="border-emerald-600/30 text-emerald-500"
                        >
                          <Shield className="h-3 w-3 mr-1" />
                          Halal
                        </Badge>
                      ) : signal.shariahStatus === 'non_compliant' ? (
                        <Badge
                          variant="outline"
                          className="border-red-600/30 text-red-500"
                        >
                          <Shield className="h-3 w-3 mr-1" />
                          Non-Compliant
                        </Badge>
                      ) : null}
                      {strategySignalsBySymbol.get(signal.symbol)?.map((ss) => (
                        <Badge
                          key={ss.strategy_id}
                          variant="outline"
                          className="border-primary/30 text-primary/80 text-[10px]"
                          title={ss.reasoning?.join('\n')}
                        >
                          <Zap className="h-2.5 w-2.5 mr-1" />
                          {ss.strategy_name}
                        </Badge>
                      ))}
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
