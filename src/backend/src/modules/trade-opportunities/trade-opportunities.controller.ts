import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { TradeOpportunitiesService } from './trade-opportunities.service';
import { Public } from '../auth/public.decorator';

@Controller('trade-opportunities')
export class TradeOpportunitiesController {
  constructor(private readonly service: TradeOpportunitiesService) {}

  /** GET /api/trade-opportunities */
  @Public()
  @Get()
  getOpportunities() {
    return this.service.getOpportunities();
  }

  /** GET /api/trade-opportunities/risk-summary */
  @Public()
  @Get('risk-summary')
  getRiskSummary(
    @Query('accountId', new DefaultValuePipe(1), ParseIntPipe)
    accountId: number,
  ) {
    return this.service.getRiskSummary(accountId);
  }

  /** POST /api/trade-opportunities/select — Requires JWT. */
  @Post('select')
  selectTrades(@Body() body: { symbols: string[]; account_type?: string }) {
    return this.service.selectTrades(body.symbols, body.account_type ?? 'demo');
  }

  /** POST /api/trade-opportunities/execute — Requires JWT. */
  @Post('execute')
  executeTrades(@Body() body: { symbols: string[]; account_id?: number }) {
    return this.service.executeTrades(body.symbols, body.account_id ?? 1);
  }
}
