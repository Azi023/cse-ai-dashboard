'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { aiApi, type DailyBrief, type AiStatus } from '@/lib/api';
import { Sparkles, RefreshCw, ChevronDown, ChevronUp, AlertTriangle, TrendingUp, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { format } from 'date-fns';

const sentimentConfig = {
  BULLISH: { color: 'bg-green-600/20 text-green-500 border-green-600/30', label: 'Bullish' },
  BEARISH: { color: 'bg-red-600/20 text-red-500 border-red-600/30', label: 'Bearish' },
  NEUTRAL: { color: 'bg-gray-600/20 text-gray-400 border-gray-600/30', label: 'Neutral' },
  CAUTIOUS: { color: 'bg-yellow-600/20 text-yellow-500 border-yellow-600/30', label: 'Cautious' },
};

export function DailyBriefCard() {
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [error, setError] = useState(false);

  const fetchBrief = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(false);

    try {
      const [briefRes, statusRes] = await Promise.allSettled([
        aiApi.getDailyBrief(isRefresh), // forceRefresh=true only on manual refresh
        aiApi.getStatus(),
      ]);
      if (briefRes.status === 'fulfilled') setBrief(briefRes.value.data);
      else setError(true);
      if (statusRes.status === 'fulfilled') setAiStatus(statusRes.value.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchBrief();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm">AI Market Brief</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !brief) {
    return (
      <Card className="border-muted">
        <CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">
            AI Brief unavailable — make sure the backend is running.
          </p>
        </CardContent>
      </Card>
    );
  }

  const sentiment = sentimentConfig[brief.marketSentiment] ?? sentimentConfig.NEUTRAL;

  return (
    <Card className="ai-card-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
            </div>
            <CardTitle className="text-sm font-semibold">
              AI Market Brief — {format(new Date(), 'MMM d, yyyy')}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={sentiment.color}>
              {sentiment.label}
            </Badge>
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
              onClick={() => fetchBrief(true)}
              disabled={refreshing}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              title="Refresh brief"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors md:hidden"
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed [&_p]:my-1.5 [&_p]:leading-relaxed [&_strong]:text-foreground [&_li]:leading-relaxed ai-left-accent pl-3">
            <ReactMarkdown>{brief.summary}</ReactMarkdown>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {brief.topOpportunities.length > 0 && (
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-green-500">
                  <TrendingUp className="h-3 w-3" />
                  Opportunities
                </div>
                <ul className="space-y-1">
                  {brief.topOpportunities.map((opp, i) => (
                    <li key={i} className="text-xs text-muted-foreground">
                      {opp}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {brief.keyRisks.length > 0 && (
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-red-500">
                  <AlertTriangle className="h-3 w-3" />
                  Key Risks
                </div>
                <ul className="space-y-1">
                  {brief.keyRisks.map((risk, i) => (
                    <li key={i} className="text-xs text-muted-foreground">
                      {risk}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
