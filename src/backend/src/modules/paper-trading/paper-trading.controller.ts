import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { PaperTradingService } from './paper-trading.service';
import { ExecuteTradeDto } from './dto/execute-trade.dto';

@Controller('paper-trading')
export class PaperTradingController {
  constructor(private readonly paperTradingService: PaperTradingService) {}

  /** POST /api/paper-trading/trade — Requires JWT. */
  @Post('trade')
  async executeTrade(@Body() dto: ExecuteTradeDto) {
    return this.paperTradingService.executeTrade(dto);
  }

  @Public()
  @Get('portfolio')
  async getPortfolio(
    @Query('type') type: string = 'paper_human',
    @Query('asset') asset: string = 'stock',
  ) {
    return this.paperTradingService.getPortfolio(type, asset);
  }

  @Public()
  @Get('history')
  async getTradeHistory(
    @Query('type') type: string = 'paper_human',
    @Query('asset') asset?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    return this.paperTradingService.getTradeHistory(type, asset, limit);
  }

  @Public()
  @Get('performance')
  async getPerformance(
    @Query('type') type: string = 'paper_human',
    @Query('asset') asset: string = 'stock',
  ) {
    return this.paperTradingService.getPerformance(type, asset);
  }

  /** POST /api/paper-trading/reset — Requires JWT. */
  @Post('reset')
  async resetPortfolio(
    @Query('type') type: string = 'paper_human',
    @Query('asset') asset: string = 'stock',
  ) {
    return this.paperTradingService.resetPortfolio(type, asset);
  }

  @Public()
  @Get('compare')
  async comparePortfolios() {
    return this.paperTradingService.comparePortfolios();
  }
}
