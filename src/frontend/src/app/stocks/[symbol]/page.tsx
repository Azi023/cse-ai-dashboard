'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { PriceChart } from '@/components/charts/price-chart';
import {
  stocksApi,
  aiApi,
  announcementsApi,
  analysisApi,
  type Stock,
  type StockPrice,
  type StockAnalysis,
  type AiStatus,
  type Announcement,
  type StockScoreData,
} from '@/lib/api';
import {
  ArrowLeft,
  Shield,
  ShieldAlert,
  ShieldQuestion,
  Sparkles,
  MessageSquare,
  RefreshCw,
  Loader2,
  Megaphone,
} from 'lucide-react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { safeNum } from '@/lib/format';

const PERIODS = [
  { label: '1W', days: 7 },
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
];

export default function StockDetailPage() {
  const params = useParams();
  const symbol = params.symbol as string;
  const [stock, setStock] = useState<Stock | null>(null);
  const [prices, setPrices] = useState<StockPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState(90);

  // AI Analysis state
  const [analysis, setAnalysis] = useState<StockAnalysis | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Announcements state
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  // Stock score state
  const [stockScore, setStockScore] = useState<StockScoreData | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [stockRes, pricesRes] = await Promise.allSettled([
          stocksApi.getOne(symbol),
          stocksApi.getPrices(symbol, period),
        ]);

        if (stockRes.status === 'fulfilled') setStock(stockRes.value.data);
        else setError('Stock not found');
        if (pricesRes.status === 'fulfilled') setPrices(pricesRes.value.data);
      } catch {
        setError('Failed to load stock data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [symbol, period]);

  // Fetch AI status
  useEffect(() => {
    aiApi.getStatus().then((res) => setAiStatus(res.data)).catch(() => {});
  }, []);

  // Fetch announcements
  useEffect(() => {
    announcementsApi
      .getRecent({ limit: 100 })
      .then((res) => {
        const filtered = res.data.filter(
          (a) =>
            a.symbol === symbol ||
            (a.title && a.title.toLowerCase().includes(symbol.split('.')[0].toLowerCase())),
        );
        setAnnouncements(filtered.slice(0, 10));
      })
      .catch(() => {});
  }, [symbol]);

  const fetchAnalysis = async () => {
    setAiLoading(true);
    try {
      const res = await aiApi.analyzeStock(symbol);
      setAnalysis(res.data);
    } catch {
      // Silent fail
    } finally {
      setAiLoading(false);
    }
  };

  // Auto-fetch analysis on load
  useEffect(() => {
    fetchAnalysis();
  }, [symbol]);

  // Fetch stock score
  useEffect(() => {
    analysisApi.getScores(200).then((res) => {
      const found = res.data.find((s) => s.symbol === symbol);
      if (found) setStockScore(found);
    }).catch(() => {});
  }, [symbol]);

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-[400px] w-full animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (error || !stock) {
    return (
      <div className="max-w-[1400px] mx-auto space-y-4">
        <Link
          href="/stocks"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Stocks
        </Link>
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <p className="text-destructive">{error || 'Stock not found'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isPositive = (Number(stock.change_percent) || 0) > 0;
  const price = Number(stock.last_price) || 0;
  const change = Number(stock.change_percent) || 0;
  const mcap = Number(stock.market_cap) || 0;

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <Link
        href="/stocks"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Stocks
      </Link>

      {/* Stock Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-bold">{stock.symbol}</h2>
            {stock.shariah_status === 'compliant' && (
              <Badge
                variant="outline"
                className="gap-1 border-green-600 text-green-600"
              >
                <Shield className="h-3 w-3" /> Shariah Compliant
              </Badge>
            )}
            {(stock.shariah_status === 'non_compliant' || stock.shariah_status === 'blacklisted') && (
              <Badge variant="destructive" className="gap-1">
                <ShieldAlert className="h-3 w-3" /> Non-Compliant
              </Badge>
            )}
            {stock.shariah_status === 'pending_review' && (
              <Badge
                variant="outline"
                className="gap-1 border-yellow-600 text-yellow-600"
              >
                <ShieldQuestion className="h-3 w-3" /> Pending Review
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">{stock.name}</p>
          {stock.sector && (
            <Badge variant="secondary" className="mt-1">
              {stock.sector}
            </Badge>
          )}
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold">
            LKR {price ? safeNum(price).toFixed(2) : '\u2014'}
          </div>
          <div
            className={cn(
              'text-lg',
              isPositive ? 'text-green-500' : change < 0 ? 'text-red-500' : 'text-muted-foreground',
            )}
          >
            {isPositive ? '+' : ''}
            {safeNum(change).toFixed(2)}%
          </div>
        </div>
      </div>

      <Separator />

      {/* Key Metrics Grid */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: 'Price', value: price ? `LKR ${safeNum(price).toFixed(2)}` : '\u2014' },
          {
            label: 'Change %',
            value: `${safeNum(change) > 0 ? '+' : ''}${safeNum(change).toFixed(2)}%`,
            color: safeNum(change) > 0 ? 'text-green-500' : safeNum(change) < 0 ? 'text-red-500' : undefined,
          },
          {
            label: 'Market Cap',
            value: safeNum(mcap) > 0 ? `LKR ${(safeNum(mcap) / 1_000_000_000).toFixed(2)}B` : '\u2014',
          },
          { label: 'Beta', value: stock.beta ? Number(stock.beta).toFixed(2) : '\u2014' },
          { label: 'Sector', value: stock.sector ?? '\u2014' },
          { label: 'Status', value: stock.is_active ? 'Active' : 'Inactive' },
        ].map((metric) => (
          <div key={metric.label} className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{metric.label}</p>
            <p className={cn('text-sm font-semibold mt-0.5', metric.color)}>
              {metric.value}
            </p>
          </div>
        ))}
      </div>

      {/* Price Chart with Period Selector */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>Price Chart</CardTitle>
            <div className="flex gap-1">
              {PERIODS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => setPeriod(p.days)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    period === p.days
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {prices.length > 0 ? (
            <PriceChart data={prices} />
          ) : (
            <p className="py-8 text-center text-muted-foreground">
              No price data available for this period
            </p>
          )}
        </CardContent>
      </Card>

      {/* AI Analysis + Shariah Card side by side */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* AI Intelligence Report — 2/3 width */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm">AI Intelligence Report</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                {aiStatus && (
                  <Badge
                    variant="secondary"
                    className={
                      aiStatus.mode === 'live'
                        ? 'bg-green-600/20 text-green-500 border-green-600/30'
                        : 'bg-yellow-600/20 text-yellow-500 border-yellow-600/30'
                    }
                  >
                    {aiStatus.mode === 'live' ? 'Live AI' : 'Mock'}
                  </Badge>
                )}
                <button
                  onClick={fetchAnalysis}
                  disabled={aiLoading}
                  className="p-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${aiLoading ? 'animate-spin' : ''}`}
                  />
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {aiLoading && !analysis ? (
              <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Generating analysis...</span>
              </div>
            ) : analysis ? (
              <div className="space-y-4">
                {/* Score badges */}
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">
                    Score: {analysis.fundamentalScore}/10
                  </Badge>
                  <Badge
                    variant="outline"
                    className={
                      analysis.technicalSignal === 'BULLISH'
                        ? 'border-green-600/30 text-green-500'
                        : analysis.technicalSignal === 'BEARISH'
                          ? 'border-red-600/30 text-red-500'
                          : 'border-gray-600/30 text-gray-400'
                    }
                  >
                    {analysis.technicalSignal}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={
                      analysis.confidence === 'HIGH'
                        ? 'border-green-600/30 text-green-500'
                        : analysis.confidence === 'MEDIUM'
                          ? 'border-yellow-600/30 text-yellow-500'
                          : 'border-gray-600/30 text-gray-400'
                    }
                  >
                    Confidence: {analysis.confidence}
                  </Badge>
                </div>

                {/* Analysis text */}
                <div className="prose prose-sm prose-invert max-w-none text-sm [&_p]:my-1.5 [&_strong]:text-foreground">
                  <ReactMarkdown>{analysis.analysis}</ReactMarkdown>
                </div>

                {/* Risk factors */}
                {analysis.riskFactors.length > 0 && (
                  <div className="rounded-lg border p-3 space-y-1.5">
                    <p className="text-xs font-medium text-red-500">
                      Risk Factors
                    </p>
                    {analysis.riskFactors.map((risk, i) => (
                      <p key={i} className="text-xs text-muted-foreground">
                        &bull; {risk}
                      </p>
                    ))}
                  </div>
                )}

                {/* Ask AI button */}
                <Link
                  href={`/chat?q=Analyze ${symbol} for me`}
                  className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  <MessageSquare className="h-3 w-3" />
                  Ask AI about this stock
                </Link>
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">
                AI analysis unavailable
              </p>
            )}
          </CardContent>
        </Card>

        {/* Shariah Compliance Card — 1/3 width */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <CardTitle className="text-sm">Shariah Compliance</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {stock.shariah_status === 'compliant' && (
              <>
                <div className="flex items-center gap-2">
                  <div className="rounded-full bg-green-500/10 p-2">
                    <Shield className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-green-500">Compliant</p>
                    <p className="text-xs text-muted-foreground">
                      Passes Tier 1 &amp; Tier 2 screening
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Suitable for Shariah-sensitive portfolios. Purification
                  calculations should be applied to any dividend income received.
                </p>
              </>
            )}
            {(stock.shariah_status === 'non_compliant' || stock.shariah_status === 'blacklisted') && (
              <>
                <div className="flex items-center gap-2">
                  <div className="rounded-full bg-red-500/10 p-2">
                    <ShieldAlert className="h-5 w-5 text-red-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-red-500">Non-Compliant</p>
                    <p className="text-xs text-muted-foreground">
                      Excluded from Shariah portfolios
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  This stock is excluded due to business activity or financial
                  ratio screens. It should not be held in a Shariah-compliant
                  portfolio.
                </p>
              </>
            )}
            {stock.shariah_status === 'pending_review' && (
              <>
                <div className="flex items-center gap-2">
                  <div className="rounded-full bg-yellow-500/10 p-2">
                    <ShieldQuestion className="h-5 w-5 text-yellow-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-yellow-500">
                      Pending Review
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Awaiting financial data
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Financial data for Tier 2 screening is not yet available.
                  Exercise caution until screening is complete.
                </p>
              </>
            )}

            <Separator />

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sector</span>
                <span>{stock.sector ?? '\u2014'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Market Cap</span>
                <span>
                  {safeNum(mcap) > 0
                    ? `LKR ${(safeNum(mcap) / 1_000_000_000).toFixed(2)}B`
                    : '\u2014'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Beta</span>
                <span>{stock.beta ? Number(stock.beta).toFixed(2) : '\u2014'}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Composite Score Breakdown */}
      {stockScore && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                Composite Score
                <span className={`rounded px-2 py-0.5 text-sm font-mono font-bold ${
                  Number(stockScore.composite_score) >= 70 ? 'bg-green-500/15 text-green-400' :
                  Number(stockScore.composite_score) >= 40 ? 'bg-yellow-500/15 text-yellow-400' :
                  'bg-red-500/15 text-red-400'
                }`}>
                  {Number(stockScore.composite_score).toFixed(1)}/100
                </span>
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {stockScore.is_placeholder ? `${stockScore.data_days}/20 days of data (accumulating)` : `Based on ${stockScore.data_days} trading days`}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <ScoreCategory
                title="Fundamentals"
                weight="35%"
                factors={[
                  { label: 'Earnings Growth', score: stockScore.earnings_growth_score, weight: '10%' },
                  { label: 'Debt Health', score: stockScore.debt_health_score, weight: '10%' },
                  { label: 'ROE Quality', score: stockScore.roe_score, weight: '8%' },
                  { label: 'Revenue Trend', score: stockScore.revenue_trend_score, weight: '7%' },
                ]}
              />
              <ScoreCategory
                title="Valuation"
                weight="25%"
                factors={[
                  { label: 'P/E Value', score: stockScore.pe_score, weight: '10%' },
                  { label: 'Dividend Yield', score: stockScore.dividend_score, weight: '10%' },
                  { label: 'P/B Value', score: stockScore.pb_score, weight: '5%' },
                ]}
              />
              <ScoreCategory
                title="Technical"
                weight="25%"
                factors={[
                  { label: '52-Wk Position', score: stockScore.week52_position_score, weight: '7%' },
                  { label: 'Price Momentum', score: stockScore.momentum_score, weight: '8%' },
                  { label: 'Volatility', score: stockScore.volatility_score, weight: '5%' },
                  { label: 'Volume Trend', score: stockScore.volume_score, weight: '5%' },
                ]}
              />
              <ScoreCategory
                title="Market Context"
                weight="15%"
                factors={[
                  { label: 'Sector Strength', score: stockScore.sector_score, weight: '8%' },
                  { label: 'Liquidity', score: stockScore.liquidity_score, weight: '7%' },
                ]}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Announcements */}
      {announcements.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Megaphone className="h-4 w-4" />
              <CardTitle className="text-sm">Recent Announcements</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {announcements.map((ann) => (
                <div
                  key={ann.id}
                  className="flex items-start justify-between gap-4 rounded-lg border p-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {ann.type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(ann.announced_at), 'MMM d, yyyy')}
                      </span>
                    </div>
                    <p className="text-sm mt-1 truncate">{ann.title}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ScoreCategory({
  title,
  weight,
  factors,
}: {
  title: string;
  weight: string;
  factors: Array<{ label: string; score: number; weight: string }>;
}) {
  const categoryAvg =
    factors.reduce((s, f) => s + Number(f.score), 0) / factors.length;

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold">{title}</p>
        <span className="text-xs text-muted-foreground">{weight}</span>
      </div>
      <div
        className={`h-1 w-full rounded-full ${
          categoryAvg >= 70 ? 'bg-green-500' :
          categoryAvg >= 40 ? 'bg-yellow-500' :
          'bg-red-500'
        }`}
        style={{ opacity: 0.6 }}
      />
      <div className="space-y-1.5">
        {factors.map((f) => {
          const val = Number(f.score);
          const barColor =
            val >= 70 ? 'bg-green-500' :
            val >= 40 ? 'bg-yellow-500' :
            'bg-red-500';
          return (
            <div key={f.label} className="space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{f.label}</span>
                <span className="text-xs font-mono">{val.toFixed(0)}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${barColor}`}
                  style={{ width: `${val}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
