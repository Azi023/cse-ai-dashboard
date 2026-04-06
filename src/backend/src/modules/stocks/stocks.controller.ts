import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { StocksService } from './stocks.service';
import { Stock, DailyPrice, Announcement } from '../../entities';
import { Public } from '../auth/public.decorator';

@Public()
@Controller()
export class StocksController {
  constructor(private readonly stocksService: StocksService) {}

  /**
   * GET /api/stocks - List all stocks with optional filters.
   */
  @Get('stocks')
  async getAllStocks(
    @Query('sector') sector?: string,
    @Query('shariah') shariahStatus?: string,
  ): Promise<Stock[]> {
    return this.stocksService.getAllStocks(sector, shariahStatus);
  }

  /**
   * GET /api/stocks/:symbol - Get stock details.
   */
  @Get('stocks/:symbol')
  async getStock(@Param('symbol') symbol: string): Promise<Stock> {
    return this.stocksService.getStockBySymbol(symbol);
  }

  /**
   * GET /api/stocks/:symbol/prices - Get historical price data.
   */
  @Get('stocks/:symbol/prices')
  async getStockPrices(
    @Param('symbol') symbol: string,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ): Promise<DailyPrice[]> {
    return this.stocksService.getStockPrices(symbol, days);
  }

  /**
   * GET /api/market/summary - Current market summary.
   */
  @Get('market/summary')
  async getMarketSummary(): Promise<unknown> {
    return this.stocksService.getMarketSummary();
  }

  /**
   * GET /api/market/indices - ASPI + S&P SL20 data.
   */
  @Get('market/indices')
  async getMarketIndices(): Promise<unknown> {
    return this.stocksService.getMarketIndices();
  }

  /**
   * GET /api/market/gainers - Top gainers.
   */
  @Get('market/gainers')
  async getTopGainers(): Promise<unknown> {
    return this.stocksService.getTopGainers();
  }

  /**
   * GET /api/market/losers - Top losers.
   */
  @Get('market/losers')
  async getTopLosers(): Promise<unknown> {
    return this.stocksService.getTopLosers();
  }

  /**
   * GET /api/market/active - Most active stocks.
   */
  @Get('market/active')
  async getMostActive(): Promise<unknown> {
    return this.stocksService.getMostActive();
  }

  /**
   * GET /api/market/sectors - All sector indices.
   */
  @Get('market/sectors')
  async getAllSectors(): Promise<unknown> {
    return this.stocksService.getAllSectors();
  }

  /**
   * GET /api/sectors/breakdown - Sector breakdown with stock counts and metrics.
   */
  @Get('sectors/breakdown')
  async getSectorBreakdown() {
    return this.stocksService.getSectorBreakdown();
  }

  /**
   * GET /api/announcements - Recent announcements with filters.
   */
  @Get('announcements')
  async getAnnouncements(
    @Query('type') type?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query('symbol') symbol?: string,
    @Query('category') category?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<Announcement[]> {
    return this.stocksService.getAnnouncements(
      type,
      limit,
      symbol,
      category,
      from,
      to,
    );
  }

  /**
   * GET /api/announcements/:id - Single announcement detail.
   */
  @Get('announcements/:id')
  async getAnnouncementById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<Announcement> {
    return this.stocksService.getAnnouncementById(id);
  }
}
