import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  Logger,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { CryptoService } from './crypto.service';
import { CryptoTechnicalService } from './crypto-technical.service';
import { CryptoDCAService } from './crypto-dca.service';
import { PaperTradeDto } from './dto/paper-trade.dto';
import { CreateDCADto } from './dto/dca.dto';

@Controller('crypto')
@Public()
export class CryptoController {
  private readonly logger = new Logger(CryptoController.name);

  constructor(
    private readonly cryptoService: CryptoService,
    private readonly cryptoTechnicalService: CryptoTechnicalService,
    private readonly cryptoDCAService: CryptoDCAService,
  ) {}

  // ── Market Data ────────────────────────────────────────────────────────

  @Get('ticker/:symbol')
  async getTicker(@Param('symbol') symbol: string) {
    const normalized = symbol.replace('-', '/').toUpperCase();
    return this.cryptoService.fetchTicker(normalized);
  }

  @Get('ohlcv/:symbol')
  async getOHLCV(
    @Param('symbol') symbol: string,
    @Query('timeframe') timeframe: string = '1h',
    @Query('limit') limit: string = '100',
  ) {
    const normalized = symbol.replace('-', '/').toUpperCase();
    return this.cryptoService.fetchOHLCV(
      normalized,
      timeframe,
      Math.min(Number(limit) || 100, 500),
    );
  }

  @Get('ohlcv-history/:symbol')
  async getOHLCVHistory(
    @Param('symbol') symbol: string,
    @Query('timeframe') timeframe: string = '1d',
    @Query('limit') limit: string = '365',
  ) {
    const normalized = symbol.replace('-', '/').toUpperCase();
    return this.cryptoService.getOHLCVCandles(
      normalized,
      timeframe,
      Math.min(Number(limit) || 365, 2000),
    );
  }

  @Get('orderbook/:symbol')
  async getOrderBook(
    @Param('symbol') symbol: string,
    @Query('limit') limit: string = '20',
  ) {
    const normalized = symbol.replace('-', '/').toUpperCase();
    return this.cryptoService.fetchOrderBook(
      normalized,
      Math.min(Number(limit) || 20, 100),
    );
  }

  @Get('markets')
  async getMarkets() {
    return this.cryptoService.getAvailableMarkets();
  }

  @Get('filtered-markets')
  async getFilteredMarkets(@Query('limit') limit: string = '30') {
    return this.cryptoService.getFilteredMarkets(
      Math.min(Number(limit) || 30, 50),
    );
  }

  // ── Shariah ────────────────────────────────────────────────────────────

  @Get('shariah/whitelist')
  getShariahWhitelist() {
    return {
      whitelist: this.cryptoService.getShariahWhitelist(),
      note: 'Only these pairs are permitted for Shariah-compliant paper trading',
    };
  }

  // ── Paper Trading ──────────────────────────────────────────────────────

  @Get('paper/portfolio')
  async getPortfolio() {
    return this.cryptoService.getPortfolio();
  }

  @Post('paper/buy')
  async paperBuy(@Body() dto: PaperTradeDto) {
    return this.cryptoService.paperBuy(dto.symbol, dto.amount);
  }

  @Post('paper/sell')
  async paperSell(@Body() dto: PaperTradeDto) {
    return this.cryptoService.paperSell(dto.symbol, dto.amount);
  }

  @Get('paper/history')
  async getTradeHistory() {
    return this.cryptoService.getTradeHistory();
  }

  // ── Technical Analysis ─────────────────────────────────────────────────

  @Get('analysis/:symbol')
  async getAnalysis(@Param('symbol') symbol: string) {
    const normalized = symbol.replace('-', '/').toUpperCase();
    return this.cryptoTechnicalService.getAnalysis(normalized);
  }

  @Get('analysis/:symbol/history')
  async getAnalysisHistory(
    @Param('symbol') symbol: string,
    @Query('timeframe') timeframe: string = '1d',
    @Query('days') days: string = '30',
  ) {
    const normalized = symbol.replace('-', '/').toUpperCase();
    return this.cryptoTechnicalService.getSignalHistory(
      normalized,
      timeframe,
      Math.min(Number(days) || 30, 90),
    );
  }

  // ── DCA Bot ────────────────────────────────────────────────────────────

  @Post('dca/create')
  async createDCAPlan(@Body() dto: CreateDCADto) {
    return this.cryptoDCAService.createPlan(dto);
  }

  @Get('dca/plans')
  async getDCAPlans() {
    return this.cryptoDCAService.getPlans();
  }

  @Get('dca/performance')
  async getDCAPerformance() {
    return this.cryptoDCAService.getPerformanceSummary();
  }

  @Get('dca/plans/:id')
  async getDCAPlan(@Param('id') id: string) {
    return this.cryptoDCAService.getPlanById(Number(id));
  }

  @Put('dca/plans/:id/pause')
  async pauseDCAPlan(@Param('id') id: string) {
    return this.cryptoDCAService.pausePlan(Number(id));
  }

  @Put('dca/plans/:id/resume')
  async resumeDCAPlan(@Param('id') id: string) {
    return this.cryptoDCAService.resumePlan(Number(id));
  }

  @Delete('dca/plans/:id')
  async deleteDCAPlan(@Param('id') id: string) {
    return this.cryptoDCAService.deletePlan(Number(id));
  }
}
