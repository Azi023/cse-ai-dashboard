'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { PriceChart } from '@/components/charts/price-chart';
import { stocksApi, type Stock, type StockPrice } from '@/lib/api';
import { ArrowLeft, Shield, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export default function StockDetailPage() {
  const params = useParams();
  const symbol = params.symbol as string;
  const [stock, setStock] = useState<Stock | null>(null);
  const [prices, setPrices] = useState<StockPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [stockRes, pricesRes] = await Promise.allSettled([
          stocksApi.getOne(symbol),
          stocksApi.getPrices(symbol, 90),
        ]);

        if (stockRes.status === 'fulfilled') setStock(stockRes.value.data);
        if (pricesRes.status === 'fulfilled') setPrices(pricesRes.value.data);
      } catch (err) {
        setError('Failed to load stock data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [symbol]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-[400px] w-full animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (error || !stock) {
    return (
      <div className="space-y-4">
        <Link href="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </Link>
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <p className="text-destructive">{error || 'Stock not found'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isPositive = (stock.change_percent ?? 0) > 0;

  return (
    <div className="space-y-6">
      <Link href="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Dashboard
      </Link>

      {/* Stock Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">{stock.symbol}</h2>
            {stock.shariah_status === 'compliant' && (
              <Badge variant="outline" className="gap-1 border-green-600 text-green-600">
                <Shield className="h-3 w-3" /> Shariah Compliant
              </Badge>
            )}
            {stock.shariah_status === 'blacklisted' && (
              <Badge variant="destructive" className="gap-1">
                <ShieldAlert className="h-3 w-3" /> Non-Compliant
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">{stock.name}</p>
          {stock.sector && (
            <Badge variant="secondary" className="mt-1">{stock.sector}</Badge>
          )}
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold">
            LKR {stock.last_price?.toFixed(2) ?? '\u2014'}
          </div>
          <div className={cn(
            'text-lg',
            isPositive ? 'text-green-600' : 'text-red-600'
          )}>
            {isPositive ? '+' : ''}{stock.change_percent?.toFixed(2) ?? '0.00'}%
          </div>
        </div>
      </div>

      <Separator />

      {/* Price Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Price Chart (90 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          {prices.length > 0 ? (
            <PriceChart data={prices} />
          ) : (
            <p className="py-8 text-center text-muted-foreground">No price data available</p>
          )}
        </CardContent>
      </Card>

      {/* Stock Info Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Stock Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Sector</span>
              <span>{stock.sector ?? '\u2014'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Market Cap</span>
              <span>
                {stock.market_cap
                  ? `LKR ${(Number(stock.market_cap) / 1_000_000_000).toFixed(2)}B`
                  : '\u2014'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Beta</span>
              <span>{stock.beta ?? '\u2014'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Status</span>
              <span>{stock.is_active ? 'Active' : 'Inactive'}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
