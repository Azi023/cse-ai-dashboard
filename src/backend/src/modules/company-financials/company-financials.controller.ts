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
import { Public } from '../auth/public.decorator';

@Controller('financials')
export class CompanyFinancialsController {
  constructor(
    private readonly financialsService: CompanyFinancialsService,
    private readonly scraperService: CseFundamentalsScraperService,
    private readonly historicalBackfillService: CseHistoricalBackfillService,
  ) {}

  /** POST /api/financials — Create a new financial record. Requires JWT. */
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
  @Public()
  @Get('summary/coverage')
  async getCoverage() {
    return this.financialsService.getCoverage();
  }

  /** GET /api/financials/status — Coverage stats scoped to compliant stocks. */
  @Public()
  @Get('status')
  async getStatus() {
    return this.financialsService.getStatus();
  }

  /** GET /api/financials/template-csv — Download CSV import template. */
  @Public()
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

  /** POST /api/financials/fetch-cse — Requires JWT. */
  @Post('fetch-cse')
  async fetchFromCse() {
    return this.financialsService.fetchFromCse();
  }

  /** POST /api/financials/scrape-cse — Requires JWT. Playwright scraper. */
  @Throttle({ default: { ttl: 60_000, limit: 2 } })
  @Post('scrape-cse')
  async scrapeCse(@Query('symbol') symbol?: string) {
    return this.scraperService.scrapeAll(symbol);
  }

  /** POST /api/financials/test-login — JWT + API key. */
  @UseGuards(ApiKeyGuard)
  @Throttle({ default: { ttl: 60_000, limit: 2 } })
  @Post('test-login')
  async testLogin() {
    return this.scraperService.testLoginFlow();
  }

  /** POST /api/financials/probe-mycse — JWT + API key. */
  @UseGuards(ApiKeyGuard)
  @Throttle({ default: { ttl: 60_000, limit: 2 } })
  @Post('probe-mycse')
  async probeMycse() {
    return this.historicalBackfillService.probeMycseStructure();
  }

  /** POST /api/financials/backfill-history — JWT + API key. */
  @UseGuards(ApiKeyGuard)
  @Throttle({ default: { ttl: 60_000, limit: 2 } })
  @Post('backfill-history')
  async backfillHistory(@Body() body: { symbols?: string[] } = {}) {
    return this.historicalBackfillService.backfillHistory(body.symbols);
  }

  /** POST /api/financials/import-csv — Requires JWT. */
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
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
  @Public()
  @Get(':symbol')
  async getBySymbol(@Param('symbol') symbol: string) {
    return this.financialsService.getBySymbol(symbol);
  }

  /** GET /api/financials/:symbol/latest — Most recent record. */
  @Public()
  @Get(':symbol/latest')
  async getLatest(@Param('symbol') symbol: string) {
    return this.financialsService.getLatest(symbol);
  }

  /** PUT /api/financials/:id — Update a financial record. Requires JWT. */
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
