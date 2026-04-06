import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { DemoService } from './demo.service';
import { DemoAITraderService } from './demo-ai-trader.service';
import { DemoCronService } from './demo-cron.service';
import { CreateDemoAccountDto } from './dto/create-demo-account.dto';
import { CreateDemoTradeDto } from './dto/create-demo-trade.dto';
import { DemoQueryDto } from './dto/demo-query.dto';
import { Public } from '../modules/auth/public.decorator';

@Controller('demo')
export class DemoController {
  constructor(
    private readonly demoService: DemoService,
    private readonly aiTraderService: DemoAITraderService,
    private readonly cronService: DemoCronService,
  ) {}

  // ─── Accounts ──────────────────────────────────────────────────────────────

  @Public()
  @Get('accounts')
  getAccounts() {
    return this.demoService.getAccounts();
  }

  /** POST /api/demo/accounts — Requires JWT. */
  @Post('accounts')
  createAccount(@Body() dto: CreateDemoAccountDto) {
    return this.demoService.createAccount(dto);
  }

  @Public()
  @Get('accounts/:id')
  getAccount(@Param('id', ParseIntPipe) id: number) {
    return this.demoService.getAccount(id);
  }

  /** POST /api/demo/accounts/:id/reset — Requires JWT. */
  @Post('accounts/:id/reset')
  resetAccount(@Param('id', ParseIntPipe) id: number) {
    return this.demoService.resetAccount(id);
  }

  // ─── Trades ────────────────────────────────────────────────────────────────

  @Public()
  @Get('trades')
  getTradeHistory(@Query() query: DemoQueryDto) {
    return this.demoService.getTradeHistory(query.accountId ?? 0, query);
  }

  /** POST /api/demo/trades — Requires JWT. */
  @Post('trades')
  executeTrade(@Body() dto: CreateDemoTradeDto) {
    return this.demoService.executeTrade(dto);
  }

  // ─── Holdings ──────────────────────────────────────────────────────────────

  @Public()
  @Get('holdings/:accountId')
  getHoldings(@Param('accountId', ParseIntPipe) accountId: number) {
    return this.demoService.getHoldings(accountId);
  }

  // ─── Performance ───────────────────────────────────────────────────────────

  @Public()
  @Get('performance/:accountId')
  getPerformance(@Param('accountId', ParseIntPipe) accountId: number) {
    return this.demoService.getPerformance(accountId);
  }

  // ─── Benchmarks & Snapshots ────────────────────────────────────────────────

  @Public()
  @Get('benchmarks/:accountId')
  getBenchmarks(@Param('accountId', ParseIntPipe) accountId: number) {
    return this.demoService.getBenchmarks(accountId);
  }

  @Public()
  @Get('snapshots/:accountId')
  getSnapshots(@Param('accountId', ParseIntPipe) accountId: number) {
    return this.demoService.getSnapshots(accountId);
  }

  /** POST /api/demo/snapshots/trigger/:accountId — Requires JWT. */
  @Post('snapshots/trigger/:accountId')
  triggerSnapshot(@Param('accountId', ParseIntPipe) accountId: number) {
    return this.cronService.triggerSnapshotForAccount(accountId);
  }

  // ─── AI ────────────────────────────────────────────────────────────────────

  /** POST /api/demo/ai-trade/:accountId — Requires JWT. */
  @Post('ai-trade/:accountId')
  triggerAITrade(@Param('accountId', ParseIntPipe) accountId: number) {
    return this.aiTraderService.evaluateAndTrade(accountId);
  }

  @Public()
  @Get('ai-log/:accountId')
  getAILog(@Param('accountId', ParseIntPipe) accountId: number) {
    return this.aiTraderService.getAILog(accountId);
  }

  // ─── Risk Budget ───────────────────────────────────────────────────────────

  @Public()
  @Get('risk-budget/:accountId')
  getDailyRiskBudget(@Param('accountId', ParseIntPipe) accountId: number) {
    return this.demoService.getDailyRiskBudget(accountId);
  }

  // ─── Maintenance ───────────────────────────────────────────────────────────

  /** POST /api/demo/sync-shariah — Requires JWT. */
  @Post('sync-shariah')
  syncShariahStatus() {
    return this.demoService.syncShariahStatus();
  }
}
