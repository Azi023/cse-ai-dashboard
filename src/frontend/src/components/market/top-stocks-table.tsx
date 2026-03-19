'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { safeNum, fmt2, fmt0 } from '@/lib/format';

interface TopStock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercentage: number;
  volume: number;
  turnover: number;
}

interface TopStocksTableProps {
  stocks: TopStock[];
  loading?: boolean;
  type: 'gainers' | 'losers' | 'active';
}

export function TopStocksTable({ stocks, loading, type }: TopStocksTableProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-8 w-full skeleton-shimmer rounded" />
        ))}
      </div>
    );
  }

  if (stocks.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">No data available</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-xs uppercase tracking-wider">Stock</TableHead>
          <TableHead className="text-right text-xs uppercase tracking-wider">Price</TableHead>
          <TableHead className="text-right text-xs uppercase tracking-wider">Change</TableHead>
          <TableHead className="text-right text-xs uppercase tracking-wider">
            {type === 'active' ? 'Volume' : 'Chg %'}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {stocks.slice(0, 12).map((stock) => {
          const isUp = safeNum(stock.change) > 0;
          const isDown = safeNum(stock.change) < 0;
          return (
            <TableRow key={stock.symbol} className="cursor-pointer hover:bg-accent/50 transition-colors">
              <TableCell className="py-2">
                <Link href={`/stocks/${stock.symbol}`} className="block">
                  <span className="font-medium text-sm hover:text-primary transition-colors">{stock.symbol}</span>
                  {stock.name && (
                    <span className="block text-[11px] text-muted-foreground truncate max-w-[180px]">
                      {stock.name}
                    </span>
                  )}
                </Link>
              </TableCell>
              <TableCell className="text-right text-sm num font-medium py-2">
                {fmt2(stock.price)}
              </TableCell>
              <TableCell className={cn(
                'text-right text-sm num font-medium py-2',
                isUp ? 'text-emerald-500' : isDown ? 'text-red-500' : 'text-muted-foreground'
              )}>
                {isUp ? '+' : ''}{fmt2(stock.change)}
              </TableCell>
              <TableCell className="text-right py-2">
                {type === 'active' ? (
                  <span className="text-sm num text-muted-foreground">{fmt0(stock.volume)}</span>
                ) : (
                  <span className={cn(
                    'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold num',
                    isUp
                      ? 'bg-emerald-500/10 text-emerald-500'
                      : isDown
                      ? 'bg-red-500/10 text-red-500'
                      : 'bg-muted text-muted-foreground'
                  )}>
                    {safeNum(stock.changePercentage) > 0 ? '+' : ''}{fmt2(stock.changePercentage)}%
                  </span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
