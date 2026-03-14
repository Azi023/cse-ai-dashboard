'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { stocksApi, marketApi, type SectorBreakdown, type SectorIndex } from '@/lib/api';
import { BarChart3, TrendingUp, TrendingDown, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';
import { useDisplayMode } from '@/contexts/display-mode-context';
import { safeNum } from '@/lib/format';

function formatMarketCap(mcap: number): string {
  const n = safeNum(mcap);
  if (n >= 1_000_000_000_000) return `Rs. ${(n / 1_000_000_000_000).toFixed(1)}T`;
  if (n >= 1_000_000_000) return `Rs. ${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `Rs. ${(n / 1_000_000).toFixed(1)}M`;
  return `Rs. ${n.toLocaleString()}`;
}

export default function SectorsPage() {
  const { isSimple } = useDisplayMode();
  const [sectors, setSectors] = useState<SectorBreakdown[]>([]);
  const [sectorIndices, setSectorIndices] = useState<SectorIndex[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSector, setExpandedSector] = useState<string | null>(null);

  useEffect(() => {
    Promise.allSettled([
      stocksApi.getSectorBreakdown(),
      marketApi.getSectors(),
    ]).then(([breakdownRes, indicesRes]) => {
      if (breakdownRes.status === 'fulfilled') setSectors(breakdownRes.value.data);
      if (indicesRes.status === 'fulfilled') setSectorIndices(indicesRes.value.data);
      setLoading(false);
    });
  }, []);

  // Build index lookup
  const indexMap = new Map<string, SectorIndex>();
  for (const idx of sectorIndices) {
    indexMap.set(idx.name, idx);
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          {isSimple ? 'Industry Groups' : 'Sector Analysis'}
        </h2>
        <p className="text-muted-foreground">
          {isSimple
            ? 'See which industries are doing well today'
            : 'Sector performance, constituent stocks & market cap breakdown'}
        </p>
      </div>

      {/* Sector Index Performance Cards (hidden in Simple mode) */}
      {!isSimple && sectorIndices.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">Sector Index Performance</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
              {[...sectorIndices]
                .sort((a, b) => b.percentage - a.percentage)
                .map((idx) => {
                  const pct = safeNum(idx.percentage);
                  return (
                    <div
                      key={idx.name}
                      className={`rounded-lg border p-3 transition-colors ${
                        pct > 0
                          ? 'border-green-500/20 bg-green-500/5'
                          : pct < 0
                            ? 'border-red-500/20 bg-red-500/5'
                            : ''
                      }`}
                    >
                      <div className="text-xs text-muted-foreground truncate">
                        {idx.name}
                      </div>
                      <div className="text-sm font-semibold mt-0.5">
                        {idx.indexValue != null ? safeNum(idx.indexValue).toFixed(2) : '\u2014'}
                      </div>
                      <div
                        className={`text-xs font-medium ${
                          pct > 0 ? 'text-green-500' : pct < 0 ? 'text-red-500' : 'text-muted-foreground'
                        }`}
                      >
                        {pct > 0 ? '+' : ''}{safeNum(pct).toFixed(2)}%
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sector Breakdown with Expandable Stocks */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 rounded-lg bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {sectors.map((sector) => {
            const isExpanded = expandedSector === sector.sector;
            const index = indexMap.get(sector.sector);

            return (
              <Card key={sector.sector}>
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/20 transition-colors"
                  onClick={() =>
                    setExpandedSector(isExpanded ? null : sector.sector)
                  }
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-sm">{sector.sector}</h3>
                        <Badge variant="secondary" className="text-[10px]">
                          {sector.stockCount} stocks
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Market Cap: {formatMarketCap(sector.totalMarketCap)}
                      </div>
                    </div>

                    <div className="text-right">
                      {index && (
                        <div className="text-sm font-medium">
                          {index.indexValue != null ? safeNum(index.indexValue).toFixed(2) : '\u2014'}
                        </div>
                      )}
                      <div
                        className={`flex items-center gap-1 text-xs font-medium ${
                          sector.avgChangePercent > 0
                            ? 'text-green-500'
                            : sector.avgChangePercent < 0
                              ? 'text-red-500'
                              : 'text-muted-foreground'
                        }`}
                      >
                        {sector.avgChangePercent > 0 ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : sector.avgChangePercent < 0 ? (
                          <TrendingDown className="h-3 w-3" />
                        ) : null}
                        {safeNum(sector.avgChangePercent) > 0 ? '+' : ''}
                        {safeNum(sector.avgChangePercent).toFixed(2)}%
                      </div>
                    </div>
                  </div>

                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground ml-3" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground ml-3" />
                  )}
                </div>

                {isExpanded && (
                  <CardContent className="pt-0 pb-4">
                    <div className="border-t pt-3">
                      <p className="text-xs text-muted-foreground mb-2">
                        Top stocks by market cap
                      </p>
                      <div className="space-y-1.5">
                        {sector.topStocks.map((stock) => (
                          <div
                            key={stock.symbol}
                            className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted/30 transition-colors"
                          >
                            <div>
                              <Link
                                href={`/stocks/${stock.symbol}`}
                                className="text-sm font-medium hover:underline text-primary"
                              >
                                {stock.symbol}
                              </Link>
                              <span className="text-xs text-muted-foreground ml-2">
                                {stock.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="text-sm font-medium">
                                Rs. {safeNum(stock.last_price).toFixed(2)}
                              </span>
                              <span
                                className={`text-xs font-medium ${
                                  stock.change_percent > 0
                                    ? 'text-green-500'
                                    : stock.change_percent < 0
                                      ? 'text-red-500'
                                      : 'text-muted-foreground'
                                }`}
                              >
                                {safeNum(stock.change_percent) > 0 ? '+' : ''}
                                {safeNum(stock.change_percent).toFixed(2)}%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2">
                        <Link
                          href={`/stocks?sector=${encodeURIComponent(sector.sector)}`}
                          className="text-xs text-primary hover:underline"
                        >
                          View all {sector.stockCount} stocks in {sector.sector}
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
