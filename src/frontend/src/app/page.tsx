'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { IndexCard } from '@/components/market/index-card';
import { MarketStatsCard } from '@/components/market/market-stats-card';
import { TopStocksTable } from '@/components/market/top-stocks-table';
import { marketApi, shariahApi, type MarketSummary, type TopStock, type SectorIndex } from '@/lib/api';
import { TrendingUp, TrendingDown, Activity, BarChart3, ShieldCheck } from 'lucide-react';

export default function DashboardPage() {
  const [summary, setSummary] = useState<MarketSummary | null>(null);
  const [gainers, setGainers] = useState<TopStock[]>([]);
  const [losers, setLosers] = useState<TopStock[]>([]);
  const [active, setActive] = useState<TopStock[]>([]);
  const [sectors, setSectors] = useState<SectorIndex[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shariahFilter, setShariahFilter] = useState(false);
  const [nonCompliantSymbols, setNonCompliantSymbols] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [summaryRes, gainersRes, losersRes, activeRes, sectorsRes] = await Promise.allSettled([
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
      } catch (err) {
        setError('Failed to load market data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
    const interval = setInterval(fetchAll, 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch non-compliant symbols for Shariah filter
  useEffect(() => {
    shariahApi.getNonCompliant().then((res) => {
      const symbols = new Set(res.data.map((s) => s.symbol));
      setNonCompliantSymbols(symbols);
    }).catch(() => {
      // Silently fail — filter just won't work without backend data
    });
  }, []);

  const filterStocks = (stocks: TopStock[]): TopStock[] => {
    if (!shariahFilter) return stocks;
    return stocks.filter((s) => !nonCompliantSymbols.has(s.symbol));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Market Overview</h2>
        <p className="text-muted-foreground">Colombo Stock Exchange &mdash; Live Dashboard</p>
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
              <TopStocksTable stocks={filterStocks(gainers)} loading={loading} type="gainers" />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="losers">
          <Card>
            <CardContent className="pt-4">
              <TopStocksTable stocks={filterStocks(losers)} loading={loading} type="losers" />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="active">
          <Card>
            <CardContent className="pt-4">
              <TopStocksTable stocks={filterStocks(active)} loading={loading} type="active" />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Sectors */}
      {sectors.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <CardTitle>Sector Indices</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {sectors.map((sector) => (
                <div
                  key={sector.name}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <span className="text-sm font-medium truncate mr-2">{sector.name}</span>
                  <div className="text-right">
                    <div className="text-sm font-medium">{sector.indexValue?.toFixed(2)}</div>
                    <div className={`text-xs ${sector.percentage > 0 ? 'text-green-600' : sector.percentage < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                      {sector.percentage > 0 ? '+' : ''}{sector.percentage?.toFixed(2)}%
                    </div>
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
