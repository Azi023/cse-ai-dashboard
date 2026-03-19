'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { safeNum, fmt2 } from '@/lib/format';

interface IndexCardProps {
  title: string;
  value: number | null;
  change: number | null;
  changePercent: number | null;
  loading?: boolean;
}

export function IndexCard({ title, value, change, changePercent, loading }: IndexCardProps) {
  if (loading) {
    return (
      <Card hover>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-9 w-32 skeleton-shimmer rounded mb-1.5" />
          <div className="h-4 w-20 skeleton-shimmer rounded" />
        </CardContent>
      </Card>
    );
  }

  const isPositive = safeNum(change) > 0;
  const isNeutral = safeNum(change) === 0;

  return (
    <Card hover>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold num">
          {value != null ? safeNum(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '\u2014'}
        </div>
        <div className={cn(
          'flex items-center gap-1 text-sm mt-1 num font-medium',
          isPositive ? 'text-emerald-500' : isNeutral ? 'text-muted-foreground' : 'text-red-500'
        )}>
          {isPositive ? <TrendingUp className="h-3.5 w-3.5" /> : isNeutral ? <Minus className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          <span>{isPositive ? '+' : ''}{fmt2(change)}</span>
          <span className="text-xs opacity-80">({isPositive ? '+' : ''}{fmt2(changePercent)}%)</span>
        </div>
      </CardContent>
    </Card>
  );
}
