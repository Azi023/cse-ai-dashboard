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
   * CSE API returns different field names, so we normalize to match TopStock interface.
   */
  async getMostActive(): Promise<unknown> {
    const cached = await this.redisService.getJson<
      Array<{
        symbol?: string;
        tradeVolume?: number;
        shareVolume?: number;
        turnover?: number;
        percentageShareVolume?: number;
      }>
    >('cse:most_active');
    if (!cached || !Array.isArray(cached)) return [];

    // Enrich with price/name from trade summary cache
    const tradeSummary = await this.redisService.getJson<{
      reqTradeSummery?: Array<{
        symbol?: string;
        name?: string;
        price?: number;
        change?: number;
        percentageChange?: number;
      }>;
    }>('cse:trade_summary');
    const tradeMap = new Map<
      string,
      { name?: string; price?: number; change?: number; percentageChange?: number }
    >();
    for (const item of tradeSummary?.reqTradeSummery ?? []) {
      if (item.symbol) tradeMap.set(item.symbol, item);
    }

    return cached.map((item) => {
      const trade = tradeMap.get(item.symbol ?? '') ?? {};
      return {
        symbol: item.symbol,
        name: trade.name ?? item.symbol,
        price: trade.price ?? 0,
        change: trade.change ?? 0,
        changePercentage: trade.percentageChange ?? item.percentageShareVolume ?? 0,
        volume: item.shareVolume ?? 0,
        turnover: item.turnover ?? 0,
      };
    });
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
   * Get recent announcements with optional filters.
   */
  async getAnnouncements(
    type?: string,
    limit: number = 50,
    symbol?: string,
    category?: string,
    from?: string,
    to?: string,
  ): Promise<Announcement[]> {
    const query = this.announcementRepository
      .createQueryBuilder('a')
      .orderBy('a.created_at', 'DESC')
      .take(limit);

    if (type) {
      query.andWhere('a.type = :type', { type });
    }
    if (symbol) {
      query.andWhere('a.symbol = :symbol', { symbol: symbol.toUpperCase() });
    }
    if (category) {
      query.andWhere('a.category = :category', { category });
    }
    if (from) {
      query.andWhere('a.announced_at >= :from', { from });
    }
    if (to) {
      query.andWhere('a.announced_at <= :to', { to });
    }

    return query.getMany();
  }

  /**
   * Get a single announcement by ID.
   */
  async getAnnouncementById(id: number): Promise<Announcement> {
    const announcement = await this.announcementRepository.findOne({
      where: { id },
    });
    if (!announcement) {
      throw new NotFoundException(`Announcement ${id} not found`);
    }
    return announcement;
  }

  /**
   * Categorize announcement based on title keywords.
   */
  /**
   * Get sector breakdown: each sector with stock count, total market cap, avg change %.
   */
  async getSectorBreakdown(): Promise<
    Array<{
      sector: string;
      stockCount: number;
      totalMarketCap: number;
      avgChangePercent: number;
      topStocks: Array<{ symbol: string; name: string; last_price: number; change_percent: number }>;
    }>
  > {
    const stocks = await this.stockRepository.find({
      where: { is_active: true },
      order: { symbol: 'ASC' },
    });

    const sectorMap = new Map<
      string,
      {
        stocks: Stock[];
        totalMcap: number;
        totalChange: number;
      }
    >();

    for (const stock of stocks) {
      const sector = stock.sector ?? 'Unknown';
      if (!sectorMap.has(sector)) {
        sectorMap.set(sector, { stocks: [], totalMcap: 0, totalChange: 0 });
      }
      const entry = sectorMap.get(sector)!;
      entry.stocks.push(stock);
      entry.totalMcap += Number(stock.market_cap) || 0;
      entry.totalChange += Number(stock.change_percent) || 0;
    }

    return Array.from(sectorMap.entries())
      .map(([sector, data]) => ({
        sector,
        stockCount: data.stocks.length,
        totalMarketCap: data.totalMcap,
        avgChangePercent:
          data.stocks.length > 0
            ? Math.round((data.totalChange / data.stocks.length) * 100) / 100
            : 0,
        topStocks: data.stocks
          .sort((a, b) => (Number(b.market_cap) || 0) - (Number(a.market_cap) || 0))
          .slice(0, 5)
          .map((s) => ({
            symbol: s.symbol,
            name: s.name,
            last_price: Number(s.last_price) || 0,
            change_percent: Number(s.change_percent) || 0,
          })),
      }))
      .sort((a, b) => b.totalMarketCap - a.totalMarketCap);
  }

  static categorizeAnnouncement(title: string): string {
    const t = title.toLowerCase();
    if (t.includes('interim') || t.includes('quarter') || t.includes('financial statement') || t.includes('annual report'))
      return 'earnings';
    if (t.includes('dividend'))
      return 'dividend';
    if (t.includes('agm') || t.includes('annual general') || t.includes('egm') || t.includes('extraordinary general'))
      return 'agm';
    if (t.includes('director') || t.includes('board') || t.includes('appointment') || t.includes('resignation'))
      return 'board_change';
    if (t.includes('compliance') || t.includes('cse rule') || t.includes('sec'))
      return 'regulatory';
    if (t.includes('listing') || t.includes('ipo') || t.includes('listed'))
      return 'listing';
    return 'other';
  }
}
