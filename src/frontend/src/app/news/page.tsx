'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { isSafeUrl } from '@/lib/safe-url';
import { newsApi, type NewsItemData } from '@/lib/api';
import { Newspaper, ExternalLink, RefreshCw, Search, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/format';
import { useDisplayMode } from '@/contexts/display-mode-context';

const impactColors: Record<string, string> = {
  HIGH: 'bg-red-500/20 text-red-400 border-red-500/30',
  MEDIUM: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  LOW: 'bg-muted text-muted-foreground border-muted-foreground/30',
  NEUTRAL: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

const directionColors: Record<string, string> = {
  POSITIVE: 'text-green-500',
  NEGATIVE: 'text-red-500',
  MIXED: 'text-yellow-500',
};

const categoryLabels: Record<string, string> = {
  MONETARY_POLICY: 'Monetary Policy',
  FISCAL_POLICY: 'Fiscal Policy',
  CORPORATE: 'Corporate',
  COMMODITY: 'Commodities',
  GLOBAL: 'Global',
  POLITICAL: 'Political',
  SECTOR: 'Sector',
};

const sourceLabels: Record<string, string> = {
  daily_ft: 'Daily FT',
  economy_next: 'Economy Next',
  google_news_sl: 'Google News SL',
  google_news_cse: 'Google News CSE',
  reuters_asia: 'Reuters Asia',
  cnbc_asia: 'CNBC Asia',
};

export default function NewsPage() {
  const { isSimple } = useDisplayMode();
  const [news, setNews] = useState<NewsItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [impactFilter, setImpactFilter] = useState('');

  const fetchNews = useCallback(() => {
    setLoading(true);
    newsApi
      .getNews({
        limit: 100,
        source: sourceFilter || undefined,
        category: categoryFilter || undefined,
        impact: impactFilter || undefined,
        search: search || undefined,
      })
      .then((res) => setNews(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sourceFilter, categoryFilter, impactFilter, search]);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  const handleSearch = () => fetchNews();

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await newsApi.refresh();
      fetchNews();
    } catch {}
    setRefreshing(false);
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Newspaper className="h-5 w-5 text-primary" />
            {isSimple ? 'Market News' : 'News Intelligence'}
          </h2>
          <p className="text-muted-foreground text-sm">
            {isSimple
              ? 'Latest news that could affect your investments'
              : 'Market news from local and global sources with AI impact analysis'}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
          Refresh Feeds
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search headlines..."
            className="w-full rounded-md border bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {!isSimple && (
          <>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              aria-label="Filter by source"
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">All Sources</option>
              {Object.entries(sourceLabels).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Filter by category"
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">All Categories</option>
              {Object.entries(categoryLabels).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </>
        )}
        <select
          value={impactFilter}
          onChange={(e) => setImpactFilter(e.target.value)}
          aria-label="Filter by impact"
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="">All Impact</option>
          <option value="HIGH">High Impact</option>
          <option value="MEDIUM">Medium Impact</option>
          <option value="LOW">Low Impact</option>
        </select>
      </div>

      {/* News List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 rounded-lg bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : news.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No news items found. Click &ldquo;Refresh Feeds&rdquo; to fetch latest articles.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {news.map((item) => (
            <Card key={item.id} className="hover:bg-muted/10 transition-colors">
              <CardContent className="py-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className={impactColors[item.impact_level] || ''}>
                        {item.impact_level}
                      </Badge>
                      {item.category && (
                        <Badge variant="secondary" className="text-[10px]">
                          {categoryLabels[item.category] || item.category}
                        </Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {sourceLabels[item.source] || item.source}
                      </span>
                    </div>
                    <h3 className="font-medium text-sm leading-tight">
                      {isSafeUrl(item.url) ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-primary hover:underline inline-flex items-center gap-1"
                        >
                          {item.title}
                          <ExternalLink className="h-3 w-3 flex-shrink-0" />
                        </a>
                      ) : (
                        item.title
                      )}
                    </h3>
                    {item.summary && item.summary !== item.title && !item.title.startsWith(item.summary.slice(0, 40)) ? (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {item.summary}
                      </p>
                    ) : !item.summary ? (
                      <p className="text-xs text-muted-foreground mt-1">
                        {sourceLabels[item.source] || item.source}
                        {isSafeUrl(item.url) && (
                          <> &middot; <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Read more</a></>
                        )}
                      </p>
                    ) : null}
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {timeAgo(item.published_at)}
                  </span>
                </div>

                {/* Affected symbols & sectors */}
                <div className="flex flex-wrap gap-1.5">
                  {item.impact_direction && item.impact_direction !== 'MIXED' && (
                    <span className={cn('text-[10px] font-medium', directionColors[item.impact_direction])}>
                      {item.impact_direction === 'POSITIVE' ? 'Positive' : 'Negative'}
                    </span>
                  )}
                  {/* Shariah Impact tag — shown when news may affect Shariah screening */}
                  {/banking|interest rate|alcohol|tobacco|insurance|riba|liquor|beer|finance charge|conventional loan/i.test(
                    (item.title || '') + ' ' + (item.summary || '')
                  ) && (
                    <Badge variant="outline" className="text-[10px] h-4 px-1 border-green-600/40 text-green-500">
                      Shariah-relevant
                    </Badge>
                  )}
                  {item.affected_symbols?.map((s) => (
                    <Badge key={s} variant="outline" className="text-[10px] h-4 px-1">
                      {s.replace('.N0000', '')}
                    </Badge>
                  ))}
                  {item.affected_sectors?.map((s) => (
                    <Badge key={s} variant="secondary" className="text-[10px] h-4 px-1">
                      {s}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
