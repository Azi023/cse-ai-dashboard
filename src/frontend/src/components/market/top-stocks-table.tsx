'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import Link from 'next/link';

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
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 w-full animate-pulse rounded bg-muted" />
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
          <TableHead>Symbol</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right">Change</TableHead>
          <TableHead className="text-right">
            {type === 'active' ? 'Volume' : 'Change %'}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {stocks.slice(0, 10).map((stock) => (
          <TableRow key={stock.symbol}>
            <TableCell>
              <Link href={`/stocks/${stock.symbol}`} className="font-medium hover:underline">
                {stock.symbol}
              </Link>
            </TableCell>
            <TableCell className="text-right">
              {stock.price.toFixed(2)}
            </TableCell>
            <TableCell className={cn(
              'text-right',
              stock.change > 0 ? 'text-green-600' : stock.change < 0 ? 'text-red-600' : ''
            )}>
              {stock.change > 0 ? '+' : ''}{stock.change.toFixed(2)}
            </TableCell>
            <TableCell className="text-right">
              {type === 'active'
                ? stock.volume.toLocaleString()
                : (
                  <Badge variant={stock.changePercentage > 0 ? 'default' : 'destructive'} className="ml-auto">
                    {stock.changePercentage > 0 ? '+' : ''}{stock.changePercentage.toFixed(2)}%
                  </Badge>
                )
              }
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
