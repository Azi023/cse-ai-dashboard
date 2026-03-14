'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { stocksApi, type Stock, type StockPrice } from '@/lib/api';
import { Search, X, Plus, Shield, ShieldAlert, ShieldQuestion } from 'lucide-react';
import { safeNum } from '@/lib/format';
import Link from 'next/link';

const CHART_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444'];

function normalizeData(data: StockPrice[]) {
  const sorted = [...data].sort((a, b) => (a.trade_date > b.trade_date ? 1 : -1));
  if (sorted.length === 0) return [];
  const basePrice = Number(sorted[0].close);
  if (basePrice === 0) return [];
  return sorted.map((d) => ({
    date: d.trade_date,
    value: ((Number(d.close) - basePrice) / basePrice) * 100,
  }));
}

export default function ComparePage() {
  const [allStocks, setAllStocks] = useState<Stock[]>([]);
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [stockData, setStockData] = useState<Map<string, Stock>>(new Map());
  const [priceData, setPriceData] = useState<Map<string, StockPrice[]>>(new Map());
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState(90);

  useEffect(() => {
    stocksApi.getAll().then((res) => setAllStocks(res.data)).catch(() => {});
  }, []);

  // Fetch price data when selection or period changes
  useEffect(() => {
    if (selectedSymbols.length === 0) return;
    setLoading(true);
    Promise.allSettled(
      selectedSymbols.map((sym) =>
        Promise.all([stocksApi.getOne(sym), stocksApi.getPrices(sym, period)]),
      ),
    ).then((results) => {
      const newStockData = new Map<string, Stock>();
      const newPriceData = new Map<string, StockPrice[]>();

      results.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          const [stockRes, pricesRes] = result.value;
          newStockData.set(selectedSymbols[i], stockRes.data);
          newPriceData.set(selectedSymbols[i], pricesRes.data);
        }
      });

      setStockData(newStockData);
      setPriceData(newPriceData);
      setLoading(false);
    });
  }, [selectedSymbols, period]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return allStocks
      .filter(
        (s) =>
          !selectedSymbols.includes(s.symbol) &&
          (s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }, [searchQuery, allStocks, selectedSymbols]);

  const addStock = (symbol: string) => {
    if (selectedSymbols.length >= 4) return;
    setSelectedSymbols((prev) => [...prev, symbol]);
    setSearchQuery('');
  };

  const removeStock = (symbol: string) => {
    setSelectedSymbols((prev) => prev.filter((s) => s !== symbol));
  };

  // Build normalized chart data
  const normalizedSeries = useMemo(() => {
    return selectedSymbols.map((sym, i) => ({
      symbol: sym,
      color: CHART_COLORS[i % CHART_COLORS.length],
      data: normalizeData(priceData.get(sym) ?? []),
    }));
  }, [selectedSymbols, priceData]);

  // Build metrics comparison
  const metrics = useMemo(() => {
    return selectedSymbols.map((sym, i) => {
      const stock = stockData.get(sym);
      const prices = priceData.get(sym) ?? [];
      const sorted = [...prices].sort((a, b) => (a.trade_date > b.trade_date ? 1 : -1));

      const high = sorted.length > 0 ? Math.max(...sorted.map((p) => Number(p.high))) : null;
      const low = sorted.length > 0 ? Math.min(...sorted.map((p) => Number(p.low))) : null;
      const avgVolume =
        sorted.length > 0
          ? sorted.reduce((s, p) => s + Number(p.volume), 0) / sorted.length
          : null;

      return {
        symbol: sym,
        color: CHART_COLORS[i % CHART_COLORS.length],
        price: stock ? Number(stock.last_price) : null,
        change: stock ? Number(stock.change_percent) : null,
        marketCap: stock ? Number(stock.market_cap) : null,
        sector: stock?.sector ?? '--',
        shariah: stock?.shariah_status ?? 'unknown',
        beta: stock?.beta ? Number(stock.beta) : null,
        periodHigh: high,
        periodLow: low,
        avgVolume: avgVolume ? Math.round(avgVolume) : null,
      };
    });
  }, [selectedSymbols, stockData, priceData]);

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Stock Comparison</h2>
        <p className="text-muted-foreground">
          Compare up to 4 stocks side by side
        </p>
      </div>

      {/* Stock Selector */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-2">
            {selectedSymbols.map((sym, i) => (
              <Badge
                key={sym}
                variant="outline"
                className="gap-1 px-2.5 py-1"
                style={{ borderColor: CHART_COLORS[i % CHART_COLORS.length] }}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                />
                {sym}
                <button
                  onClick={() => removeStock(sym)}
                  className="ml-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}

            {selectedSymbols.length < 4 && (
              <div className="relative">
                <div className="flex items-center">
                  <Search className="h-3.5 w-3.5 text-muted-foreground mr-1.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Add stock..."
                    className="w-40 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
                  />
                </div>
                {searchResults.length > 0 && (
                  <div className="absolute z-10 w-64 mt-1 rounded-md border bg-popover shadow-md">
                    {searchResults.map((stock) => (
                      <button
                        key={stock.symbol}
                        onClick={() => addStock(stock.symbol)}
                        className="flex items-center justify-between w-full px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                      >
                        <span>
                          <span className="font-medium">{stock.symbol}</span>{' '}
                          <span className="text-muted-foreground text-xs">
                            {stock.name}
                          </span>
                        </span>
                        <Plus className="h-3 w-3 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedSymbols.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              Search and add stocks above to start comparing
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Period Selector */}
          <div className="flex gap-1">
            {[
              { label: '1W', days: 7 },
              { label: '1M', days: 30 },
              { label: '3M', days: 90 },
              { label: '6M', days: 180 },
              { label: '1Y', days: 365 },
            ].map((p) => (
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

          {/* Normalized Performance Chart (simple text-based for now) */}
          {normalizedSeries.length > 0 && !loading && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">
                  Relative Performance (% change from start)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {normalizedSeries.map((series) => {
                    const lastPoint = series.data[series.data.length - 1];
                    const performance = lastPoint?.value ?? 0;
                    const barWidth = Math.min(Math.abs(performance) * 2, 100);

                    return (
                      <div key={series.symbol} className="flex items-center gap-3">
                        <span className="text-sm font-medium w-24" style={{ color: series.color }}>
                          {series.symbol}
                        </span>
                        <div className="flex-1 h-6 bg-muted/20 rounded-md overflow-hidden relative">
                          <div
                            className={`h-full rounded-md transition-all ${
                              performance >= 0 ? 'bg-green-500/30' : 'bg-red-500/30'
                            }`}
                            style={{
                              width: `${barWidth}%`,
                              marginLeft: performance < 0 ? 'auto' : undefined,
                            }}
                          />
                          <span
                            className={`absolute right-2 top-0.5 text-xs font-medium ${
                              performance >= 0 ? 'text-green-500' : 'text-red-500'
                            }`}
                          >
                            {performance >= 0 ? '+' : ''}
                            {safeNum(performance).toFixed(2)}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Metrics Comparison Table */}
          {metrics.length > 0 && !loading && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Key Metrics Comparison</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
                          Metric
                        </th>
                        {metrics.map((m) => (
                          <th
                            key={m.symbol}
                            className="text-right px-3 py-2 text-xs font-medium"
                            style={{ color: m.color }}
                          >
                            <Link href={`/stocks/${m.symbol}`} className="hover:underline">
                              {m.symbol}
                            </Link>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b">
                        <td className="px-3 py-2 text-muted-foreground">Price</td>
                        {metrics.map((m) => (
                          <td key={m.symbol} className="px-3 py-2 text-right font-medium">
                            {m.price ? `Rs. ${safeNum(m.price).toFixed(2)}` : '--'}
                          </td>
                        ))}
                      </tr>
                      <tr className="border-b">
                        <td className="px-3 py-2 text-muted-foreground">Change %</td>
                        {metrics.map((m) => (
                          <td
                            key={m.symbol}
                            className={`px-3 py-2 text-right font-medium ${
                              (m.change ?? 0) > 0 ? 'text-green-500' : (m.change ?? 0) < 0 ? 'text-red-500' : ''
                            }`}
                          >
                            {m.change != null ? `${safeNum(m.change) > 0 ? '+' : ''}${safeNum(m.change).toFixed(2)}%` : '--'}
                          </td>
                        ))}
                      </tr>
                      <tr className="border-b">
                        <td className="px-3 py-2 text-muted-foreground">Market Cap</td>
                        {metrics.map((m) => (
                          <td key={m.symbol} className="px-3 py-2 text-right">
                            {m.marketCap ? `Rs. ${(safeNum(m.marketCap) / 1e9).toFixed(2)}B` : '--'}
                          </td>
                        ))}
                      </tr>
                      <tr className="border-b">
                        <td className="px-3 py-2 text-muted-foreground">Sector</td>
                        {metrics.map((m) => (
                          <td key={m.symbol} className="px-3 py-2 text-right text-xs">
                            {m.sector}
                          </td>
                        ))}
                      </tr>
                      <tr className="border-b">
                        <td className="px-3 py-2 text-muted-foreground">Beta</td>
                        {metrics.map((m) => (
                          <td key={m.symbol} className="px-3 py-2 text-right">
                            {m.beta != null ? safeNum(m.beta).toFixed(2) : '--'}
                          </td>
                        ))}
                      </tr>
                      <tr className="border-b">
                        <td className="px-3 py-2 text-muted-foreground">Period High</td>
                        {metrics.map((m) => (
                          <td key={m.symbol} className="px-3 py-2 text-right">
                            {m.periodHigh ? `Rs. ${safeNum(m.periodHigh).toFixed(2)}` : '--'}
                          </td>
                        ))}
                      </tr>
                      <tr className="border-b">
                        <td className="px-3 py-2 text-muted-foreground">Period Low</td>
                        {metrics.map((m) => (
                          <td key={m.symbol} className="px-3 py-2 text-right">
                            {m.periodLow ? `Rs. ${safeNum(m.periodLow).toFixed(2)}` : '--'}
                          </td>
                        ))}
                      </tr>
                      <tr className="border-b">
                        <td className="px-3 py-2 text-muted-foreground">Avg Volume</td>
                        {metrics.map((m) => (
                          <td key={m.symbol} className="px-3 py-2 text-right">
                            {m.avgVolume ? safeNum(m.avgVolume).toLocaleString() : '--'}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-3 py-2 text-muted-foreground">Shariah</td>
                        {metrics.map((m) => (
                          <td key={m.symbol} className="px-3 py-2 text-right">
                            {m.shariah === 'compliant' && (
                              <Badge variant="outline" className="gap-1 border-green-600 text-green-600 text-[10px]">
                                <Shield className="h-2.5 w-2.5" /> OK
                              </Badge>
                            )}
                            {(m.shariah === 'non_compliant' || m.shariah === 'blacklisted') && (
                              <Badge variant="destructive" className="gap-1 text-[10px]">
                                <ShieldAlert className="h-2.5 w-2.5" /> No
                              </Badge>
                            )}
                            {m.shariah === 'pending_review' && (
                              <Badge variant="outline" className="gap-1 border-yellow-600 text-yellow-600 text-[10px]">
                                <ShieldQuestion className="h-2.5 w-2.5" /> ?
                              </Badge>
                            )}
                            {m.shariah === 'unknown' && (
                              <span className="text-xs text-muted-foreground">--</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {loading && (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">Loading comparison data...</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
