import { Controller, Get, Post, Delete, Param, Body, ParseIntPipe } from '@nestjs/common';
import { DividendsService } from './dividends.service';

@Controller('dividends')
export class DividendsController {
  constructor(private readonly dividendsService: DividendsService) {}

  /** GET /api/dividends/upcoming — Upcoming ex-dividend dates. */
  @Get('upcoming')
  async getUpcoming() {
    return this.dividendsService.getUpcoming();
  }

  /** GET /api/dividends/portfolio — Portfolio dividend income summary. */
  @Get('portfolio')
  async getPortfolioDividendIncome() {
    return this.dividendsService.getPortfolioDividendIncome();
  }

  /** GET /api/dividends/:symbol — Dividend history for a stock. */
  @Get(':symbol')
  async getBySymbol(@Param('symbol') symbol: string) {
    return this.dividendsService.getBySymbol(symbol);
  }

  /** GET /api/dividends/:symbol/yield — Dividend yield for a stock. */
  @Get(':symbol/yield')
  async getDividendYield(@Param('symbol') symbol: string) {
    return this.dividendsService.getDividendYield(symbol);
  }

  /** POST /api/dividends — Add a dividend record. */
  @Post()
  async addDividend(
    @Body()
    body: {
      symbol: string;
      amount_per_share: number;
      ex_date: string;
      declaration_date?: string;
      payment_date?: string;
      type?: string;
      fiscal_year?: string;
    },
  ) {
    return this.dividendsService.addDividend(body);
  }

  /** DELETE /api/dividends/:id — Delete a dividend record. */
  @Delete(':id')
  async deleteDividend(@Param('id', ParseIntPipe) id: number) {
    await this.dividendsService.deleteDividend(id);
    return { message: 'Dividend deleted' };
  }
}
