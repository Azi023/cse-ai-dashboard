'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';

interface MarketStatsCardProps {
  volume: number | null;
  turnover: number | null;
  trades: number | null;
  loading?: boolean;
}

function formatNumber(num: number | null): string {
  if (num === null) return '\u2014';
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
  return num.toLocaleString();
}

export function MarketStatsCard({ volume, turnover, trades, loading }: MarketStatsCardProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Market Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-4 w-full animate-pulse rounded bg-muted" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium text-muted-foreground">Market Activity</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between">
          <span className="text-sm text-muted-foreground">Volume</span>
          <span className="text-sm font-medium">{formatNumber(volume)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-muted-foreground">Turnover (LKR)</span>
          <span className="text-sm font-medium">{formatNumber(turnover)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-muted-foreground">Trades</span>
          <span className="text-sm font-medium">{formatNumber(trades)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
