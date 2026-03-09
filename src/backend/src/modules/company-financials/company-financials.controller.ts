import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import { CompanyFinancialsService } from './company-financials.service';

@Controller('financials')
export class CompanyFinancialsController {
  constructor(
    private readonly financialsService: CompanyFinancialsService,
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
