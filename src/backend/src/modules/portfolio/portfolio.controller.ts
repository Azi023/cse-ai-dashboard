import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import { PortfolioService } from './portfolio.service';

@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  /** GET /api/portfolio — All holdings with live prices and P&L. */
  @Get()
  async getAllHoldings() {
    return this.portfolioService.getAllHoldings();
  }

  /** GET /api/portfolio/summary — Total value, P&L, allocation breakdown. */
  @Get('summary')
  async getSummary() {
    return this.portfolioService.getSummary();
  }

  /** GET /api/portfolio/shariah — Shariah compliance summary. */
  @Get('shariah')
  async getShariahSummary() {
    return this.portfolioService.getShariahSummary();
  }

  /** POST /api/portfolio — Add a new holding. */
  @Post()
  async addHolding(
    @Body()
    body: {
      symbol: string;
      quantity: number;
      buy_price: number;
      buy_date: string;
      notes?: string;
    },
  ) {
    return this.portfolioService.addHolding(body);
  }

  /** PUT /api/portfolio/:id — Update a holding. */
  @Put(':id')
  async updateHolding(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      quantity?: number;
      buy_price?: number;
      buy_date?: string;
      notes?: string;
    },
  ) {
    return this.portfolioService.updateHolding(id, body);
  }

  /** DELETE /api/portfolio/:id — Remove a holding. */
  @Delete(':id')
  async deleteHolding(@Param('id', ParseIntPipe) id: number) {
    return this.portfolioService.deleteHolding(id);
  }
}
