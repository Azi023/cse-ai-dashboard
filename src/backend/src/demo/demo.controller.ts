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
import { CreateDemoAccountDto } from './dto/create-demo-account.dto';
import { CreateDemoTradeDto } from './dto/create-demo-trade.dto';
import { DemoQueryDto } from './dto/demo-query.dto';

@Controller('demo')
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  // ─── Accounts ──────────────────────────────────────────────────────────────

  @Get('accounts')
  getAccounts() {
    return this.demoService.getAccounts();
  }

  @Post('accounts')
  createAccount(@Body() dto: CreateDemoAccountDto) {
    return this.demoService.createAccount(dto);
  }

  @Get('accounts/:id')
  getAccount(@Param('id', ParseIntPipe) id: number) {
    return this.demoService.getAccount(id);
  }

  @Post('accounts/:id/reset')
  resetAccount(@Param('id', ParseIntPipe) id: number) {
    return this.demoService.resetAccount(id);
  }

  // ─── Trades ────────────────────────────────────────────────────────────────

  @Get('trades')
  getTradeHistory(@Query() query: DemoQueryDto) {
    return this.demoService.getTradeHistory(query.accountId ?? 0, query);
  }

  @Post('trades')
  executeTrade(@Body() dto: CreateDemoTradeDto) {
    return this.demoService.executeTrade(dto);
  }

  // ─── Holdings ──────────────────────────────────────────────────────────────

  @Get('holdings/:accountId')
  getHoldings(@Param('accountId', ParseIntPipe) accountId: number) {
    return this.demoService.getHoldings(accountId);
  }

  // ─── Performance ───────────────────────────────────────────────────────────

  @Get('performance/:accountId')
  getPerformance(@Param('accountId', ParseIntPipe) accountId: number) {
    return this.demoService.getPerformance(accountId);
  }

  // ─── Benchmarks & Snapshots ────────────────────────────────────────────────

  @Get('benchmarks/:accountId')
  getBenchmarks(@Param('accountId', ParseIntPipe) accountId: number) {
    return this.demoService.getBenchmarks(accountId);
  }

  @Get('snapshots/:accountId')
  getSnapshots(@Param('accountId', ParseIntPipe) accountId: number) {
    return this.demoService.getSnapshots(accountId);
  }

  // ─── AI ────────────────────────────────────────────────────────────────────

  @Post('ai-trade/:accountId')
  triggerAITrade(@Param('accountId', ParseIntPipe) accountId: number) {
    return this.demoService.triggerAITrade(accountId);
  }

  @Get('ai-log/:accountId')
  getAILog(@Param('accountId', ParseIntPipe) accountId: number) {
    return this.demoService.getAILog(accountId);
  }
}
