'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { globalApi, type GlobalIndicator } from '@/lib/api';
import {
  RefreshCw,
  Globe,
  TrendingUp,
  TrendingDown,
  Minus,
  Fuel,
  DollarSign,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * How each global indicator movement affects Sri Lankan stocks:
 * - oil_up_bad: Oil UP = RED (SL imports 100% oil, costs rise)
 * - gold_neutral: Gold UP = YELLOW (safe haven, mixed signal)
 * - lkr_weaken_bad: USD/LKR UP = RED (LKR weakening, bad for importers)
 * - sp500_correlation: S&P 500 DOWN = RED (global risk-off)
 * - tea_up_good: Tea UP = GREEN (SL's #1 export revenue)
 * - rubber_up_good: Rubber UP = GREEN (SL export revenue)
 */
type FavorabilityRule =
  | 'oil_up_bad'
  | 'gold_neutral'
  | 'lkr_weaken_bad'
  | 'sp500_correlation'
  | 'export_up_good';

interface IndicatorConfig {
  key: string;
  icon: 'oil' | 'gold' | 'fx' | 'index' | 'commodity';
  favorability: FavorabilityRule;
  prefix: string;
  decimals: number;
}

const INDICATOR_CONFIGS: IndicatorConfig[] = [
  {
    key: 'global_brent_crude',
    icon: 'oil',
    favorability: 'oil_up_bad',
    prefix: '$',
    decimals: 2,
  },
  {
    key: 'global_gold_xau',
    icon: 'gold',
    favorability: 'gold_neutral',
    prefix: '$',
    decimals: 0,
  },
  {
    key: 'global_usd_lkr',
    icon: 'fx',
    favorability: 'lkr_weaken_bad',
    prefix: '',
    decimals: 2,
  },
  {
    key: 'global_sp500',
    icon: 'index',
    favorability: 'sp500_correlation',
    prefix: '',
    decimals: 0,
  },
  {
    key: 'global_tea_avg',
    icon: 'commodity',
    favorability: 'export_up_good',
    prefix: 'Rs.',
    decimals: 0,
  },
  {
    key: 'global_rubber',
    icon: 'commodity',
    favorability: 'export_up_good',
    prefix: 'Rs.',
    decimals: 0,
  },
];

function getIcon(type: IndicatorConfig['icon']) {
  switch (type) {
    case 'oil':
      return <Fuel className="h-3.5 w-3.5" />;
    case 'gold':
      return <span className="text-[11px] font-bold leading-none">Au</span>;
    case 'fx':
      return <DollarSign className="h-3.5 w-3.5" />;
    case 'index':
      return <BarChart3 className="h-3.5 w-3.5" />;
    case 'commodity':
      return <span className="text-[11px] font-bold leading-none">C</span>;
  }
}

/**
 * Returns color class based on whether the change is favorable for SL stocks.
 */
function getChangeColor(
  favorability: FavorabilityRule,
  changePercent: number,
): string {
  if (changePercent === 0) return 'text-muted-foreground';

  const isUp = changePercent > 0;

  switch (favorability) {
    case 'oil_up_bad':
      // Oil up = bad for SL (importer)
      return isUp ? 'text-red-500' : 'text-green-500';
    case 'gold_neutral':
      // Gold is mixed signal
      return 'text-yellow-500';
    case 'lkr_weaken_bad':
      // USD/LKR up means LKR weakening = bad
      return isUp ? 'text-red-500' : 'text-green-500';
    case 'sp500_correlation':
      // S&P 500 down = global risk-off = bad
      return isUp ? 'text-green-500' : 'text-red-500';
    case 'export_up_good':
      // Tea/Rubber up = good for SL exports
      return isUp ? 'text-green-500' : 'text-red-500';
    default:
      return 'text-muted-foreground';
  }
}

function formatValue(prefix: string, value: number, decimals: number): string {
  const formatted = value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return prefix ? `${prefix}${formatted}` : formatted;
}

export function GlobalIndicatorsCard() {
  const [indicators, setIndicators] = useState<GlobalIndicator[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const fetchIndicators = async () => {
    try {
      const res = await globalApi.getIndicators();
      setIndicators(res.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await globalApi.refresh();
      const res = await globalApi.getIndicators();
      setIndicators(res.data);
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchIndicators();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Global Market Indicators
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2 rounded-lg border p-3">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-5 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error && indicators.length === 0) {
    return (
      <Card className="border-muted">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Global Market Indicators
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Global indicators unavailable. Click refresh to fetch data.
          </p>
          <button
            onClick={handleRefresh}
            className="mt-2 text-xs text-primary hover:underline"
          >
            Fetch now
          </button>
        </CardContent>
      </Card>
    );
  }

  // Build lookup map
  const indicatorMap = new Map<string, GlobalIndicator>();
  for (const ind of indicators) {
    indicatorMap.set(ind.indicator, ind);
  }

  // Only show configs that have data
  const activeConfigs = INDICATOR_CONFIGS.filter((c) => indicatorMap.has(c.key));

  if (activeConfigs.length === 0 && indicators.length === 0) {
    return null; // Don't render if no data at all
  }

  const latestDate = indicators.length > 0
    ? (() => {
        let latest = indicators[0].data_date;
        for (const ind of indicators) {
          if (ind.data_date > latest) latest = ind.data_date;
        }
        try {
          return new Date(latest + 'T00:00:00').toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          });
        } catch {
          return latest;
        }
      })()
    : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-blue-400" />
            <CardTitle className="text-sm font-medium">
              Global Market Indicators
            </CardTitle>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title="Refresh global market data"
          >
            <RefreshCw
              className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')}
            />
          </button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {activeConfigs.map((config) => {
            const data = indicatorMap.get(config.key)!;
            const changeColor = getChangeColor(config.favorability, data.changePercent);

            return (
              <div
                key={config.key}
                className="rounded-lg border p-3 transition-colors hover:bg-muted/30"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">
                      {getIcon(config.icon)}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {data.label}
                    </span>
                  </div>
                  <span className={cn('flex items-center', changeColor)}>
                    {data.changePercent > 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : data.changePercent < 0 ? (
                      <TrendingDown className="h-3 w-3" />
                    ) : (
                      <Minus className="h-3 w-3" />
                    )}
                  </span>
                </div>
                <div className="mt-1 text-sm font-semibold">
                  {formatValue(config.prefix, data.value, config.decimals)}
                </div>
                <div className={cn('text-xs', changeColor)}>
                  {data.changePercent > 0 ? '+' : ''}
                  {data.changePercent.toFixed(2)}%
                </div>
              </div>
            );
          })}

          {/* Show placeholder cards for indicators with no data */}
          {INDICATOR_CONFIGS.filter((c) => !indicatorMap.has(c.key)).map(
            (config) => (
              <div
                key={config.key}
                className="rounded-lg border border-dashed p-3 opacity-50"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">
                    {getIcon(config.icon)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {INDICATOR_CONFIGS.find((c) => c.key === config.key)?.key
                      .replace('global_', '')
                      .replace(/_/g, ' ')
                      .toUpperCase() ?? config.key}
                  </span>
                </div>
                <div className="mt-1 text-sm text-muted-foreground">--</div>
              </div>
            ),
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t pt-2">
          <span className="text-[10px] text-muted-foreground">
            Sources: Yahoo Finance, Exchange Rate API
          </span>
          {latestDate && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
              Updated {latestDate}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
