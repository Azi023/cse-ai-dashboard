import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CseApiService } from './cse-api.service';
import { RedisService } from './redis.service';
import {
  Stock,
  DailyPrice,
  Announcement,
  MarketSummary,
  MacroData,
} from '../../entities';

// Redis cache keys
const CACHE_KEYS = {
  MARKET_STATUS: 'cse:market_status',
  MARKET_SUMMARY: 'cse:market_summary',
  TRADE_SUMMARY: 'cse:trade_summary',
  ASPI_DATA: 'cse:aspi_data',
  SNP_DATA: 'cse:snp_data',
  TOP_GAINERS: 'cse:top_gainers',
  TOP_LOSERS: 'cse:top_losers',
  MOST_ACTIVE: 'cse:most_active',
  ALL_SECTORS: 'cse:all_sectors',
  ANNOUNCEMENTS_FINANCIAL: 'cse:announcements:financial',
  ANNOUNCEMENTS_APPROVED: 'cse:announcements:approved',
};

// TTL in seconds
const TTL = {
  REAL_TIME: 30,
  MARKET_DATA: 60,
  ANNOUNCEMENTS: 1800, // 30 minutes
  SECTORS: 300, // 5 minutes
};

interface TradeSummaryItem {
  id?: number;
  symbol?: string;
  name?: string;
  price?: number;
  change?: number;
  percentageChange?: number;
  sharevolume?: number;
  tradevolume?: number;
  turnover?: number;
  previousClose?: number;
  open?: number;
  high?: number;
  low?: number;
  marketCap?: number;
  closingPrice?: number;
}

interface TradeSummaryResponse {
  reqTradeSummery?: TradeSummaryItem[];
}

interface AnnouncementItem {
  id?: number;
  fileText?: string;
  name?: string;
  symbol?: string;
  path?: string;
  uploadedDate?: string;
  authorizedDate?: string;
}

interface AnnouncementResponse {
  reqFinancialAnnouncemnets?: AnnouncementItem[];
  reqApprovedAnnouncemnets?: AnnouncementItem[];
  [key: string]: AnnouncementItem[] | undefined;
}

interface IndexData {
  value?: number;
  change?: number;
  percentage?: number;
  highValue?: number;
  lowValue?: number;
}

interface MarketSummaryRaw {
  tradeVolume?: number;
  shareVolume?: number;
  trades?: number;
  tradeDate?: number;
}

@Injectable()
export class CseDataService implements OnModuleInit {
  private readonly logger = new Logger(CseDataService.name);

  constructor(
    private readonly cseApiService: CseApiService,
    private readonly redisService: RedisService,
    @InjectRepository(Stock)
    private readonly stockRepository: Repository<Stock>,
    @InjectRepository(DailyPrice)
    private readonly dailyPriceRepository: Repository<DailyPrice>,
    @InjectRepository(Announcement)
    private readonly announcementRepository: Repository<Announcement>,
    @InjectRepository(MarketSummary)
    private readonly marketSummaryRepository: Repository<MarketSummary>,
    @InjectRepository(MacroData)
    private readonly macroDataRepository: Repository<MacroData>,
  ) {}

  /**
   * Fetch initial data on startup so we don't wait for the first cron cycle.
   */
  async onModuleInit(): Promise<void> {
    this.logger.log('Starting initial data fetch...');
    try {
      // Fetch market data regardless of market hours on startup
      await Promise.all([
        this.fetchAndCacheMarketData(),
        this.fetchAndCacheTradeSummary(),
        this.pollAnnouncements(),
      ]);
      // Save today's data to PostgreSQL for historical records
      await this.saveDailyMarketSummary();
      this.logger.log('Initial data fetch complete');
    } catch (error) {
      this.logger.error(`Initial data fetch failed: ${String(error)}`);
    }
  }

  /**
   * Check if current time is within CSE market hours.
   * Market hours: Mon-Fri 9:30 AM - 2:30 PM SLT (UTC+5:30)
   */
  isMarketHours(): boolean {
    const now = new Date();

    // Convert to Sri Lanka Time (UTC+5:30)
    const sltOffset = 5.5 * 60; // minutes
    const utcMinutes =
      now.getUTCHours() * 60 + now.getUTCMinutes();
    const sltMinutes = utcMinutes + sltOffset;

    const sltHours = Math.floor(sltMinutes / 60) % 24;
    const sltMins = sltMinutes % 60;

    const dayOfWeek = now.getUTCDay();
    // Adjust day of week for SLT timezone
    const sltDay =
      sltMinutes >= 24 * 60
        ? (dayOfWeek + 1) % 7
        : dayOfWeek;

    // Monday = 1, Friday = 5
    if (sltDay === 0 || sltDay === 6) return false;

    const currentTimeInMinutes = sltHours * 60 + sltMins;
    const marketOpen = 9 * 60 + 30; // 9:30 AM
    const marketClose = 14 * 60 + 30; // 2:30 PM

    return (
      currentTimeInMinutes >= marketOpen &&
      currentTimeInMinutes <= marketClose
    );
  }

  /**
   * Poll market data every 60 seconds during market hours.
   * Fetches market summary, ASPI, S&P SL20, sectors, gainers, losers, most active.
   */
  @Cron('*/60 * * * * *')
  async pollMarketData(): Promise<void> {
    if (!this.isMarketHours()) return;
    await this.fetchAndCacheMarketData();
  }

  /**
   * Fetch market data from CSE API and cache in Redis.
   */
  private async fetchAndCacheMarketData(): Promise<void> {
    this.logger.log('Fetching market data...');

    try {
      const [
        marketSummary,
        aspiData,
        snpData,
        topGainers,
        topLosers,
        mostActive,
        allSectors,
      ] = await Promise.all([
        this.cseApiService.getMarketSummary(),
        this.cseApiService.getAspiData(),
        this.cseApiService.getSnpData(),
        this.cseApiService.getTopGainers(),
        this.cseApiService.getTopLosers(),
        this.cseApiService.getMostActive(),
        this.cseApiService.getAllSectors(),
      ]);

      // Cache all results in Redis with longer TTLs (no expiry issues outside market hours)
      const cacheTtl = 3600; // 1 hour — crons will refresh during market hours
      const cacheOps: Promise<void>[] = [];

      if (marketSummary) {
        cacheOps.push(this.redisService.setJson(CACHE_KEYS.MARKET_SUMMARY, marketSummary, cacheTtl));
      }
      if (aspiData) {
        cacheOps.push(this.redisService.setJson(CACHE_KEYS.ASPI_DATA, aspiData, cacheTtl));
      }
      if (snpData) {
        cacheOps.push(this.redisService.setJson(CACHE_KEYS.SNP_DATA, snpData, cacheTtl));
      }
      if (topGainers) {
        cacheOps.push(this.redisService.setJson(CACHE_KEYS.TOP_GAINERS, topGainers, cacheTtl));
      }
      if (topLosers) {
        cacheOps.push(this.redisService.setJson(CACHE_KEYS.TOP_LOSERS, topLosers, cacheTtl));
      }
      if (mostActive) {
        cacheOps.push(this.redisService.setJson(CACHE_KEYS.MOST_ACTIVE, mostActive, cacheTtl));
      }
      if (allSectors) {
        cacheOps.push(this.redisService.setJson(CACHE_KEYS.ALL_SECTORS, allSectors, cacheTtl));
      }

      await Promise.all(cacheOps);
      this.logger.log('Market data cached successfully');
    } catch (error) {
      this.logger.error(`Error fetching market data: ${String(error)}`);
    }
  }

  /**
   * Poll trade summary every 30 seconds during market hours.
   * Fetches per-stock trade data and syncs stock list.
   */
  @Cron('*/30 * * * * *')
  async pollTradeSummary(): Promise<void> {
    if (!this.isMarketHours()) return;
    await this.fetchAndCacheTradeSummary();
  }

  /**
   * Fetch trade summary and sync stocks to database.
   */
  private async fetchAndCacheTradeSummary(): Promise<void> {
    this.logger.log('Fetching trade summary...');

    try {
      const tradeSummary = await this.cseApiService.getTradeSummary();

      if (tradeSummary) {
        await this.redisService.setJson(
          CACHE_KEYS.TRADE_SUMMARY,
          tradeSummary,
          3600,
        );

        // Sync stocks list from trade summary
        await this.syncStocksList(tradeSummary);
      }
    } catch (error) {
      this.logger.error(
        `Error fetching trade summary: ${String(error)}`,
      );
    }
  }

  /**
   * Poll announcements every 30 minutes (runs during and outside market hours).
   */
  @Cron('0 */30 * * * *')
  async pollAnnouncements(): Promise<void> {
    this.logger.log('Polling announcements...');

    try {
      const [financialAnnouncements, approvedAnnouncements] =
        await Promise.all([
          this.cseApiService.getFinancialAnnouncements(),
          this.cseApiService.getApprovedAnnouncements(),
        ]);

      if (financialAnnouncements) {
        await this.redisService.setJson(
          CACHE_KEYS.ANNOUNCEMENTS_FINANCIAL,
          financialAnnouncements,
          TTL.ANNOUNCEMENTS,
        );

        // Persist financial announcements
        await this.saveAnnouncements(
          financialAnnouncements,
          'financial',
        );
      }

      if (approvedAnnouncements) {
        await this.redisService.setJson(
          CACHE_KEYS.ANNOUNCEMENTS_APPROVED,
          approvedAnnouncements,
          TTL.ANNOUNCEMENTS,
        );

        // Persist approved announcements
        await this.saveAnnouncements(
          approvedAnnouncements,
          'approved',
        );
      }

      this.logger.log('Announcements updated successfully');
    } catch (error) {
      this.logger.error(
        `Error polling announcements: ${String(error)}`,
      );
    }
  }

  /**
   * Mid-day price snapshot at 12:00 PM SLT Mon-Fri.
   * Captures intraday prices so we have a second data point each day.
   * Cron uses UTC: 12:00 PM SLT = 6:30 AM UTC
   * Safe to run: saveDailyPrices() upserts by (stock_id, trade_date).
   */
  @Cron('30 6 * * 1-5')
  async saveMidDayPrices(): Promise<void> {
    this.logger.log('Saving mid-day price snapshot (12:00 SLT)...');

    try {
      // Refresh trade summary cache first so saveDailyPrices has fresh data
      await this.fetchAndCacheTradeSummary();
      await this.saveDailyPrices();
      this.logger.log('Mid-day price snapshot saved successfully');
    } catch (error) {
      this.logger.error(
        `Error saving mid-day prices: ${String(error)}`,
      );
    }
  }

  /**
   * Save daily market summary at 3:00 PM SLT Mon-Fri.
   * Cron uses UTC: 3:00 PM SLT = 9:30 AM UTC
   */
  @Cron('30 9 * * 1-5')
  async saveDailyMarketSummary(): Promise<void> {
    this.logger.log('Saving daily market summary...');

    try {
      const marketRaw = await this.cseApiService.getMarketSummary() as MarketSummaryRaw | null;
      const aspiRaw = await this.cseApiService.getAspiData() as IndexData | null;
      const snpRaw = await this.cseApiService.getSnpData() as IndexData | null;

      const today = new Date();
      const summaryDate = today.toISOString().split('T')[0];

      // Upsert market summary
      const existing = await this.marketSummaryRepository.findOne({
        where: { summary_date: new Date(summaryDate) },
      });

      const summaryEntity = existing ?? new MarketSummary();
      summaryEntity.summary_date = new Date(summaryDate);

      // ASPI data from dedicated endpoint
      if (aspiRaw) {
        summaryEntity.aspi_value = aspiRaw.value ?? null;
        summaryEntity.aspi_change = aspiRaw.change ?? null;
        summaryEntity.aspi_change_percent = aspiRaw.percentage ?? null;
      }

      // S&P SL20 data from dedicated endpoint
      if (snpRaw) {
        summaryEntity.sp_sl20_value = snpRaw.value ?? null;
        summaryEntity.sp_sl20_change = snpRaw.change ?? null;
        summaryEntity.sp_sl20_change_percent = snpRaw.percentage ?? null;
      }

      // Market summary has volume/turnover/trades
      if (marketRaw) {
        summaryEntity.total_volume = marketRaw.shareVolume ?? null;
        summaryEntity.total_turnover = marketRaw.tradeVolume ?? null;
        summaryEntity.total_trades = marketRaw.trades ?? null;
      }

      await this.marketSummaryRepository.save(summaryEntity);

      // Save ASPI as macro data
      if (aspiRaw?.value) {
        await this.saveMacroData('aspi', summaryDate, aspiRaw.value);
      }

      // Save S&P SL20 as macro data
      if (snpRaw?.value) {
        await this.saveMacroData('sp_sl20', summaryDate, snpRaw.value);
      }

      // Also save daily prices for all traded stocks
      await this.saveDailyPrices();

      this.logger.log('Daily market summary saved successfully');
    } catch (error) {
      this.logger.error(
        `Error saving daily market summary: ${String(error)}`,
      );
    }
  }

  /**
   * Sync the stocks list from trade summary data.
   * Upserts stocks into the database based on symbol.
   */
  async syncStocksList(tradeSummary: unknown): Promise<void> {
    try {
      // CSE API wraps trade data in reqTradeSummery
      const raw = tradeSummary as TradeSummaryResponse;
      const items = raw?.reqTradeSummery ?? [];

      if (items.length === 0) {
        this.logger.warn('No stocks in trade summary to sync');
        return;
      }

      this.logger.log(`Syncing ${items.length} stocks...`);

      for (const item of items) {
        if (!item.symbol) continue;

        let stock = await this.stockRepository.findOne({
          where: { symbol: item.symbol },
        });

        if (!stock) {
          stock = new Stock();
          stock.symbol = item.symbol;
          stock.name = item.name ?? item.symbol;
        }

        // Update mutable fields using actual CSE API field names
        if (item.name) stock.name = item.name;
        if (item.price !== undefined) {
          stock.last_price = item.price;
        }
        if (item.percentageChange !== undefined) {
          stock.change_percent = item.percentageChange;
        }
        if (item.marketCap !== undefined) {
          stock.market_cap = item.marketCap;
        }
        stock.is_active = true;

        await this.stockRepository.save(stock);
      }

      this.logger.log(`Synced ${items.length} stocks to database`);
    } catch (error) {
      this.logger.error(
        `Error syncing stocks list: ${String(error)}`,
      );
    }
  }

  /**
   * Save daily prices for all traded stocks from the cached trade summary.
   */
  private async saveDailyPrices(): Promise<void> {
    try {
      const cached =
        await this.redisService.getJson<TradeSummaryResponse>(
          CACHE_KEYS.TRADE_SUMMARY,
        );

      const items = cached?.reqTradeSummery ?? [];
      if (items.length === 0) return;

      const today = new Date().toISOString().split('T')[0];

      for (const item of items) {
        if (!item.symbol) continue;

        const stock = await this.stockRepository.findOne({
          where: { symbol: item.symbol },
        });

        if (!stock) continue;

        // Check if daily price already exists
        const existing = await this.dailyPriceRepository
          .createQueryBuilder('dp')
          .where('dp.stock_id = :stockId', { stockId: stock.id })
          .andWhere('dp.trade_date = :tradeDate', {
            tradeDate: today,
          })
          .getOne();

        if (existing) {
          // Update existing record with actual CSE field names
          existing.open = item.open ?? existing.open;
          existing.high = item.high ?? existing.high;
          existing.low = item.low ?? existing.low;
          existing.close = item.price ?? existing.close;
          existing.previous_close =
            item.previousClose ?? existing.previous_close;
          existing.volume = item.sharevolume ?? existing.volume;
          existing.turnover = item.turnover ?? existing.turnover;
          existing.trades_count =
            item.tradevolume ?? existing.trades_count;
          await this.dailyPriceRepository.save(existing);
        } else {
          const dailyPrice = new DailyPrice();
          dailyPrice.stock_id = stock.id;
          dailyPrice.trade_date = new Date(today);
          dailyPrice.open = item.open ?? 0;
          dailyPrice.high = item.high ?? 0;
          dailyPrice.low = item.low ?? 0;
          dailyPrice.close = item.price ?? 0;
          dailyPrice.previous_close = item.previousClose ?? null;
          dailyPrice.volume = item.sharevolume ?? 0;
          dailyPrice.turnover = item.turnover ?? 0;
          dailyPrice.trades_count = item.tradevolume ?? 0;
          await this.dailyPriceRepository.save(dailyPrice);
        }
      }

      this.logger.log(`Saved daily prices for ${items.length} stocks`);
    } catch (error) {
      this.logger.error(
        `Error saving daily prices: ${String(error)}`,
      );
    }
  }

  /**
   * Save macro data (ASPI, S&P SL20, etc.) as time-series entries.
   */
  private async saveMacroData(
    indicator: string,
    dateStr: string,
    value: number,
  ): Promise<void> {
    try {
      const existing = await this.macroDataRepository
        .createQueryBuilder('md')
        .where('md.indicator = :indicator', { indicator })
        .andWhere('md.data_date = :date', { date: dateStr })
        .getOne();

      if (existing) {
        existing.value = value;
        await this.macroDataRepository.save(existing);
      } else {
        const macroData = new MacroData();
        macroData.indicator = indicator;
        macroData.data_date = new Date(dateStr);
        macroData.value = value;
        macroData.source = 'cse_api';
        await this.macroDataRepository.save(macroData);
      }
    } catch (error) {
      this.logger.error(
        `Error saving macro data ${indicator}: ${String(error)}`,
      );
    }
  }

  /**
   * Save announcements to the database, avoiding duplicates by title.
   */
  private async saveAnnouncements(
    data: unknown,
    type: string,
  ): Promise<void> {
    try {
      // CSE wraps announcements in keys like reqFinancialAnnouncemnets, reqApprovedAnnouncemnets
      const raw = data as AnnouncementResponse;
      let items: AnnouncementItem[] = [];

      if (raw) {
        // Find the first array value in the response object
        for (const key of Object.keys(raw)) {
          const val = raw[key];
          if (Array.isArray(val)) {
            items = val;
            break;
          }
        }
      }

      if (items.length === 0) return;

      for (const item of items) {
        if (!item.fileText) continue;

        // Check for duplicate by CSE announcement ID
        const title = `${item.fileText} - ${item.name ?? ''}`.substring(0, 500);
        const existing = await this.announcementRepository.findOne({
          where: { title, type },
        });

        if (existing) continue;

        const announcement = new Announcement();
        announcement.type = type;
        announcement.title = title;
        announcement.symbol = item.symbol ?? null;
        announcement.url = item.path ?? null;
        announcement.announced_at = item.uploadedDate
          ? new Date(item.uploadedDate)
          : null;

        await this.announcementRepository.save(announcement);
      }

      this.logger.log(`Saved ${type} announcements (${items.length} checked)`);
    } catch (error) {
      this.logger.error(
        `Error saving ${type} announcements: ${String(error)}`,
      );
    }
  }
}
