import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import { DividendsService } from './dividends.service';
import { Public } from '../auth/public.decorator';

@Controller('dividends')
export class DividendsController {
  constructor(private readonly dividendsService: DividendsService) {}

  /** GET /api/dividends/upcoming — Upcoming ex-dividend dates. */
  @Public()
  @Get('upcoming')
  async getUpcoming() {
    return this.dividendsService.getUpcoming();
  }

  /** GET /api/dividends/portfolio — Portfolio dividend income summary. */
  @Public()
  @Get('portfolio')
  async getPortfolioDividendIncome() {
    return this.dividendsService.getPortfolioDividendIncome();
  }

  /** GET /api/dividends/:symbol — Dividend history for a stock. */
  @Public()
  @Get(':symbol')
  async getBySymbol(@Param('symbol') symbol: string) {
    return this.dividendsService.getBySymbol(symbol);
  }

  /** GET /api/dividends/:symbol/yield — Trailing yield for a stock. */
  @Public()
  @Get(':symbol/yield')
  async getDividendYield(@Param('symbol') symbol: string) {
    return this.dividendsService.getDividendYield(symbol);
  }

  /** POST /api/dividends — Add a dividend record. Requires JWT. */
  @Post()
  async addDividend(
    @Body()
    body: {
      symbol: string;
      ex_date: string;
      amount_per_share: number;
      payment_date?: string;
      notes?: string;
    },
  ) {
    return this.dividendsService.addDividend(body);
  }

  /** DELETE /api/dividends/:id — Remove a dividend record. Requires JWT. */
  @Delete(':id')
  async deleteDividend(@Param('id', ParseIntPipe) id: number) {
    return this.dividendsService.deleteDividend(id);
  }
}
