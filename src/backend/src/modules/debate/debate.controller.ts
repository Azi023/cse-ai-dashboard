import {
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { Public } from '../auth/public.decorator';
import { DebateService } from './debate.service';

@Controller('debates')
export class DebateController {
  constructor(private readonly debateService: DebateService) {}

  /** GET /api/debates/this-week — dashboard widget feed. */
  @Public()
  @Get('this-week')
  async thisWeek() {
    return this.debateService.getThisWeek();
  }

  /** GET /api/debates/:symbol — latest debate for a single stock. */
  @Public()
  @Get(':symbol')
  async getForSymbol(@Param('symbol') symbol: string) {
    const result = await this.debateService.getLatestForSymbol(symbol);
    return result ?? { symbol, debate: null };
  }

  /**
   * POST /api/debates/:symbol/run — force-run a debate now.
   * Respects the 7-day cache (returns cached result if fresh).
   * Protected: JWT + X-API-Key. Consumes AI tokens on miss.
   */
  @UseGuards(ApiKeyGuard)
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @Post(':symbol/run')
  async runNow(@Param('symbol') symbol: string) {
    return this.debateService.runDebateForSymbol(symbol);
  }
}
