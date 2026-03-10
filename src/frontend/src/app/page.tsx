'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { IndexCard } from '@/components/market/index-card';
import { MarketStatsCard } from '@/components/market/market-stats-card';
import { TopStocksTable } from '@/components/market/top-stocks-table';
import { DailyBriefCard } from '@/components/market/daily-brief';
import { MacroIndicatorsCard } from '@/components/market/macro-indicators';
import { GlobalIndicatorsCard } from '@/components/market/global-indicators';
import {
  marketApi,
  shariahApi,
  stocksApi,
  newsApi,
  alertsApi,
  type MarketSummary,
  type TopStock,
  type SectorIndex,
  type Stock,
  type NewsItemData,
  type AlertRecord,
} from '@/lib/api';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  BarChart3,
  ShieldCheck,
  Star,
  Search,
  X,
  AlertTriangle,
  Newspaper,
  Bell,
  ExternalLink,
  HelpCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useDisplayMode } from '@/contexts/display-mode-context';
import { getSimpleLabel } from '@/lib/simple-mode-constants';

function useWatchlist() {
  const [watchlist, setWatchlist] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('cse_watchlist');
      if (saved) setWatchlist(JSON.parse(saved));
    } catch {}
  }, []);

  const toggle = useCallback((symbol: string) => {
    setWatchlist((prev) => {
      const next = prev.includes(symbol)
        ? prev.filter((s) => s !== symbol)
        : [...prev, symbol];
      localStorage.setItem('cse_watchlist', JSON.stringify(next));
      return next;
    });
  }, []);

  const has = useCallback(
    (symbol: string) => watchlist.includes(symbol),
    [watchlist],
  );

  return { watchlist, toggle, has };
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function DashboardPage() {
  const { isSimple } = useDisplayMode();
  const [summary, setSummary] = useState<MarketSummary | null>(null);
  const [gainers, setGainers] = useState<TopStock[]>([]);
  const [losers, setLosers] = useState<TopStock[]>([]);
  const [active, setActive] = useState<TopStock[]>([]);
  const [sectors, setSectors] = useState<SectorIndex[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shariahFilter, setShariahFilter] = useState(false);
  const [nonCompliantSymbols, setNonCompliantSymbols] = useState<Set<string>>(new Set());
  const [recentNews, setRecentNews] = useState<NewsItemData[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<AlertRecord[]>([]);

  const { watchlist, toggle: toggleWatch, has: inWatchlist } = useWatchlist();
  const [watchlistStocks, setWatchlistStocks] = useState<Stock[]>([]);
  const [watchSearch, setWatchSearch] = useState('');
  const [allStocks, setAllStocks] = useState<Stock[]>([]);
  const [showWatchSearch, setShowWatchSearch] = useState(false);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [summaryRes, gainersRes, losersRes, activeRes, sectorsRes] =
          await Promise.allSettled([
            marketApi.getSummary(),
            marketApi.getGainers(),
            marketApi.getLosers(),
            marketApi.getActive(),
            marketApi.getSectors(),
          ]);

        if (summaryRes.status === 'fulfilled') setSummary(summaryRes.value.data);
        if (gainersRes.status === 'fulfilled') setGainers(gainersRes.value.data);
        if (losersRes.status === 'fulfilled') setLosers(losersRes.value.data);
        if (activeRes.status === 'fulfilled') setActive(activeRes.value.data);
        if (sectorsRes.status === 'fulfilled') setSectors(sectorsRes.value.data);
      } catch {
        setError('Failed to load market data');
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
    const interval = setInterval(fetchAll, 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch non-compliant symbols, all stocks, news, alerts
  useEffect(() => {
    shariahApi.getNonCompliant().then((res) => {
      setNonCompliantSymbols(new Set(res.data.map((s) => s.symbol)));
    }).catch(() => {});

    stocksApi.getAll().then((res) => setAllStocks(res.data)).catch(() => {});

    newsApi.getNews({ limit: 5, impact: 'HIGH' }).then((res) => {
      setRecentNews(res.data);
    }).catch(() => {
      newsApi.getNews({ limit: 5 }).then((res) => setRecentNews(res.data)).catch(() => {});
    });

    alertsApi.getNotifications(5).then((res) => setRecentAlerts(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (watchlist.length === 0) { setWatchlistStocks([]); return; }
    if (allStocks.length > 0) {
      setWatchlistStocks(allStocks.filter((s) => watchlist.includes(s.symbol)));
    }
  }, [watchlist, allStocks]);

  const watchSearchResults = useMemo(() => {
    if (!watchSearch.trim()) return [];
    const q = watchSearch.toLowerCase();
    return allStocks
      .filter((s) => !watchlist.includes(s.symbol) &&
        (s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)))
      .slice(0, 5);
  }, [watchSearch, allStocks, watchlist]);

  const filterStocks = (stocks: TopStock[]): TopStock[] => {
    if (!shariahFilter) return stocks;
    return stocks.filter((s) => !nonCompliantSymbols.has(s.symbol));
  };

  const sortedSectors = useMemo(() => {
    return [...sectors].sort((a, b) => b.percentage - a.percentage);
  }, [sectors]);

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            {isSimple ? 'Your Market Dashboard' : 'Market Overview'}
          </h2>
          <p className="text-muted-foreground text-sm">
            {isSimple
              ? 'A quick look at how the Colombo Stock Exchange is doing today'
              : 'Colombo Stock Exchange — Live Dashboard'}
          </p>
        </div>
        {summary && (
          <div className="hidden md:flex items-center gap-2">
            <Badge
              variant="outline"
              className={
                (summary.aspi_change_percent ?? 0) > 0
                  ? 'border-green-500/30 text-green-500'
                  : (summary.aspi_change_percent ?? 0) < 0
                    ? 'border-red-500/30 text-red-500'
                    : ''
              }
            >
              ASPI {(summary.aspi_change_percent ?? 0) > 0 ? '+' : ''}
              {(summary.aspi_change_percent ?? 0).toFixed(2)}%
            </Badge>
          </div>
        )}
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <p className="text-sm text-destructive">{error}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Make sure the backend server is running on port 3001
            </p>
          </CardContent>
        </Card>
      )}

      {/* Row 1: Index Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <IndexCard
          title="ASPI (All Share Price Index)"
          value={summary?.aspi_value ?? null}
          change={summary?.aspi_change ?? null}
          changePercent={summary?.aspi_change_percent ?? null}
          loading={loading}
        />
        <IndexCard
          title="S&P Sri Lanka 20"
          value={summary?.sp_sl20_value ?? null}
          change={summary?.sp_sl20_change ?? null}
          changePercent={summary?.sp_sl20_change_percent ?? null}
          loading={loading}
        />
        <MarketStatsCard
          volume={summary?.total_volume ?? null}
          turnover={summary?.total_turnover ?? null}
          trades={summary?.total_trades ?? null}
          loading={loading}
        />
      </div>

      {/* Row 2: AI Brief + Latest News side by side */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DailyBriefCard />
        </div>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Newspaper className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm">Latest News</CardTitle>
              </div>
              <Link
                href="/news"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                View all
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentNews.length > 0 ? (
              recentNews.map((item) => (
                <div key={item.id} className="space-y-0.5">
                  <div className="flex items-start gap-2">
                    {item.impact_level === 'HIGH' && (
                      <AlertTriangle className="h-3 w-3 text-red-500 mt-0.5 flex-shrink-0" />
                    )}
                    <p className="text-xs leading-tight line-clamp-2">
                      {item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-primary"
                        >
                          {item.title}
                        </a>
                      ) : (
                        item.title
                      )}
                    </p>
                  </div>
                  <p className="text-[10px] text-muted-foreground pl-5">
                    {timeAgo(item.published_at)}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">
                No news yet. News feeds refresh automatically.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Macro + Global Indicators (hidden in Simple mode) */}
      {!isSimple && (
        <div className="grid gap-4 lg:grid-cols-2">
          <MacroIndicatorsCard />
          <GlobalIndicatorsCard />
        </div>
      )}

      {/* Row 4: Watchlist + Recent Alerts */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Watchlist */}
        <div className="lg:col-span-2">
          {(watchlist.length > 0 || showWatchSearch) && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-yellow-500" />
                    <CardTitle className="text-sm">Watchlist</CardTitle>
                  </div>
                  <button
                    onClick={() => setShowWatchSearch(!showWatchSearch)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showWatchSearch ? 'Done' : '+ Add'}
                  </button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {showWatchSearch && (
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      value={watchSearch}
                      onChange={(e) => setWatchSearch(e.target.value)}
                      placeholder="Search stocks to add..."
                      className="w-full rounded-md border bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    {watchSearchResults.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 rounded-md border bg-popover shadow-md">
                        {watchSearchResults.map((stock) => (
                          <button
                            key={stock.symbol}
                            onClick={() => { toggleWatch(stock.symbol); setWatchSearch(''); }}
                            className="flex items-center justify-between w-full px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                          >
                            <span>
                              <span className="font-medium">{stock.symbol}</span>{' '}
                              <span className="text-muted-foreground">{stock.name}</span>
                            </span>
                            <Star className="h-3 w-3 text-muted-foreground" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {watchlistStocks.length > 0 ? (
                  <div className="space-y-1">
                    {watchlistStocks.map((stock) => {
                      const change = Number(stock.change_percent) || 0;
                      return (
                        <div
                          key={stock.symbol}
                          className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => toggleWatch(stock.symbol)}
                              className="text-yellow-500 hover:text-yellow-600 transition-colors"
                            >
                              <Star className="h-3.5 w-3.5 fill-current" />
                            </button>
                            <Link
                              href={`/stocks/${stock.symbol}`}
                              className="font-medium text-sm hover:underline"
                            >
                              {stock.symbol}
                            </Link>
                            <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                              {stock.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium">
                              {stock.last_price ? Number(stock.last_price).toFixed(2) : '\u2014'}
                            </span>
                            <span
                              className={`text-xs font-medium ${
                                change > 0 ? 'text-green-500' : change < 0 ? 'text-red-500' : 'text-muted-foreground'
                              }`}
                            >
                              {change > 0 ? '+' : ''}{change.toFixed(2)}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  !showWatchSearch && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      Your watchlist is empty.{' '}
                      <button onClick={() => setShowWatchSearch(true)} className="text-primary hover:underline">
                        Add stocks
                      </button>
                    </p>
                  )
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Recent Alerts */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm">Recent Alerts</CardTitle>
              </div>
              <Link
                href="/alerts"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                View all
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {recentAlerts.length > 0 ? (
              <div className="space-y-2">
                {recentAlerts.map((alert) => (
                  <div key={alert.id} className="flex items-start gap-2 text-xs">
                    {!alert.is_read && <span className="h-1.5 w-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="leading-tight">{alert.title}</p>
                      <p className="text-muted-foreground">{timeAgo(alert.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">No recent alerts</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 5: Top Stocks Tabs */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm">Market Movers</CardTitle>
            <button
              onClick={() => setShariahFilter((prev) => !prev)}
              className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                shariahFilter
                  ? 'border-green-500 bg-green-500/10 text-green-500'
                  : 'border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/50'
              }`}
            >
              <ShieldCheck className="h-3 w-3" />
              {shariahFilter ? 'Shariah ON' : 'Shariah'}
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-3">
            <div>
              <h4 className="text-xs font-medium text-green-500 mb-2 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> {isSimple ? 'Biggest Winners Today' : 'Top Gainers'}
              </h4>
              <TopStocksTable stocks={filterStocks(gainers)} loading={loading} type="gainers" />
            </div>
            <div>
              <h4 className="text-xs font-medium text-red-500 mb-2 flex items-center gap-1">
                <TrendingDown className="h-3 w-3" /> {isSimple ? 'Biggest Losers Today' : 'Top Losers'}
              </h4>
              <TopStocksTable stocks={filterStocks(losers)} loading={loading} type="losers" />
            </div>
            <div>
              <h4 className="text-xs font-medium text-blue-500 mb-2 flex items-center gap-1">
                <Activity className="h-3 w-3" /> {isSimple ? 'Most Traded Today' : 'Most Active'}
              </h4>
              <TopStocksTable stocks={filterStocks(active)} loading={loading} type="active" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Row 6: Sectors (hidden in Simple mode) */}
      {!isSimple && sortedSectors.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                <CardTitle className="text-sm">Sector Performance</CardTitle>
              </div>
              <Link
                href="/sectors"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Full analysis
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
              {sortedSectors.slice(0, 10).map((sector) => {
                const pct = sector.percentage;
                return (
                  <div
                    key={sector.name}
                    className="flex items-center justify-between rounded-lg border p-2.5 transition-colors hover:bg-muted/20"
                  >
                    <span className="text-xs font-medium truncate mr-2">
                      {sector.name}
                    </span>
                    <span
                      className={`text-xs font-medium whitespace-nowrap ${
                        pct > 0 ? 'text-green-500' : pct < 0 ? 'text-red-500' : 'text-muted-foreground'
                      }`}
                    >
                      {pct > 0 ? '+' : ''}{sector.percentage?.toFixed(2)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
