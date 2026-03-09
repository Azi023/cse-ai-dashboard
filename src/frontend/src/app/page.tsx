'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { IndexCard } from '@/components/market/index-card';
import { MarketStatsCard } from '@/components/market/market-stats-card';
import { TopStocksTable } from '@/components/market/top-stocks-table';
import { DailyBriefCard } from '@/components/market/daily-brief';
import {
  marketApi,
  shariahApi,
  stocksApi,
  type MarketSummary,
  type TopStock,
  type SectorIndex,
  type Stock,
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
} from 'lucide-react';
import Link from 'next/link';

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

export default function DashboardPage() {
  const [summary, setSummary] = useState<MarketSummary | null>(null);
  const [gainers, setGainers] = useState<TopStock[]>([]);
  const [losers, setLosers] = useState<TopStock[]>([]);
  const [active, setActive] = useState<TopStock[]>([]);
  const [sectors, setSectors] = useState<SectorIndex[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shariahFilter, setShariahFilter] = useState(false);
  const [nonCompliantSymbols, setNonCompliantSymbols] = useState<Set<string>>(
    new Set(),
  );

  // Watchlist
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

  // Fetch non-compliant symbols + all stocks for watchlist search
  useEffect(() => {
    shariahApi
      .getNonCompliant()
      .then((res) => {
        setNonCompliantSymbols(new Set(res.data.map((s) => s.symbol)));
      })
      .catch(() => {});

    stocksApi
      .getAll()
      .then((res) => setAllStocks(res.data))
      .catch(() => {});
  }, []);

  // Fetch watchlist stock details
  useEffect(() => {
    if (watchlist.length === 0) {
      setWatchlistStocks([]);
      return;
    }
    if (allStocks.length > 0) {
      setWatchlistStocks(
        allStocks.filter((s) => watchlist.includes(s.symbol)),
      );
    }
  }, [watchlist, allStocks]);

  const watchSearchResults = useMemo(() => {
    if (!watchSearch.trim()) return [];
    const q = watchSearch.toLowerCase();
    return allStocks
      .filter(
        (s) =>
          !watchlist.includes(s.symbol) &&
          (s.symbol.toLowerCase().includes(q) ||
            s.name.toLowerCase().includes(q)),
      )
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
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Market Overview</h2>
        <p className="text-muted-foreground">
          Colombo Stock Exchange &mdash; Live Dashboard
        </p>
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

      {/* Index Cards */}
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

      {/* AI Daily Brief */}
      <DailyBriefCard />

      {/* Watchlist */}
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
                        onClick={() => {
                          toggleWatch(stock.symbol);
                          setWatchSearch('');
                        }}
                        className="flex items-center justify-between w-full px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                      >
                        <span>
                          <span className="font-medium">{stock.symbol}</span>{' '}
                          <span className="text-muted-foreground">
                            {stock.name}
                          </span>
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
                      className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/30 transition-colors group"
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
                        {stock.shariah_status === 'compliant' && (
                          <span className="h-2 w-2 rounded-full bg-green-500" title="Shariah Compliant" />
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium">
                          {stock.last_price
                            ? Number(stock.last_price).toFixed(2)
                            : '\u2014'}
                        </span>
                        <span
                          className={`text-xs font-medium ${
                            change > 0
                              ? 'text-green-500'
                              : change < 0
                                ? 'text-red-500'
                                : 'text-muted-foreground'
                          }`}
                        >
                          {change > 0 ? '+' : ''}
                          {change.toFixed(2)}%
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
                  <button
                    onClick={() => setShowWatchSearch(true)}
                    className="text-primary hover:underline"
                  >
                    Add stocks
                  </button>
                </p>
              )
            )}
          </CardContent>
        </Card>
      )}

      {/* Top Stocks Tabs */}
      <Tabs defaultValue="gainers" className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="gainers" className="gap-1">
              <TrendingUp className="h-3 w-3" /> Top Gainers
            </TabsTrigger>
            <TabsTrigger value="losers" className="gap-1">
              <TrendingDown className="h-3 w-3" /> Top Losers
            </TabsTrigger>
            <TabsTrigger value="active" className="gap-1">
              <Activity className="h-3 w-3" /> Most Active
            </TabsTrigger>
          </TabsList>
          <button
            onClick={() => setShariahFilter((prev) => !prev)}
            className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              shariahFilter
                ? 'border-green-500 bg-green-500/10 text-green-500'
                : 'border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/50'
            }`}
          >
            <ShieldCheck className="h-3 w-3" />
            {shariahFilter ? 'Shariah Filter ON' : 'Shariah Filter'}
          </button>
        </div>
        <TabsContent value="gainers">
          <Card>
            <CardContent className="pt-4">
              <TopStocksTable
                stocks={filterStocks(gainers)}
                loading={loading}
                type="gainers"
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="losers">
          <Card>
            <CardContent className="pt-4">
              <TopStocksTable
                stocks={filterStocks(losers)}
                loading={loading}
                type="losers"
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="active">
          <Card>
            <CardContent className="pt-4">
              <TopStocksTable
                stocks={filterStocks(active)}
                loading={loading}
                type="active"
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Sectors — sorted by performance, color-coded */}
      {sortedSectors.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <CardTitle>Sector Indices</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {sortedSectors.map((sector) => {
                const isPos = sector.percentage > 0;
                const isNeg = sector.percentage < 0;
                return (
                  <div
                    key={sector.name}
                    className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                      isPos
                        ? 'border-green-500/20 bg-green-500/5'
                        : isNeg
                          ? 'border-red-500/20 bg-red-500/5'
                          : ''
                    }`}
                  >
                    <span className="text-sm font-medium truncate mr-2">
                      {sector.name}
                    </span>
                    <div className="text-right">
                      <div className="text-sm font-medium">
                        {sector.indexValue?.toFixed(2)}
                      </div>
                      <div
                        className={`text-xs ${
                          isPos
                            ? 'text-green-500'
                            : isNeg
                              ? 'text-red-500'
                              : 'text-muted-foreground'
                        }`}
                      >
                        {isPos ? '+' : ''}
                        {sector.percentage?.toFixed(2)}%
                      </div>
                    </div>
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
