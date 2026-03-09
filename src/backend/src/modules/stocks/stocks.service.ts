import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../cse-data/redis.service';
import {
  Stock,
  DailyPrice,
  Announcement,
  MarketSummary,
} from '../../entities';

@Injectable()
export class StocksService {
  private readonly logger = new Logger(StocksService.name);

  constructor(
    @InjectRepository(Stock)
    private readonly stockRepository: Repository<Stock>,
    @InjectRepository(DailyPrice)
    private readonly dailyPriceRepository: Repository<DailyPrice>,
    @InjectRepository(Announcement)
    private readonly announcementRepository: Repository<Announcement>,
    @InjectRepository(MarketSummary)
    private readonly marketSummaryRepository: Repository<MarketSummary>,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Get all stocks with optional filters.
   */
  async getAllStocks(
    sector?: string,
    shariahStatus?: string,
  ): Promise<Stock[]> {
    const query = this.stockRepository
      .createQueryBuilder('stock')
      .where('stock.is_active = :isActive', { isActive: true });

    if (sector) {
      query.andWhere('stock.sector = :sector', { sector });
    }

    if (shariahStatus) {
      query.andWhere('stock.shariah_status = :shariahStatus', {
        shariahStatus,
      });
    }

    query.orderBy('stock.symbol', 'ASC');

    return query.getMany();
  }

  /**
   * Get stock details by symbol with latest price info.
   */
  async getStockBySymbol(symbol: string): Promise<Stock> {
    const stock = await this.stockRepository.findOne({
      where: { symbol: symbol.toUpperCase() },
    });

    if (!stock) {
      throw new NotFoundException(`Stock with symbol ${symbol} not found`);
    }

    return stock;
  }

  /**
   * Get historical price data for a stock.
   */
  async getStockPrices(
    symbol: string,
    days: number = 30,
  ): Promise<DailyPrice[]> {
    const stock = await this.stockRepository.findOne({
      where: { symbol: symbol.toUpperCase() },
    });

    if (!stock) {
      throw new NotFoundException(`Stock with symbol ${symbol} not found`);
    }

    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    return this.dailyPriceRepository
      .createQueryBuilder('dp')
      .where('dp.stock_id = :stockId', { stockId: stock.id })
      .andWhere('dp.trade_date >= :fromDate', {
        fromDate: fromDate.toISOString().split('T')[0],
      })
      .orderBy('dp.trade_date', 'DESC')
      .getMany();
  }

  /**
   * Get current market summary from Redis cache, combining ASPI + S&P + market data.
   * Returns a unified format that the frontend expects.
   */
  async getMarketSummary(): Promise<unknown> {
    // Try to build from Redis cache (real-time data)
    const [marketRaw, aspiRaw, snpRaw] = await Promise.all([
      this.redisService.getJson<{ tradeVolume?: number; shareVolume?: number; trades?: number }>('cse:market_summary'),
      this.redisService.getJson<{ value?: number; change?: number; percentage?: number }>('cse:aspi_data'),
      this.redisService.getJson<{ value?: number; change?: number; percentage?: number }>('cse:snp_data'),
    ]);

    if (aspiRaw || snpRaw || marketRaw) {
      return {
        aspi_value: aspiRaw?.value ?? null,
        aspi_change: aspiRaw?.change ?? null,
        aspi_change_percent: aspiRaw?.percentage ?? null,
        sp_sl20_value: snpRaw?.value ?? null,
        sp_sl20_change: snpRaw?.change ?? null,
        sp_sl20_change_percent: snpRaw?.percentage ?? null,
        total_volume: marketRaw?.shareVolume ?? null,
        total_turnover: marketRaw?.tradeVolume ?? null,
        total_trades: marketRaw?.trades ?? null,
        market_cap: null,
      };
    }

    // Fallback to latest DB record
    const latest = await this.marketSummaryRepository.findOne({
      where: {},
      order: { summary_date: 'DESC' },
    });

    return latest ?? { message: 'No market summary available' };
  }

  /**
   * Get market indices (ASPI + S&P SL20) from Redis cache.
   */
  async getMarketIndices(): Promise<unknown> {
    const [aspiData, snpData] = await Promise.all([
      this.redisService.getJson('cse:aspi_data'),
      this.redisService.getJson('cse:snp_data'),
    ]);

    return {
      aspi: aspiData ?? null,
      sp_sl20: snpData ?? null,
    };
  }

  /**
   * Get top gainers from Redis cache.
   */
  async getTopGainers(): Promise<unknown> {
    const cached = await this.redisService.getJson(
      'cse:top_gainers',
    );
    return cached ?? [];
  }

  /**
   * Get top losers from Redis cache.
   */
  async getTopLosers(): Promise<unknown> {
    const cached = await this.redisService.getJson(
      'cse:top_losers',
    );
    return cached ?? [];
  }

  /**
   * Get most active stocks from Redis cache.
   */
  async getMostActive(): Promise<unknown> {
    const cached = await this.redisService.getJson(
      'cse:most_active',
    );
    return cached ?? [];
  }

  /**
   * Get all sector indices from Redis cache.
   */
  async getAllSectors(): Promise<unknown> {
    const cached = await this.redisService.getJson(
      'cse:all_sectors',
    );
    return cached ?? [];
  }

  /**
   * Get recent announcements with optional type filter and limit.
   */
  async getAnnouncements(
    type?: string,
    limit: number = 50,
  ): Promise<Announcement[]> {
    const query = this.announcementRepository
      .createQueryBuilder('a')
      .orderBy('a.created_at', 'DESC')
      .take(limit);

    if (type) {
      query.where('a.type = :type', { type });
    }

    return query.getMany();
  }
}
