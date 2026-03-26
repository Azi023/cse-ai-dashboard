'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { stocksApi, shariahApi, analysisApi, type Stock, type StockScoreData } from '@/lib/api';
import { Search, BarChart3, ShieldCheck } from 'lucide-react';
import { useDisplayMode } from '@/contexts/display-mode-context';
import { getSimpleLabel } from '@/lib/simple-mode-constants';

export default function StocksPage() {
  const { isSimple } = useDisplayMode();
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState('');
  const [shariahFilter, setShariahFilter] = useState(false);
  const [shariahOverview, setShariahOverview] = useState<{ screened: number; total: number; lastUpdated: string } | null>(null);
  const [scoreMap, setScoreMap] = useState<Map<string, StockScoreData>>(new Map());

  useEffect(() => {
    stocksApi
      .getAll()
      .then((res) => setStocks(res.data))
      .catch((err) => {
        setError('Failed to load stocks');
        console.error(err);
      })
      .finally(() => setLoading(false));

    // Fetch Shariah overview for header status
    shariahApi.getOverview().then((res) => setShariahOverview(res.data)).catch(() => {});

    // Fetch stock scores (all compliant stocks)
    analysisApi.getScores(200).then((res) => {
      const map = new Map<string, StockScoreData>();
      for (const s of res.data) map.set(s.symbol, s);
      setScoreMap(map);
    }).catch(() => {});
  }, []);

  const sectors = useMemo(() => {
    const set = new Set<string>();
    stocks.forEach((s) => {
      if (s.sector) set.add(s.sector);
    });
    return Array.from(set).sort();
  }, [stocks]);

  const filtered = useMemo(() => {
    return stocks.filter((s) => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !s.symbol.toLowerCase().includes(q) &&
          !s.name.toLowerCase().includes(q)
        )
          return false;
      }
      if (sectorFilter && s.sector !== sectorFilter) return false;
      if (shariahFilter && s.shariah_status === 'non_compliant') return false;
      return true;
    });
  }, [stocks, search, sectorFilter, shariahFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            {isSimple ? 'Browse Companies' : 'All Stocks'}
          </h2>
          <p className="text-muted-foreground">
            {isSimple
              ? `${stocks.length} companies listed on the Colombo Stock Exchange`
              : `Browse all CSE-listed securities (${stocks.length} total)`}
          </p>
        </div>
        {shariahOverview && (
          <div className="flex items-center gap-1.5 rounded-lg border border-green-600/20 bg-green-500/5 px-3 py-1.5 text-xs">
            <ShieldCheck className="h-3.5 w-3.5 text-green-500" />
            <span className="text-muted-foreground">
              Shariah data last updated: {shariahOverview.lastUpdated} &middot; {shariahOverview.screened}/{shariahOverview.total} stocks screened
            </span>
          </div>
        )}
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <p className="text-sm text-destructive">{error}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Make sure the backend server is running on port 4101
            </p>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by symbol or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={sectorFilter}
          onChange={(e) => setSectorFilter(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="">All Sectors</option>
          {sectors.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          onClick={() => setShariahFilter(!shariahFilter)}
          className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
            shariahFilter
              ? 'border-green-500 bg-green-500/10 text-green-500'
              : 'border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/50'
          }`}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          {shariahFilter ? 'Shariah ON' : 'Shariah Filter'}
        </button>
      </div>

      {/* Stocks Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <CardTitle className="text-base">
              {filtered.length} stock{filtered.length !== 1 ? 's' : ''}
              {search || sectorFilter || shariahFilter ? ' (filtered)' : ''}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {stocks.length === 0
                ? 'No stocks found. The backend may still be syncing data from CSE.'
                : 'No stocks match your filters.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Sector</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Change %</TableHead>
                    <TableHead>Shariah</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((stock) => (
                    <TableRow key={stock.symbol}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/stocks/${stock.symbol}`}
                          className="text-primary hover:underline"
                        >
                          {stock.symbol}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[250px] truncate">
                        {stock.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {stock.sector ?? '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {stock.last_price != null
                          ? Number(stock.last_price).toFixed(2)
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {stock.change_percent != null ? (
                          <span
                            className={
                              Number(stock.change_percent) > 0
                                ? 'text-green-500'
                                : Number(stock.change_percent) < 0
                                  ? 'text-red-500'
                                  : ''
                            }
                          >
                            {Number(stock.change_percent) > 0 ? '+' : ''}
                            {Number(stock.change_percent).toFixed(2)}%
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        <ShariahBadge status={stock.shariah_status} simple={isSimple} />
                      </TableCell>
                      <TableCell className="text-right">
                        <ScoreBadge score={scoreMap.get(stock.symbol)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ScoreBadge({ score }: { score: StockScoreData | undefined }) {
  if (!score) return <span className="text-muted-foreground text-xs">—</span>;
  const val = Number(score.composite_score);
  if (score.is_placeholder) {
    return (
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-mono border border-muted-foreground/20 text-muted-foreground">
        ~{val.toFixed(0)}
      </span>
    );
  }
  const colorClass =
    val >= 70 ? 'border-green-500/40 bg-green-500/10 text-green-400' :
    val >= 40 ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-400' :
    'border-red-500/40 bg-red-500/10 text-red-400';
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-mono border ${colorClass}`}>
      {val.toFixed(0)}
    </span>
  );
}

function ShariahBadge({ status, simple }: { status: string; simple?: boolean }) {
  switch (status) {
    case 'compliant':
      return (
        <Badge variant="outline" className="border-green-500 text-green-500 text-xs">
          {simple ? '✅ Halal' : 'Compliant'}
        </Badge>
      );
    case 'non_compliant':
      return (
        <Badge variant="outline" className="border-red-500 text-red-500 text-xs">
          {simple ? '❌ Not Halal' : 'Non-Compliant'}
        </Badge>
      );
    case 'pending_review':
      return (
        <Badge variant="outline" className="border-yellow-500 text-yellow-500 text-xs">
          {simple ? '⏳ Checking' : 'Pending'}
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-xs">
          Unknown
        </Badge>
      );
  }
}
