'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { isSafeUrl } from '@/lib/safe-url';
import {
  marketApi,
  portfolioApi,
  aiApi,
  newsApi,
  globalApi,
  type MarketSummary,
  type PortfolioSummary,
  type DailyBrief,
  type NewsItemData,
  type EconomicEvent,
} from '@/lib/api';
import Link from 'next/link';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Newspaper,
  CalendarDays,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function fmtLkr(val: number): string {
  return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function simplifyAIBrief(brief: { summary: string; marketSentiment: string; topOpportunities: string[] }): {
  summary: string;
  opportunities: string[];
} {
  const raw = brief.summary ?? '';

  // Friendly fallback for data-constrained / unavailable sessions
  if (!raw || raw.includes('DATA UNAVAILABLE') || raw.includes('data-constrained')) {
    const dayOfWeek = new Date().getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    return {
      summary: isWeekend
        ? 'The market is closed over the weekend. The AI will provide a fresh analysis when trading resumes on Monday at 9:30 AM.'
        : 'Live market data is still loading. The AI will have a full analysis once today\'s trading data arrives.',
      opportunities: [],
    };
  }

  // Translate sentiment to plain English
  const sentimentMap: Record<string, string> = {
    BULLISH: 'The AI sees positive signs in the market — stocks are generally looking good.',
    NEUTRAL: 'The market is steady with no major surprises expected.',
    CAUTIOUS: 'The AI recommends a cautious approach — some uncertainty ahead, but nothing alarming.',
    BEARISH: 'The AI sees some caution signs. This is normal market behavior — your long-term strategy is unchanged.',
  };
  const sentimentLine = sentimentMap[brief.marketSentiment] ?? 'The market is currently under review.';

  // Try to extract a plain-English insight
  // Look for "Base case", "Trading Thesis", or "Recommendation" sections
  // Flatten multi-line content by splitting on double newline
  let insight = '';
  const flatRaw = raw.replace(/\r?\n/g, ' ');
  const thesisMatch = flatRaw.match(/Base case[:\s*]*\**(.*?)(?=Bull|Bear|Risk|Key|---|$)/i);
  const recommendMatch = flatRaw.match(/Recommendation[:\s*]*\**(.*?)(?=---|$)/i);
  const conclusionMatch = flatRaw.match(/(?:conclusion|bottom line|summary)[:\s*]*\**(.*?)(?=---|$)/i);

  const extracted = thesisMatch?.[1] ?? recommendMatch?.[1] ?? conclusionMatch?.[1] ?? '';

  if (extracted.length > 20) {
    insight = extracted
      .replace(/\*\*/g, '')
      .replace(/#{1,6}\s*/g, '')
      .replace(/\|[^|]*\|/g, '')
      .replace(/---+/g, '')
      .replace(/⚠️/g, '')
      .replace(/\n+/g, ' ')
      .trim();
  }

  const summary = insight.length > 30
    ? `${sentimentLine} ${insight.length > 200 ? insight.slice(0, 197) + '...' : insight}`
    : sentimentLine;

  // Filter real opportunities (not placeholder text)
  const opportunities = (brief.topOpportunities ?? []).filter(
    (o) => o && !o.toLowerCase().includes('see analysis') && o.length > 10,
  ).slice(0, 2);

  return { summary, opportunities };
}

export function SimpleDashboard() {
  const [summary, setSummary] = useState<MarketSummary | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [news, setNews] = useState<NewsItemData[]>([]);
  const [events, setEvents] = useState<EconomicEvent[]>([]);

  useEffect(() => {
    marketApi.getSummary().then((r) => setSummary(r.data)).catch(() => {});
    portfolioApi.getSummary().then((r) => setPortfolio(r.data)).catch(() => {});
    aiApi.getDailyBrief().then((r) => setBrief(r.data)).catch(() => {});
    newsApi.getNews({ limit: 3 }).then((r) => setNews(r.data)).catch(() => {});
    globalApi.getEconomicCalendar().then((r) => setEvents(r.data)).catch(() => {});
  }, []);

  const aspiChange = Number(summary?.aspi_change_percent ?? 0);
  const aspiUp = aspiChange > 0;
  const aspiDown = aspiChange < 0;

  const pnl = Number(portfolio?.total_pnl ?? 0);
  const pnlPct = Number(portfolio?.total_pnl_percent ?? 0);
  const invested = Number(portfolio?.total_invested ?? 0);
  const currentValue = Number(portfolio?.total_value ?? 0);
  const hasHoldings = (portfolio?.holdings_count ?? 0) > 0;

  return (
    <div className="max-w-2xl mx-auto space-y-4 px-2 py-4">
      {/* Greeting */}
      <div className="rounded-xl border bg-card px-5 py-4">
        <h2 className="text-lg font-semibold">{getGreeting()}, Atheeque!</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Here&apos;s your investment update for today.</p>
      </div>

      {/* Market Today */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center gap-2">
            {aspiUp ? (
              <TrendingUp className="h-5 w-5 text-emerald-500" />
            ) : aspiDown ? (
              <TrendingDown className="h-5 w-5 text-red-500" />
            ) : (
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
            )}
            <h3 className="font-semibold text-sm">Market Today</h3>
          </div>

          {summary ? (
            <div className="space-y-2">
              <p className="text-sm leading-relaxed">
                The Sri Lankan stock market{' '}
                <span className={aspiUp ? 'text-emerald-600 font-semibold' : aspiDown ? 'text-red-600 font-semibold' : 'font-semibold'}>
                  {aspiUp ? 'went UP' : aspiDown ? 'went DOWN' : 'was unchanged'} today by{' '}
                  {Math.abs(aspiChange).toFixed(2)}%
                </span>
                .{' '}
                {aspiUp
                  ? 'This means most stock prices increased — good for your existing investments.'
                  : aspiDown
                  ? 'This means most stock prices decreased. Short-term drops are normal — your long-term strategy is unchanged.'
                  : 'The market moved sideways today.'}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                The market index (ASPI) is at{' '}
                <span className="font-medium text-foreground">
                  {Number(summary.aspi_value ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </span>
                . Think of ASPI as a &quot;health score&quot; for the entire stock market — when it goes up, most stocks are doing well.
              </p>
            </div>
          ) : (
            <div className="h-12 animate-pulse rounded bg-muted" />
          )}
        </CardContent>
      </Card>

      {/* Your Portfolio */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-sm">Your Portfolio</h3>
            </div>
            <Link href="/portfolio" className="flex items-center gap-1 text-xs text-primary hover:underline">
              View details <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {portfolio ? (
            hasHoldings ? (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">You&apos;ve invested</p>
                    <p className="font-semibold">LKR {fmtLkr(invested)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Current value</p>
                    <p className="font-semibold">LKR {fmtLkr(currentValue)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Change</p>
                    <p className={`font-semibold ${pnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {pnl >= 0 ? '+' : ''}LKR {fmtLkr(Math.abs(pnl))}{' '}
                      <span className="text-xs">({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)</span>
                    </p>
                  </div>
                </div>
                {pnl < 0 && (
                  <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-yellow-500/50 pl-2">
                    Don&apos;t worry — stock investing is a long-term journey. Short-term drops are normal, especially in the first few months.
                    Your Rupee Cost Averaging strategy works best over 2–5 years.
                  </p>
                )}
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  All your investments are Shariah-compliant ✓
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                You haven&apos;t added any holdings yet.{' '}
                <Link href="/portfolio" className="text-primary hover:underline">
                  Add your first investment →
                </Link>
              </p>
            )
          ) : (
            <div className="h-16 animate-pulse rounded bg-muted" />
          )}
        </CardContent>
      </Card>

      {/* What the AI Thinks */}
      {brief && (() => {
        const simplified = simplifyAIBrief(brief);
        return (
          <Card>
            <CardContent className="pt-4 space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-sm">What the AI Thinks</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {simplified.summary}
              </p>
              {simplified.opportunities.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium">Opportunities to watch:</p>
                  {simplified.opportunities.map((opp, i) => (
                    <p key={i} className="text-xs text-muted-foreground pl-3">• {opp}</p>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground border-t pt-2 mt-1">
                This is educational context, not financial advice.
              </p>
            </CardContent>
          </Card>
        );
      })()}

      {/* What to Do This Week */}
      <Card>
        <CardContent className="pt-4 space-y-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-sm">What to Watch This Week</h3>
          </div>
          <div className="space-y-2">
            {events.slice(0, 3).map((event, i) => {
              const d = new Date(event.date);
              const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
              return (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="text-muted-foreground w-20 flex-shrink-0 mt-px">{label}</span>
                  <div>
                    <span className="font-medium">{event.title}</span>
                    {event.country === 'USD' && (
                      <p className="text-muted-foreground">Affects USD/LKR exchange rate — watch for rupee movement.</p>
                    )}
                  </div>
                </div>
              );
            })}
            {events.length === 0 && (
              <div className="space-y-1.5">
                <div className="flex items-start gap-2 text-xs">
                  <span className="text-muted-foreground w-20">Mar 25</span>
                  <div>
                    <span className="font-medium">CBSL Rate Decision</span>
                    <p className="text-muted-foreground">If they cut rates, it&apos;s usually good for stocks.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 text-xs">
                  <span className="text-muted-foreground w-20">Apr 1</span>
                  <div>
                    <span className="font-medium">Next RCA Purchase Window</span>
                    <p className="text-muted-foreground">Your planned LKR 10,000 monthly investment.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* News That Matters */}
      {news.length > 0 && (
        <Card>
          <CardContent className="pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Newspaper className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-sm">News That Matters</h3>
              </div>
              <Link href="/news" className="text-xs text-muted-foreground hover:text-foreground">
                More news →
              </Link>
            </div>
            <div className="space-y-2">
              {news.map((item) => (
                <div key={item.id} className="flex items-start gap-2 text-xs">
                  {item.impact_level === 'HIGH' && <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0 mt-0.5" />}
                  <div>
                    <p className="leading-tight font-medium">
                      {isSafeUrl(item.url) ? (
                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:text-primary">
                          {item.title}
                        </a>
                      ) : (
                        item.title
                      )}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{timeAgo(item.published_at)}</p>
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
