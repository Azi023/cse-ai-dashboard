import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  ParseIntPipe,
  Res,
  UseInterceptors,
  UploadedFile,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CompanyFinancialsService } from './company-financials.service';
import { CseFundamentalsScraperService } from './cse-fundamentals-scraper.service';
import { CseHistoricalBackfillService } from './cse-historical-backfill.service';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';

@Controller('financials')
export class CompanyFinancialsController {
  constructor(
    private readonly financialsService: CompanyFinancialsService,
    private readonly scraperService: CseFundamentalsScraperService,
    private readonly historicalBackfillService: CseHistoricalBackfillService,
  ) {}

  /** POST /api/financials — Create a new financial record. */
  @Post()
  async create(
    @Body()
    body: {
      symbol: string;
      fiscal_year: string;
      quarter: string;
      total_revenue?: number | null;
      interest_income?: number | null;
      non_compliant_income?: number | null;
      net_profit?: number | null;
      earnings_per_share?: number | null;
      total_assets?: number | null;
      total_liabilities?: number | null;
      shareholders_equity?: number | null;
      interest_bearing_debt?: number | null;
      interest_bearing_deposits?: number | null;
      receivables?: number | null;
      prepayments?: number | null;
      cash_and_equivalents?: number | null;
      pe_ratio?: number | null;
      pb_ratio?: number | null;
      debt_to_equity?: number | null;
      return_on_equity?: number | null;
      dividend_yield?: number | null;
      source?: string;
      report_date?: string | null;
    },
  ) {
    return this.financialsService.create(body);
  }

  /** GET /api/financials/summary/coverage — Coverage stats. */
  @Get('summary/coverage')
  async getCoverage() {
    return this.financialsService.getCoverage();
  }

  /** GET /api/financials/status — Coverage stats scoped to compliant stocks. */
  @Get('status')
  async getStatus() {
    return this.financialsService.getStatus();
  }

  /** GET /api/financials/template-csv — Download CSV import template. */
  @Get('template-csv')
  getTemplateCsv(@Res() res: Response) {
    const csv = this.financialsService.getTemplateCsv();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="financials-template.csv"',
    );
    res.send(csv);
  }

  /** POST /api/financials/fetch-cse — Auto-fetch market data for all compliant stocks. */
  @Post('fetch-cse')
  async fetchFromCse() {
    return this.financialsService.fetchFromCse();
  }

  /**
   * POST /api/financials/scrape-cse — Playwright scraper for CSE company profiles.
   * Navigates to cse.lk/company-profile for each symbol, opens Financials →
   * Fundamental Data, waits for the TradingView widget, extracts all metrics,
   * saves screenshots + JSON to data/cse-fundamentals/, upserts into DB,
   * and then triggers POST /api/shariah/run-tier2-screening.
   */
  @Post('scrape-cse')
  async scrapeCse(@Query('symbol') symbol?: string) {
    return this.scraperService.scrapeAll(symbol);
  }

  /**
   * POST /api/financials/test-login — Isolated MYCSE login test with full logging.
   * Launches a visible (headless: false) browser so the login flow can be watched.
   * Takes screenshots at every step. Returns all logs + screenshot paths as JSON.
   */
  @UseGuards(ApiKeyGuard)
  @Throttle({ default: { ttl: 60_000, limit: 2 } })
  @Post('test-login')
  async testLogin() {
    return this.scraperService.testLoginFlow();
  }

  /**
   * POST /api/financials/probe-mycse
   *
   * Diagnostic: Login to CSE Platinum and map the MYCSE dashboard structure.
   * Returns all navigation links, historical mentions, URL candidates, and
   * a screenshot at data/cse-fundamentals/probe-mycse-dashboard.png.
   *
   * Use this BEFORE running backfill-history to verify navigation works.
   */
  @UseGuards(ApiKeyGuard)
  @Throttle({ default: { ttl: 60_000, limit: 2 } })
  @Post('probe-mycse')
  async probeMycse() {
    return this.historicalBackfillService.probeMycseStructure();
  }

  /**
   * POST /api/financials/backfill-history
   *
   * Backfills 5+ years of OHLCV daily price data from CSE Platinum
   * "Historical Share Prices" section. Targets all 151 Shariah-compliant
   * stocks + top 50 by market cap. Inserts with ON CONFLICT DO NOTHING.
   *
   * Optional body: { "symbols": ["AEL.N0000", "JKH.N0000"] }
   * (omit to backfill all targets)
   *
   * Returns a full BackfillHistoryResult + saves report to tasks/backfill-report.md
   */
  @UseGuards(ApiKeyGuard)
  @Throttle({ default: { ttl: 60_000, limit: 2 } })
  @Post('backfill-history')
  async backfillHistory(@Body() body: { symbols?: string[] } = {}) {
    return this.historicalBackfillService.backfillHistory(body.symbols);
  }

  /** POST /api/financials/import-csv — Bulk import from CSV file (max 5 MB). */
  @Post('import-csv')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  async importCsv(
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
  ) {
    if (!file) {
      return { imported: 0, skipped: 0, errors: ['No file uploaded'] };
    }
    const csvText = file.buffer.toString('utf-8');
    return this.financialsService.importFromCsv(csvText);
  }

  /** GET /api/financials/:symbol — All records for a symbol. */
  @Get(':symbol')
  async getBySymbol(@Param('symbol') symbol: string) {
    return this.financialsService.getBySymbol(symbol);
  }

  /** GET /api/financials/:symbol/latest — Most recent record. */
  @Get(':symbol/latest')
  async getLatest(@Param('symbol') symbol: string) {
    return this.financialsService.getLatest(symbol);
  }

  /** PUT /api/financials/:id — Update a financial record. */
  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      fiscal_year?: string;
      quarter?: string;
      total_revenue?: number | null;
      interest_income?: number | null;
      non_compliant_income?: number | null;
      net_profit?: number | null;
      earnings_per_share?: number | null;
      total_assets?: number | null;
      total_liabilities?: number | null;
      shareholders_equity?: number | null;
      interest_bearing_debt?: number | null;
      interest_bearing_deposits?: number | null;
      receivables?: number | null;
      prepayments?: number | null;
      cash_and_equivalents?: number | null;
      pe_ratio?: number | null;
      pb_ratio?: number | null;
      debt_to_equity?: number | null;
      return_on_equity?: number | null;
      dividend_yield?: number | null;
      source?: string;
      report_date?: string | null;
    },
  ) {
    return this.financialsService.update(id, body);
  }
}
