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
import { AddDividendDto } from './dto/add-dividend.dto';

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
  async addDividend(@Body() dto: AddDividendDto) {
    return this.dividendsService.addDividend(dto);
  }

  /** DELETE /api/dividends/:id — Remove a dividend record. Requires JWT. */
  @Delete(':id')
  async deleteDividend(@Param('id', ParseIntPipe) id: number) {
    return this.dividendsService.deleteDividend(id);
  }
}
