import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { Cron, CronExpression } from '@nestjs/schedule';
import { firstValueFrom } from 'rxjs';
import { MacroData } from '../../entities';
import { RedisService } from '../cse-data/redis.service';

/** Global indicator keys stored in macro_data with source='GLOBAL' */
export const GLOBAL_INDICATORS = {
  BRENT_CRUDE: 'global_brent_crude',
  GOLD_XAU: 'global_gold_xau',
  USD_LKR: 'global_usd_lkr',
  SP500: 'global_sp500',
  TEA_AVG: 'global_tea_avg',
  RUBBER: 'global_rubber',
} as const;

export const GLOBAL_INDICATOR_LABELS: Record<string, string> = {
  [GLOBAL_INDICATORS.BRENT_CRUDE]: 'Brent Crude Oil',
  [GLOBAL_INDICATORS.GOLD_XAU]: 'Gold (XAU/USD)',
  [GLOBAL_INDICATORS.USD_LKR]: 'USD/LKR',
  [GLOBAL_INDICATORS.SP500]: 'S&P 500',
  [GLOBAL_INDICATORS.TEA_AVG]: 'Tea (Avg Auction)',
  [GLOBAL_INDICATORS.RUBBER]: 'Rubber',
};

export interface GlobalIndicatorResult {
  indicator: string;
  label: string;
  value: number;
  change: number;
  changePercent: number;
  data_date: string;
  source: string;
  currency: string;
}

const REDIS_KEY = 'global_indicators';
const REDIS_TTL = 3600; // 1 hour

@Injectable()
export class GlobalDataService {
  private readonly logger = new Logger(GlobalDataService.name);

  constructor(
    private readonly httpService: HttpService,
    @InjectRepository(MacroData)
    private readonly macroDataRepository: Repository<MacroData>,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Fetch data from all global sources and store in DB.
   * Runs weekdays at 8:00 AM SLT (2:30 AM UTC) and 6:00 PM SLT (12:30 PM UTC).
   * Comma-separated hours: 2 and 12 UTC.
   */
  @Cron('0 30 2,12 * * 1-5', { name: 'global-data-fetch' })
  async fetchAllGlobalData(): Promise<{ message: string; errors: string[] }> {
    this.logger.log('Fetching global market data...');
    const errors: string[] = [];

    const fetchers = [
      { name: 'USD/LKR', fn: () => this.fetchUsdLkr() },
      { name: 'Oil', fn: () => this.fetchOilPrice() },
      { name: 'Gold', fn: () => this.fetchGoldPrice() },
      { name: 'S&P 500', fn: () => this.fetchSP500() },
    ];

    for (const { name, fn } of fetchers) {
      try {
        await fn();
      } catch (error) {
        const msg = `${name}: ${String(error)}`;
        this.logger.error(msg);
        errors.push(msg);
      }
    }

    // Clear Redis cache so next read gets fresh data
    await this.redisService.del(REDIS_KEY);

    return {
      message:
        errors.length === 0
          ? 'All global data fetched successfully'
          : `Fetched with ${errors.length} error(s)`,
      errors,
    };
  }

  // ─── USD/LKR ───────────────────────────────────────────────

  private async fetchUsdLkr(): Promise<void> {
    const response = await firstValueFrom(
      this.httpService.get<{ rates: Record<string, number> }>(
        'https://open.er-api.com/v6/latest/USD',
        { timeout: 15000 },
      ),
    );

    const rate = response.data?.rates?.LKR;
    if (!rate || typeof rate !== 'number') {
      throw new Error('LKR rate not found in response');
    }

    const today = new Date().toISOString().split('T')[0];
    await this.upsertGlobalData(
      GLOBAL_INDICATORS.USD_LKR,
      today,
      rate,
      'er-api.com',
    );
    this.logger.log(`USD/LKR: ${rate}`);
  }

  // ─── Yahoo Finance helper ──────────────────────────────────

  private async fetchYahooChart(
    symbol: string,
  ): Promise<{ price: number; prevClose: number } | null> {
    const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];

    for (const host of hosts) {
      try {
        const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
        const response = await firstValueFrom(
          this.httpService.get(url, {
            timeout: 15000,
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              Accept: 'application/json',
            },
          }),
        );

        const result = response.data?.chart?.result?.[0];
        if (!result) continue;

        const meta = result.meta;
        const price = meta?.regularMarketPrice;
        const prevClose =
          meta?.chartPreviousClose ?? meta?.previousClose ?? price;

        if (typeof price !== 'number') continue;
        return {
          price,
          prevClose: typeof prevClose === 'number' ? prevClose : price,
        };
      } catch (error) {
        this.logger.warn(
          `Yahoo Finance (${host}) failed for ${symbol}: ${String(error)}`,
        );
      }
    }

    return null;
  }

  // ─── Oil (Brent Crude) ─────────────────────────────────────

  private async fetchOilPrice(): Promise<void> {
    const data = await this.fetchYahooChart('BZ=F');
    if (!data) throw new Error('Could not fetch Brent Crude price');

    const today = new Date().toISOString().split('T')[0];
    await this.upsertGlobalData(
      GLOBAL_INDICATORS.BRENT_CRUDE,
      today,
      data.price,
      'yahoo',
    );
    this.logger.log(`Brent Crude: $${data.price}`);
  }

  // ─── Gold (XAU/USD) ────────────────────────────────────────

  private async fetchGoldPrice(): Promise<void> {
    const data = await this.fetchYahooChart('GC=F');
    if (!data) throw new Error('Could not fetch Gold price');

    const today = new Date().toISOString().split('T')[0];
    await this.upsertGlobalData(
      GLOBAL_INDICATORS.GOLD_XAU,
      today,
      data.price,
      'yahoo',
    );
    this.logger.log(`Gold: $${data.price}`);
  }

  // ─── S&P 500 ───────────────────────────────────────────────

  private async fetchSP500(): Promise<void> {
    const data = await this.fetchYahooChart('^GSPC');
    if (!data) throw new Error('Could not fetch S&P 500');

    const today = new Date().toISOString().split('T')[0];
    await this.upsertGlobalData(
      GLOBAL_INDICATORS.SP500,
      today,
      data.price,
      'yahoo',
    );
    this.logger.log(`S&P 500: ${data.price}`);
  }

  // ─── Data access ───────────────────────────────────────────

  /**
   * Get all global indicators with change data for dashboard display.
   * Uses Redis cache, falls back to DB.
   */
  async getGlobalIndicators(): Promise<GlobalIndicatorResult[]> {
    // Check Redis cache first
    const cached =
      await this.redisService.getJson<GlobalIndicatorResult[]>(REDIS_KEY);
    if (cached) return cached;

    const indicators = Object.values(GLOBAL_INDICATORS);
    const results: GlobalIndicatorResult[] = [];

    for (const indicator of indicators) {
      // Get the two most recent values to calculate change
      const rows = await this.macroDataRepository
        .createQueryBuilder('md')
        .where('md.indicator = :indicator', { indicator })
        .orderBy('md.data_date', 'DESC')
        .limit(2)
        .getMany();

      if (rows.length === 0) continue;

      const latest = rows[0];
      const prev = rows.length > 1 ? rows[1] : null;

      const value =
        typeof latest.value === 'string'
          ? parseFloat(latest.value)
          : Number(latest.value);
      const prevValue = prev
        ? typeof prev.value === 'string'
          ? parseFloat(prev.value)
          : Number(prev.value)
        : value;

      const change = value - prevValue;
      const changePercent = prevValue !== 0 ? (change / prevValue) * 100 : 0;

      const currency =
        indicator === GLOBAL_INDICATORS.USD_LKR
          ? 'LKR'
          : indicator === GLOBAL_INDICATORS.TEA_AVG
            ? 'LKR/kg'
            : indicator === GLOBAL_INDICATORS.RUBBER
              ? 'LKR/kg'
              : 'USD';

      results.push({
        indicator,
        label: GLOBAL_INDICATOR_LABELS[indicator] ?? indicator,
        value,
        change: Math.round(change * 100) / 100,
        changePercent: Math.round(changePercent * 100) / 100,
        data_date:
          latest.data_date instanceof Date
            ? latest.data_date.toISOString().split('T')[0]
            : String(latest.data_date),
        source: latest.source ?? 'unknown',
        currency,
      });
    }

    // Cache result
    if (results.length > 0) {
      await this.redisService.setJson(REDIS_KEY, results, REDIS_TTL);
    }

    return results;
  }

  /**
   * Manually set a global indicator value (for tea, rubber, etc. that have no API).
   */
  async setManualIndicator(
    indicator: string,
    value: number,
    date?: string,
  ): Promise<void> {
    const dateStr = date ?? new Date().toISOString().split('T')[0];
    await this.upsertGlobalData(indicator, dateStr, value, 'manual');
    await this.redisService.del(REDIS_KEY);
  }

  // ─── Helpers ───────────────────────────────────────────────

  private async upsertGlobalData(
    indicator: string,
    dateStr: string,
    value: number,
    source: string,
  ): Promise<void> {
    const existing = await this.macroDataRepository
      .createQueryBuilder('md')
      .where('md.indicator = :indicator', { indicator })
      .andWhere('md.data_date = :date', { date: dateStr })
      .getOne();

    if (existing) {
      existing.value = value;
      existing.source = source;
      await this.macroDataRepository.save(existing);
    } else {
      const macroData = new MacroData();
      macroData.indicator = indicator;
      macroData.data_date = new Date(dateStr);
      macroData.value = value;
      macroData.source = source;
      await this.macroDataRepository.save(macroData);
    }
  }
}
