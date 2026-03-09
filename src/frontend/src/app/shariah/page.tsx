'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import {
  shariahApi,
  type Stock,
  type NonCompliantStock,
  type ShariahStats,
} from '@/lib/api';
import { ShieldCheck, ShieldX, ShieldAlert, Shield } from 'lucide-react';

export default function ShariahPage() {
  const [stats, setStats] = useState<ShariahStats | null>(null);
  const [compliant, setCompliant] = useState<Stock[]>([]);
  const [nonCompliant, setNonCompliant] = useState<NonCompliantStock[]>([]);
  const [pending, setPending] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [statsRes, compliantRes, nonCompliantRes, pendingRes] =
          await Promise.allSettled([
            shariahApi.getStats(),
            shariahApi.getCompliant(),
            shariahApi.getNonCompliant(),
            shariahApi.getPending(),
          ]);

        if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
        if (compliantRes.status === 'fulfilled')
          setCompliant(compliantRes.value.data);
        if (nonCompliantRes.status === 'fulfilled')
          setNonCompliant(nonCompliantRes.value.data);
        if (pendingRes.status === 'fulfilled')
          setPending(pendingRes.value.data);
      } catch (err) {
        setError('Failed to load Shariah screening data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Shariah Screener</h2>
        <p className="text-muted-foreground">
          SEC Sri Lanka standardized Shariah compliance screening
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

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatsCard
          title="Compliant"
          value={stats?.compliant ?? null}
          icon={<ShieldCheck className="h-4 w-4 text-green-500" />}
          loading={loading}
          className="border-green-500/20"
        />
        <StatsCard
          title="Non-Compliant"
          value={stats?.non_compliant ?? null}
          icon={<ShieldX className="h-4 w-4 text-red-500" />}
          loading={loading}
          className="border-red-500/20"
        />
        <StatsCard
          title="Pending Review"
          value={stats?.pending_review ?? null}
          icon={<ShieldAlert className="h-4 w-4 text-yellow-500" />}
          loading={loading}
          className="border-yellow-500/20"
        />
        <StatsCard
          title="Total Screened"
          value={stats?.total ?? null}
          icon={<Shield className="h-4 w-4 text-muted-foreground" />}
          loading={loading}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="compliant" className="space-y-4">
        <TabsList>
          <TabsTrigger value="compliant" className="gap-1">
            <ShieldCheck className="h-3 w-3" /> Compliant
            {stats && (
              <span className="ml-1 text-xs text-muted-foreground">
                ({stats.compliant})
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="non-compliant" className="gap-1">
            <ShieldX className="h-3 w-3" /> Non-Compliant
            {stats && (
              <span className="ml-1 text-xs text-muted-foreground">
                ({stats.non_compliant})
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="pending" className="gap-1">
            <ShieldAlert className="h-3 w-3" /> Pending
            {stats && (
              <span className="ml-1 text-xs text-muted-foreground">
                ({stats.pending_review})
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="compliant">
          <Card>
            <CardContent className="pt-4">
              <StockTable
                stocks={compliant}
                loading={loading}
                statusBadge={
                  <Badge variant="outline" className="border-green-500 text-green-500">
                    Compliant
                  </Badge>
                }
                emptyMessage="No compliant stocks found. Financial data may be pending for Tier 2 screening."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="non-compliant">
          <Card>
            <CardContent className="pt-4">
              <NonCompliantTable stocks={nonCompliant} loading={loading} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending">
          <Card>
            <CardContent className="pt-4">
              <StockTable
                stocks={pending}
                loading={loading}
                statusBadge={
                  <Badge variant="outline" className="border-yellow-500 text-yellow-500">
                    Pending
                  </Badge>
                }
                emptyMessage="No stocks pending review."
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatsCard({
  title,
  value,
  icon,
  loading,
  className,
}: {
  title: string;
  value: number | null;
  icon: React.ReactNode;
  loading: boolean;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <div className="text-2xl font-bold">{value ?? 0}</div>
        )}
      </CardContent>
    </Card>
  );
}

function StockTable({
  stocks,
  loading,
  statusBadge,
  emptyMessage,
}: {
  stocks: Stock[];
  loading: boolean;
  statusBadge: React.ReactNode;
  emptyMessage: string;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (stocks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        {emptyMessage}
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Symbol</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Sector</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right">Change %</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {stocks.map((stock) => (
          <TableRow key={stock.symbol}>
            <TableCell className="font-medium">
              <Link
                href={`/stocks/${stock.symbol}`}
                className="text-primary hover:underline"
              >
                {stock.symbol}
              </Link>
            </TableCell>
            <TableCell className="max-w-[200px] truncate">{stock.name}</TableCell>
            <TableCell className="text-muted-foreground">
              {stock.sector ?? '—'}
            </TableCell>
            <TableCell className="text-right">
              {stock.last_price != null ? stock.last_price.toFixed(2) : '—'}
            </TableCell>
            <TableCell className="text-right">
              {stock.change_percent != null ? (
                <span
                  className={
                    stock.change_percent > 0
                      ? 'text-green-500'
                      : stock.change_percent < 0
                        ? 'text-red-500'
                        : ''
                  }
                >
                  {stock.change_percent > 0 ? '+' : ''}
                  {stock.change_percent.toFixed(2)}%
                </span>
              ) : (
                '—'
              )}
            </TableCell>
            <TableCell>{statusBadge}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function NonCompliantTable({
  stocks,
  loading,
}: {
  stocks: NonCompliantStock[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (stocks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No non-compliant stocks found.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Symbol</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Sector</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right">Change %</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {stocks.map((stock) => (
          <TableRow key={stock.symbol}>
            <TableCell className="font-medium">
              <Link
                href={`/stocks/${stock.symbol}`}
                className="text-primary hover:underline"
              >
                {stock.symbol}
              </Link>
            </TableCell>
            <TableCell className="max-w-[200px] truncate">{stock.name}</TableCell>
            <TableCell className="text-muted-foreground">
              {stock.sector ?? '—'}
            </TableCell>
            <TableCell className="text-right">
              {stock.last_price != null ? stock.last_price.toFixed(2) : '—'}
            </TableCell>
            <TableCell className="text-right">
              {stock.change_percent != null ? (
                <span
                  className={
                    stock.change_percent > 0
                      ? 'text-green-500'
                      : stock.change_percent < 0
                        ? 'text-red-500'
                        : ''
                  }
                >
                  {stock.change_percent > 0 ? '+' : ''}
                  {stock.change_percent.toFixed(2)}%
                </span>
              ) : (
                '—'
              )}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {stock.blacklist_reason ?? 'Failed financial screening'}
            </TableCell>
            <TableCell>
              <Badge variant="outline" className="border-red-500 text-red-500">
                Non-Compliant
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
