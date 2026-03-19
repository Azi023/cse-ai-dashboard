'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity } from 'lucide-react';
import { safeNum } from '@/lib/format';

interface MarketStatsCardProps {
  volume: number | null;
  turnover: number | null;
  trades: number | null;
  loading?: boolean;
}

function formatNumber(num: number | null): string {
  if (num === null) return '\u2014';
  const n = safeNum(num);
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toLocaleString();
}

export function MarketStatsCard({ volume, turnover, trades, loading }: MarketStatsCardProps) {
  if (loading) {
    return (
      <Card hover>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Market Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex justify-between items-center">
                <div className="h-3 w-20 skeleton-shimmer rounded" />
                <div className="h-5 w-16 skeleton-shimmer rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card hover>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-muted-foreground" />
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Market Activity</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between items-baseline">
          <span className="text-xs text-muted-foreground">Volume</span>
          <span className="text-sm font-semibold num">{formatNumber(volume)}</span>
        </div>
        <div className="flex justify-between items-baseline">
          <span className="text-xs text-muted-foreground">Turnover (LKR)</span>
          <span className="text-sm font-semibold num">{formatNumber(turnover)}</span>
        </div>
        <div className="flex justify-between items-baseline">
          <span className="text-xs text-muted-foreground">Trades</span>
          <span className="text-sm font-semibold num">{formatNumber(trades)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
