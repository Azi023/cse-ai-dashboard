'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { macroApi, type MacroIndicator } from '@/lib/api';
import { RefreshCw, Landmark, DollarSign, TrendingDown, TrendingUp, Percent } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Configuration for each indicator we want to display */
interface IndicatorDisplayConfig {
  key: string;
  shortLabel: string;
  unit: '%' | 'LKR' | '';
  /** Number of decimal places */
  decimals: number;
  /**
   * How to determine if the value is "favorable" for stocks:
   * - 'lower_is_better': rate cuts, low inflation = green
   * - 'higher_is_better': e.g., money supply growth = green
   * - 'neutral': no coloring (like exchange rate)
   */
  favorability: 'lower_is_better' | 'higher_is_better' | 'neutral';
  /** Threshold: values below this are "green" for lower_is_better, above for higher_is_better */
  greenThreshold?: number;
  icon: 'rate' | 'fx' | 'inflation' | 'tbill';
}

const DISPLAY_CONFIG: IndicatorDisplayConfig[] = [
  {
    key: 'sdfr',
    shortLabel: 'SDFR',
    unit: '%',
    decimals: 2,
    favorability: 'lower_is_better',
    greenThreshold: 9.0,
    icon: 'rate',
  },
  {
    key: 'slfr',
    shortLabel: 'SLFR',
    unit: '%',
    decimals: 2,
    favorability: 'lower_is_better',
    greenThreshold: 10.0,
    icon: 'rate',
  },
  {
    key: 'awplr',
    shortLabel: 'AWPLR',
    unit: '%',
    decimals: 2,
    favorability: 'lower_is_better',
    greenThreshold: 12.0,
    icon: 'rate',
  },
  {
    key: 'tbill_91d',
    shortLabel: 'T-Bill 91d',
    unit: '%',
    decimals: 2,
    favorability: 'lower_is_better',
    greenThreshold: 10.0,
    icon: 'tbill',
  },
  {
    key: 'usd_lkr',
    shortLabel: 'USD/LKR',
    unit: 'LKR',
    decimals: 2,
    favorability: 'neutral',
    icon: 'fx',
  },
  {
    key: 'inflation_ccpi_yoy',
    shortLabel: 'Inflation (CCPI)',
    unit: '%',
    decimals: 1,
    favorability: 'lower_is_better',
    greenThreshold: 7.0,
    icon: 'inflation',
  },
];

function getIconForType(type: IndicatorDisplayConfig['icon']) {
  switch (type) {
    case 'rate':
      return <Percent className="h-3.5 w-3.5" />;
    case 'fx':
      return <DollarSign className="h-3.5 w-3.5" />;
    case 'inflation':
      return <TrendingUp className="h-3.5 w-3.5" />;
    case 'tbill':
      return <Landmark className="h-3.5 w-3.5" />;
  }
}

function getValueColor(config: IndicatorDisplayConfig, value: number): string {
  if (config.favorability === 'neutral') {
    return 'text-foreground';
  }

  if (config.greenThreshold === undefined) {
    return 'text-foreground';
  }

  if (config.favorability === 'lower_is_better') {
    return value <= config.greenThreshold ? 'text-green-500' : 'text-red-500';
  }

  // higher_is_better
  return value >= config.greenThreshold ? 'text-green-500' : 'text-red-500';
}

function formatValue(config: IndicatorDisplayConfig, value: number): string {
  const formatted = value.toLocaleString('en-US', {
    minimumFractionDigits: config.decimals,
    maximumFractionDigits: config.decimals,
  });

  if (config.unit === '%') return `${formatted}%`;
  if (config.unit === 'LKR') return `Rs. ${formatted}`;
  return formatted;
}

function getLatestDate(indicators: MacroIndicator[]): string | null {
  if (indicators.length === 0) return null;

  // Find the most recent data_date across all indicators
  let latest = indicators[0].data_date;
  for (const ind of indicators) {
    if (ind.data_date > latest) {
      latest = ind.data_date;
    }
  }

  // Format nicely
  try {
    const date = new Date(latest + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return latest;
  }
}

export function MacroIndicatorsCard() {
  const [indicators, setIndicators] = useState<MacroIndicator[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const fetchIndicators = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(false);

    try {
      const res = await macroApi.getIndicators();
      setIndicators(res.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await macroApi.refresh();
      // Re-fetch after refresh completes
      const res = await macroApi.getIndicators();
      setIndicators(res.data);
    } catch {
      // Still try to fetch even if refresh fails
      try {
        const res = await macroApi.getIndicators();
        setIndicators(res.data);
      } catch {
        setError(true);
      }
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchIndicators();
  }, []);

  // Loading skeleton
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Sri Lanka Economic Indicators
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
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

  // Error state
  if (error && indicators.length === 0) {
    return (
      <Card className="border-muted">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Sri Lanka Economic Indicators
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Economic indicators unavailable. Run the ingestion script or click refresh.
          </p>
          <button
            onClick={() => fetchIndicators()}
            className="mt-2 text-xs text-primary hover:underline"
          >
            Retry
          </button>
        </CardContent>
      </Card>
    );
  }

  // Build a lookup map from the indicators array
  const indicatorMap = new Map<string, MacroIndicator>();
  for (const ind of indicators) {
    indicatorMap.set(ind.indicator, ind);
  }

  const latestDate = getLatestDate(indicators);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">
              Sri Lanka Economic Indicators
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              title="Refresh macro data from CBSL"
            >
              <RefreshCw
                className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')}
              />
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {DISPLAY_CONFIG.map((config) => {
            const data = indicatorMap.get(config.key);

            if (!data) {
              return (
                <div
                  key={config.key}
                  className="rounded-lg border border-dashed p-3 opacity-50"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">
                      {getIconForType(config.icon)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {config.shortLabel}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">--</div>
                </div>
              );
            }

            const valueColor = getValueColor(config, data.value);
            const isFavorable =
              config.favorability === 'lower_is_better' &&
              config.greenThreshold !== undefined &&
              data.value <= config.greenThreshold;

            return (
              <div
                key={config.key}
                className="rounded-lg border p-3 transition-colors hover:bg-muted/30"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">
                      {getIconForType(config.icon)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {config.shortLabel}
                    </span>
                  </div>
                  {config.favorability !== 'neutral' && (
                    <span className={cn('flex items-center', valueColor)}>
                      {isFavorable ? (
                        <TrendingDown className="h-3 w-3" />
                      ) : (
                        <TrendingUp className="h-3 w-3" />
                      )}
                    </span>
                  )}
                </div>
                <div className={cn('mt-1 text-sm font-semibold', valueColor)}>
                  {formatValue(config, data.value)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer with source and date */}
        <div className="flex items-center justify-between border-t pt-2">
          <span className="text-[10px] text-muted-foreground">
            Source: Central Bank of Sri Lanka
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
