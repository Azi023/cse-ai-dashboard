'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Star,
  CalendarDays,
  TrendingUp,
  TrendingDown,
  Target,
  ShieldCheck,
  Heart,
  Lightbulb,
  Plus,
  RefreshCw,
  ChevronRight,
  Info,
  Trophy,
  Loader2,
  AlertCircle,
  X,
} from 'lucide-react';
import {
  journeyApi,
  insightsApi,
  atradApi,
  analysisApi,
  type InvestmentKPIs,
  type PortfolioHealthScore,
  type InvestmentGoalData,
  type MonthlyDepositRecord,
  type DynamicInsight,
  type MarketExplainer,
  type ATradSyncStatus,
  type AiRecommendationData,
  type StockScoreData,
  type DataStatusData,
} from '@/lib/api';
import { formatLKR, formatPct, getGradeColor, TOOLTIPS } from '@/lib/simple-mode-constants';

function Tooltip({ tipKey }: { tipKey: string }) {
  const tip = TOOLTIPS[tipKey];
  if (!tip) return null;
  return (
    <span className="relative group inline-flex ml-1 cursor-help">
      <Info className="h-3.5 w-3.5 text-muted-foreground/60" />
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-lg border bg-popover p-3 text-xs text-popover-foreground shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
        {tip}
      </span>
    </span>
  );
}

function HealthBar({ score, label }: { score: number; label: string }) {
  const width = Math.max(0, Math.min(100, score));
  const color =
    score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-blue-500' : score >= 40 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label.split(' — ')[0]}</span>
        <span className="text-foreground">{score}/100</span>
      </div>
      <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${width}%` }} />
      </div>
      {label.includes(' — ') && (
        <p className="text-[11px] text-muted-foreground">{label.split(' — ')[1]}</p>
      )}
    </div>
  );
}

export default function JourneyPage() {
  const [kpis, setKpis] = useState<InvestmentKPIs | null>(null);
  const [health, setHealth] = useState<PortfolioHealthScore | null>(null);
  const [goals, setGoals] = useState<InvestmentGoalData[]>([]);
  const [deposits, setDeposits] = useState<MonthlyDepositRecord[]>([]);
  const [insights, setInsights] = useState<DynamicInsight[]>([]);
  const [explainer, setExplainer] = useState<MarketExplainer | null>(null);
  const [atradStatus, setAtradStatus] = useState<ATradSyncStatus | null>(null);
  const [aiRec, setAiRec] = useState<AiRecommendationData | null>(null);
  const [scores, setScores] = useState<StockScoreData[]>([]);
  const [dataStatus, setDataStatus] = useState<DataStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Deposit form state
  const [showDepositForm, setShowDepositForm] = useState(false);
  const [depositMonth, setDepositMonth] = useState(new Date().toISOString().slice(0, 7));
  const [depositAmount, setDepositAmount] = useState('10000');
  const [depositDate, setDepositDate] = useState(new Date().toISOString().slice(0, 10));
  const [depositNotes, setDepositNotes] = useState('');
  const [depositSubmitting, setDepositSubmitting] = useState(false);

  // Goal form state
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalAmount, setGoalAmount] = useState('100000');
  const [goalLabel, setGoalLabel] = useState('');
  const [goalSubmitting, setGoalSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [kpiRes, healthRes, goalsRes, depositsRes, insightsRes, explainerRes, atradRes, recRes, scoresRes, statusRes] =
        await Promise.allSettled([
          journeyApi.getKPIs(),
          journeyApi.getHealth(),
          journeyApi.getGoals(),
          journeyApi.getJourney(),
          insightsApi.getCurrent(),
          insightsApi.getExplainer(),
          atradApi.getStatus(),
          analysisApi.getRecommendation(),
          analysisApi.getScores(5),
          analysisApi.getDataStatus(),
        ]);

      if (kpiRes.status === 'fulfilled') setKpis(kpiRes.value.data);
      if (healthRes.status === 'fulfilled') setHealth(healthRes.value.data);
      if (goalsRes.status === 'fulfilled') setGoals(goalsRes.value.data);
      if (depositsRes.status === 'fulfilled') setDeposits(depositsRes.value.data);
      if (insightsRes.status === 'fulfilled') setInsights(insightsRes.value.data);
      if (explainerRes.status === 'fulfilled') setExplainer(explainerRes.value.data);
      if (atradRes.status === 'fulfilled') setAtradStatus(atradRes.value.data);
      if (recRes.status === 'fulfilled') setAiRec(recRes.value.data);
      if (scoresRes.status === 'fulfilled') setScores(scoresRes.value.data);
      if (statusRes.status === 'fulfilled') setDataStatus(statusRes.value.data);
    } catch {
      setError('Unable to load journey data. Make sure the backend is running.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDeposit = async () => {
    setDepositSubmitting(true);
    try {
      await journeyApi.recordDeposit({
        month: depositMonth,
        depositAmount: parseFloat(depositAmount),
        depositDate,
        notes: depositNotes || undefined,
      });
      setShowDepositForm(false);
      setDepositNotes('');
      fetchData();
    } catch {
      alert('Failed to record deposit. Please try again.');
    } finally {
      setDepositSubmitting(false);
    }
  };

  const handleCreateGoal = async () => {
    setGoalSubmitting(true);
    try {
      await journeyApi.createGoal({
        targetAmount: parseFloat(goalAmount),
        label: goalLabel || undefined,
      });
      setShowGoalForm(false);
      setGoalLabel('');
      fetchData();
    } catch {
      alert('Failed to create goal. Please try again.');
    } finally {
      setGoalSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Loading your investment journey...</p>
        </div>
      </div>
    );
  }

  const hasDeposits = deposits.length > 0;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* ATrad Sync Banner */}
      {atradStatus?.configured && atradStatus.syncSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/5 px-4 py-2 text-sm">
          <RefreshCw className="h-3.5 w-3.5 text-green-500" />
          <span className="text-green-400">
            Synced with ATrad
            {atradStatus.lastSynced && (
              <> &middot; {new Date(atradStatus.lastSynced).toLocaleTimeString()}</>
            )}
          </span>
          <span className="text-muted-foreground ml-auto">
            {atradStatus.holdingsCount} stocks &middot; Buying Power: {formatLKR(atradStatus.buyingPower)}
          </span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Star className="h-6 w-6 text-yellow-500" />
            Your Investment Journey
          </h1>
          <p className="text-muted-foreground mt-1">
            Track your progress, stay motivated, keep growing
          </p>
        </div>
        <Link
          href="/settings"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Settings
        </Link>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Welcome State (no deposits yet) */}
      {!hasDeposits && !kpis && (
        <div className="rounded-xl border bg-card p-8 text-center space-y-4">
          <Star className="h-12 w-12 text-yellow-500 mx-auto" />
          <h2 className="text-xl font-semibold">Welcome to Your Investment Journey!</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Start tracking your monthly investments. Record your first deposit below
            and watch your wealth grow over time.
          </p>
          <button
            onClick={() => setShowDepositForm(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Record Your First Deposit
          </button>
        </div>
      )}

      {/* KPI Hero Card */}
      {kpis && (
        <div className="rounded-xl border bg-gradient-to-br from-card to-card/80 p-6 space-y-5">
          <div className="text-center">
            <p className="text-muted-foreground text-sm">
              You&apos;ve been investing for{' '}
              <span className="text-foreground font-semibold">{kpis.monthsInvested} month{kpis.monthsInvested !== 1 ? 's' : ''}</span>
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Total Deposited */}
            <div className="rounded-lg bg-muted/30 p-4 text-center">
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                Total Deposited <Tooltip tipKey="totalDeposited" />
              </p>
              <p className="text-xl font-bold mt-1">{formatLKR(kpis.totalDeposited)}</p>
            </div>

            {/* Portfolio Value */}
            <div className="rounded-lg bg-muted/30 p-4 text-center">
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                Portfolio Value <Tooltip tipKey="portfolioValue" />
              </p>
              <p className="text-xl font-bold mt-1">
                {kpis.currentPortfolioValue > 0 ? (
                  <>
                    {formatLKR(kpis.currentPortfolioValue)}
                    {kpis.totalProfitLoss > 0 && <span className="ml-1 text-yellow-400">✨</span>}
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">Add holdings to track</span>
                )}
              </p>
            </div>

            {/* Profit/Loss */}
            <div className="rounded-lg bg-muted/30 p-4 text-center">
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                Your Profit <Tooltip tipKey="profitLoss" />
              </p>
              {kpis.currentPortfolioValue > 0 ? (
                <p
                  className={`text-xl font-bold mt-1 ${
                    kpis.totalProfitLoss >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {kpis.totalProfitLoss >= 0 ? '+' : ''}
                  {formatLKR(kpis.totalProfitLoss)} ({formatPct(kpis.totalProfitLossPct)})
                </p>
              ) : (
                <p className="text-sm text-muted-foreground mt-2">
                  Go to Portfolio → Add Holding
                </p>
              )}
            </div>
          </div>

          {/* Goal Progress */}
          {goals.length > 0 && (
            <div className="space-y-2">
              {goals.map((goal) => (
                <div key={goal.id} className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{goal.label || 'Investment Goal'}</span>
                    <span className="text-foreground">
                      {Math.round(goal.progressPercent)}% of {formatLKR(goal.target_amount)}
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-muted/50 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-green-500 transition-all duration-700"
                      style={{ width: `${Math.min(100, goal.progressPercent)}%` }}
                    />
                  </div>
                  {goal.estimatedCompletionDate && goal.progressPercent < 100 && (
                    <p className="text-xs text-muted-foreground">
                      At this rate: ~{Math.ceil(goal.monthlyDepositNeeded > 0 ? (goal.target_amount - goal.currentProgress) / goal.monthlyDepositNeeded : 0)} more months
                    </p>
                  )}
                  {goal.progressPercent >= 100 && (
                    <p className="text-xs text-green-400 flex items-center gap-1">
                      <Trophy className="h-3 w-3" /> Goal reached! 🎉
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Streak + Month Return */}
          <div className="flex flex-wrap gap-3 text-xs">
            {kpis.consecutiveDeposits > 0 && (
              <span className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-3 py-1 text-yellow-400">
                🔥 {kpis.consecutiveDeposits}-month deposit streak
              </span>
            )}
            {kpis.thisMonthReturn !== 0 && kpis.currentPortfolioValue > 0 && (
              <span
                className={`rounded-full border px-3 py-1 ${
                  kpis.thisMonthReturn >= 0
                    ? 'border-green-500/30 bg-green-500/10 text-green-400'
                    : 'border-red-500/30 bg-red-500/10 text-red-400'
                }`}
              >
                This month: {formatPct(kpis.thisMonthReturnPct)}
              </span>
            )}
            {kpis.currentPortfolioValue === 0 && kpis.totalDeposited > 0 && (
              <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-blue-400">
                First trade pending settlement (T+2)
              </span>
            )}
            {kpis.positiveMonths > 0 && kpis.monthsInvested > 0 && (
              <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-blue-400">
                {kpis.positiveMonths}/{kpis.monthsInvested} profitable months
              </span>
            )}
          </div>
        </div>
      )}

      {/* Market Explainer (if significant move) */}
      {explainer && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 space-y-3">
          <h3 className="font-semibold flex items-center gap-2">
            📢 {explainer.headline}
          </h3>
          <p className="text-sm text-muted-foreground">{explainer.explanation}</p>
          <div className="rounded-lg bg-muted/30 p-3">
            <p className="text-sm font-medium">What this means for you:</p>
            <p className="text-sm text-muted-foreground mt-1">{explainer.whatItMeans}</p>
          </div>
          <p className="text-sm text-primary">{explainer.actionSuggestion}</p>
        </div>
      )}

      {/* AI Advisor Card */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          AI Advisor
        </h2>

        {/* Data accumulation status */}
        {dataStatus && (
          <div className={`rounded-lg px-3 py-2 text-xs flex items-center gap-2 ${
            dataStatus.scoring_ready
              ? 'bg-green-500/10 text-green-400 border border-green-500/20'
              : 'bg-muted/50 text-muted-foreground'
          }`}>
            {dataStatus.scoring_ready ? (
              <><span className="text-green-400">✓</span> Scoring active — {dataStatus.market_snapshot_days} trading days accumulated</>
            ) : (
              <><Loader2 className="h-3 w-3 animate-spin" /> Accumulating data: {dataStatus.market_snapshot_days}/20 trading days ({dataStatus.days_until_scoring_ready} more needed for full scoring)</>
            )}
          </div>
        )}

        {/* Latest AI Recommendation */}
        {aiRec ? (
          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                Weekly Pick: <span className="text-primary">{aiRec.recommended_stock}</span>
              </span>
              <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${
                aiRec.confidence === 'HIGH'
                  ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                  : aiRec.confidence === 'LOW'
                    ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                    : 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30'
              }`}>
                {aiRec.confidence} confidence
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{aiRec.reasoning}</p>
            {aiRec.price_outlook_3m && (
              <p className="text-xs text-muted-foreground border-t border-border/50 pt-2">
                <span className="text-foreground font-medium">3m outlook:</span> {aiRec.price_outlook_3m}
              </p>
            )}
            {aiRec.risk_flags && Array.isArray(aiRec.risk_flags) && aiRec.risk_flags.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {aiRec.risk_flags.map((flag, i) => (
                  <span key={i} className="text-xs rounded-full bg-red-500/10 text-red-400 px-2 py-0.5">
                    ⚠ {flag}
                  </span>
                ))}
              </div>
            )}
            {aiRec.alternative && (
              <p className="text-xs text-muted-foreground">
                Alternative: <span className="text-foreground">{aiRec.alternative}</span>
              </p>
            )}
            <p className="text-xs text-muted-foreground/50">
              Week of {aiRec.week_start} · {aiRec.model_used.includes('sonnet') ? 'Claude Sonnet' : 'Claude Haiku'}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No recommendation yet — generated every Friday at 2:55 PM SLT after market close.
          </p>
        )}

        {/* Top 5 Stock Scores */}
        {scores.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Top Shariah Stocks by Score
            </p>
            <div className="space-y-1.5">
              {scores.map((s, i) => (
                <div key={s.symbol} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-4 text-right">{i + 1}.</span>
                  <span className="text-sm font-medium flex-1">{s.symbol}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          Number(s.composite_score) >= 60 ? 'bg-green-500' :
                          Number(s.composite_score) >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(100, Number(s.composite_score))}%` }}
                      />
                    </div>
                    <span className={`text-xs font-medium w-8 text-right ${
                      s.is_placeholder ? 'text-muted-foreground' : 'text-foreground'
                    }`}>
                      {Number(s.composite_score).toFixed(0)}
                    </span>
                    {s.is_placeholder && (
                      <span className="text-[10px] text-muted-foreground/60">~</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {scores.some((s) => s.is_placeholder) && (
              <p className="text-[11px] text-muted-foreground/60">~ = placeholder score (less than 20 days of data)</p>
            )}
          </div>
        )}
      </div>

      {/* Dynamic Insights */}
      {insights.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-yellow-500" />
            Insights
          </h2>
          <div className="grid gap-3">
            {insights.slice(0, 3).map((insight) => (
              <div
                key={insight.id}
                className={`rounded-xl border p-4 text-sm flex items-start gap-3 ${
                  insight.relevance === 'HIGH'
                    ? 'border-primary/20 bg-primary/5'
                    : 'bg-card'
                }`}
              >
                <span className="text-lg flex-shrink-0">{insight.icon}</span>
                <div className="flex-1">
                  <p className="text-foreground">{insight.text}</p>
                  {insight.actionText && insight.actionLink && (
                    <Link
                      href={insight.actionLink}
                      className="text-primary text-xs mt-1 inline-flex items-center gap-1 hover:underline"
                    >
                      {insight.actionText} <ChevronRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Monthly Progress Table */}
      {deposits.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              Monthly Progress
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="px-4 py-3 text-left font-medium">Month</th>
                  <th className="px-4 py-3 text-right font-medium">Deposited</th>
                  <th className="px-4 py-3 text-right font-medium">Portfolio Value</th>
                  <th className="px-4 py-3 text-right font-medium">Cumulative</th>
                  <th className="px-4 py-3 text-center font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {deposits.map((d) => {
                  const gain = d.portfolio_value_at_deposit - d.cumulative_deposited;
                  const gainPct = d.cumulative_deposited > 0 ? (gain / d.cumulative_deposited) * 100 : 0;
                  return (
                    <tr key={d.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">
                        {new Date(d.month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}
                      </td>
                      <td className="px-4 py-3 text-right">{formatLKR(d.deposit_amount)}</td>
                      <td className="px-4 py-3 text-right">
                        {d.portfolio_value_at_deposit > 0 ? formatLKR(d.portfolio_value_at_deposit) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span>{formatLKR(d.cumulative_deposited)}</span>
                        {gain !== 0 && d.portfolio_value_at_deposit > 0 && (
                          <span className={`ml-2 text-xs ${gain >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {formatPct(gainPct)} {gain >= 0 ? '🟢' : '🔴'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs rounded-full px-2 py-0.5 ${d.source === 'atrad-auto' ? 'bg-blue-500/10 text-blue-400' : 'bg-muted text-muted-foreground'}`}>
                          {d.source === 'atrad-auto' ? 'Auto' : 'Manual'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* You vs The Market — only shown when portfolio has settled holdings */}
      {kpis && kpis.monthsInvested > 0 && kpis.currentPortfolioValue > 0 && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            📊 You vs The Market
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-muted/30 p-4 text-center">
              <p className="text-xs text-muted-foreground">Your Return</p>
              <p className={`text-2xl font-bold ${kpis.portfolioReturnPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatPct(kpis.portfolioReturnPct)}
              </p>
            </div>
            <div className="rounded-lg bg-muted/30 p-4 text-center">
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                Market (ASPI) <Tooltip tipKey="aspiReturn" />
              </p>
              <p className={`text-2xl font-bold ${kpis.aspiReturnSamePeriod >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatPct(kpis.aspiReturnSamePeriod)}
              </p>
            </div>
          </div>
          <p className="text-center text-sm">
            {kpis.beatingMarket ? (
              <span className="text-green-400">
                You&apos;re beating the market by {formatPct(kpis.portfolioReturnPct - kpis.aspiReturnSamePeriod)}! 🎉
              </span>
            ) : (
              <span className="text-muted-foreground">
                Market is ahead by {formatPct(kpis.aspiReturnSamePeriod - kpis.portfolioReturnPct)}.
                Keep investing consistently — long-term strategy matters more than short-term returns.
              </span>
            )}
          </p>
        </div>
      )}
      {/* Placeholder when holdings haven't settled yet */}
      {kpis && kpis.monthsInvested > 0 && kpis.currentPortfolioValue === 0 && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-5 text-center space-y-1">
          <p className="text-sm font-medium text-blue-300">📊 You vs The Market</p>
          <p className="text-xs text-muted-foreground">
            Performance comparison will appear once your holdings settle (T+2).
          </p>
        </div>
      )}

      {/* Portfolio Health Score */}
      {health && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Heart className="h-5 w-5 text-red-400" />
              Portfolio Health
              <Tooltip tipKey="healthScore" />
            </h2>
            <div className="flex items-center gap-2">
              <span className={`text-3xl font-bold ${getGradeColor(health.grade)}`}>
                {health.grade}
              </span>
              <span className="text-muted-foreground text-sm">{health.overallScore}/100</span>
            </div>
          </div>
          <div className="space-y-3">
            <HealthBar score={health.diversification.score} label={`Diversification — ${health.diversification.label}`} />
            <HealthBar score={health.shariahCompliance.score} label={`Shariah Compliance — ${health.shariahCompliance.label}`} />
            <HealthBar score={health.riskLevel.score} label={`Risk Level — ${health.riskLevel.label}`} />
            <HealthBar score={health.costEfficiency.score} label={`Cost Efficiency — ${health.costEfficiency.label}`} />
            <HealthBar score={health.consistency.score} label={`Consistency — ${health.consistency.label}`} />
          </div>
          {health.suggestion && (
            <div className="rounded-lg bg-primary/5 border border-primary/10 p-3 text-sm">
              <p className="text-primary">💡 {health.suggestion}</p>
            </div>
          )}
        </div>
      )}

      {/* Shariah Health */}
      {kpis && (
        <div className="rounded-xl border bg-card p-5 space-y-2">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-green-500" />
            Shariah Health
          </h2>
          {kpis.currentPortfolioValue === 0 ? (
            <p className="text-sm text-muted-foreground">
              No holdings yet. Start investing to track your Shariah compliance score.
            </p>
          ) : (
          <p className="text-sm">
            <span className="text-foreground font-medium">{Math.round(kpis.shariahCompliantPct)}%</span>{' '}
            <span className="text-muted-foreground">of your portfolio is Shariah compliant</span>{' '}
            {kpis.shariahCompliantPct >= 90 ? '✅' : kpis.shariahCompliantPct >= 50 ? '⚠️' : '❌'}
          </p>
          )}
          {kpis.totalPurificationDue > 0 && (
            <p className="text-sm text-muted-foreground">
              Purification due: <span className="text-foreground">{formatLKR(kpis.totalPurificationDue)}</span>{' '}
              <span className="text-xs">(donate to charity)</span>
              <Tooltip tipKey="purification" />
            </p>
          )}
          {kpis.totalDividendsReceived > 0 && (
            <p className="text-sm text-muted-foreground">
              Total dividends received: <span className="text-foreground">{formatLKR(kpis.totalDividendsReceived)}</span>
            </p>
          )}
        </div>
      )}

      {/* Goals Section */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Investment Goals
          </h2>
          <button
            onClick={() => setShowGoalForm(true)}
            className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
          >
            <Plus className="h-3 w-3" /> Set Goal
          </button>
        </div>

        {goals.length === 0 && !showGoalForm && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              No goals yet. Choose a template to get started, or set a custom goal:
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                {
                  label: 'Emergency Fund Portfolio',
                  amount: '500000',
                  description: 'Build a LKR 500,000 portfolio in 3 years as a safety net',
                },
                {
                  label: 'Grow Monthly SIP',
                  amount: '300000',
                  description: 'Reach LKR 25,000/month contribution within 12 months',
                },
                {
                  label: '15% Return Target',
                  amount: '115000',
                  description: 'Achieve 15% portfolio return within 2 years',
                },
              ].map((template) => (
                <button
                  key={template.label}
                  onClick={() => {
                    setGoalAmount(template.amount);
                    setGoalLabel(template.label);
                    setShowGoalForm(true);
                  }}
                  className="text-left rounded-lg border p-3 hover:border-primary/50 hover:bg-primary/5 transition-colors space-y-1"
                >
                  <p className="text-sm font-medium">{template.label}</p>
                  <p className="text-xs text-muted-foreground">{template.description}</p>
                  <p className="text-xs text-primary">Use this template →</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {goals.map((goal) => (
          <div key={goal.id} className="rounded-lg border p-4 space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-medium">{goal.label || 'Investment Goal'}</span>
              <span className="text-sm text-muted-foreground">{formatLKR(goal.target_amount)}</span>
            </div>
            <div className="h-2.5 rounded-full bg-muted/50 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-green-500"
                style={{ width: `${Math.min(100, goal.progressPercent)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatLKR(goal.currentProgress)} ({Math.round(goal.progressPercent)}%)</span>
              <span>{goal.onTrack ? '✅ On track' : '⚠️ Needs attention'}</span>
            </div>
            {/* Milestones */}
            <div className="flex gap-2 text-xs">
              {goal.milestones.map((m) => (
                <span
                  key={m.percent}
                  className={`rounded-full px-2 py-0.5 ${
                    m.reached
                      ? 'bg-green-500/10 text-green-400'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {m.reached ? '🏆' : '○'} {m.percent}%
                </span>
              ))}
            </div>
          </div>
        ))}

        {/* Goal Form */}
        {showGoalForm && (
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm">Set New Goal</h3>
              <button onClick={() => setShowGoalForm(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Target Amount (LKR)</label>
                <input
                  type="number"
                  value={goalAmount}
                  onChange={(e) => setGoalAmount(e.target.value)}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Label (optional)</label>
                <input
                  type="text"
                  value={goalLabel}
                  onChange={(e) => setGoalLabel(e.target.value)}
                  placeholder="e.g., First LKR 100,000"
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
            <button
              onClick={handleCreateGoal}
              disabled={goalSubmitting}
              className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {goalSubmitting ? 'Creating...' : 'Create Goal'}
            </button>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setShowDepositForm(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Record This Month&apos;s Deposit
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg border px-5 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors"
        >
          <TrendingUp className="h-4 w-4" />
          Switch to Pro Dashboard
        </Link>
      </div>

      {/* Deposit Form Modal */}
      {showDepositForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg mx-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Record Monthly Deposit</h3>
              <button onClick={() => setShowDepositForm(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-muted-foreground">Month</label>
                <input
                  type="month"
                  value={depositMonth}
                  onChange={(e) => setDepositMonth(e.target.value)}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Amount (LKR)</label>
                <input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Date</label>
                <input
                  type="date"
                  value={depositDate}
                  onChange={(e) => setDepositDate(e.target.value)}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Notes (optional)</label>
                <input
                  type="text"
                  value={depositNotes}
                  onChange={(e) => setDepositNotes(e.target.value)}
                  placeholder="e.g., Salary deposit"
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDepositForm(false)}
                className="flex-1 rounded-lg border px-4 py-2 text-sm hover:bg-muted/50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeposit}
                disabled={depositSubmitting}
                className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {depositSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                ) : (
                  'Record Deposit'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
