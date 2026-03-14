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
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-8 w-24 animate-pulse rounded bg-muted" />
          <div className="mt-1 h-4 w-16 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  const isPositive = safeNum(change) > 0;
  const isNeutral = safeNum(change) === 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {value != null ? safeNum(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '\u2014'}
        </div>
        <div className={cn(
          'flex items-center gap-1 text-sm',
          isPositive ? 'text-green-600' : isNeutral ? 'text-muted-foreground' : 'text-red-600'
        )}>
          {isPositive ? <TrendingUp className="h-3 w-3" /> : isNeutral ? <Minus className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          <span>{isPositive ? '+' : ''}{fmt2(change)}</span>
          <span>({isPositive ? '+' : ''}{fmt2(changePercent)}%)</span>
        </div>
      </CardContent>
    </Card>
  );
}
