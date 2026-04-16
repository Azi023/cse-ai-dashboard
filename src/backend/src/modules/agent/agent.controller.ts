import { Controller, Get, Post, Body, UseGuards, Logger } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator';
import { AgentKeyGuard } from '../../common/guards/agent-key.guard';
import { AgentService } from './agent.service';
import { ExecutionReportDto } from './dto/execution-report.dto';
import { PortfolioSyncDto } from './dto/portfolio-sync.dto';
import { OrderStatusUpdateDto } from './dto/order-status-update.dto';

/**
 * Internal Agent API — communication bridge between VPS (brain) and WSL2 agent (hands).
 *
 * All endpoints require X-Agent-Key header matching AGENT_SECRET env var.
 * Endpoints bypass JWT auth (@Public) since the agent has its own auth mechanism.
 * Rate limiting is skipped (@SkipThrottle) since agent polling is frequent and trusted.
 */
@Controller('internal/agent')
@Public()
@UseGuards(AgentKeyGuard)
@SkipThrottle()
export class AgentController {
  private readonly logger = new Logger(AgentController.name);

  constructor(private readonly agentService: AgentService) {}

  /**
   * GET /api/internal/agent/heartbeat
   * Agent calls this every 60s to confirm VPS connectivity and get market status.
   */
  @Get('heartbeat')
  getHeartbeat() {
    return this.agentService.getHeartbeat();
  }

  /**
   * GET /api/internal/agent/pending-trades
   * Returns all APPROVED pending orders for the agent to execute.
   */
  @Get('pending-trades')
  async getPendingTrades() {
    return this.agentService.getPendingTrades();
  }

  /**
   * POST /api/internal/agent/report-execution
   * Agent reports the result of a trade execution attempt.
   */
  @Post('report-execution')
  async reportExecution(@Body() dto: ExecutionReportDto) {
    return this.agentService.reportExecution(dto);
  }

  /**
   * POST /api/internal/agent/sync-portfolio
   * Agent pushes fresh portfolio data scraped from ATrad.
   */
  @Post('sync-portfolio')
  async syncPortfolio(@Body() dto: PortfolioSyncDto) {
    return this.agentService.syncPortfolio(dto);
  }

  /**
   * GET /api/internal/agent/sync-trigger
   * Agent polls this to check if VPS has requested a portfolio sync.
   */
  @Get('sync-trigger')
  async getSyncTrigger() {
    return this.agentService.getSyncTrigger();
  }

  /**
   * POST /api/internal/agent/order-status-update
   * Agent reports ATrad blotter status changes detected by polling.
   * Triggers OCO cancellation if a linked order is FILLED.
   */
  @Post('order-status-update')
  async updateOrderStatus(@Body() dto: OrderStatusUpdateDto) {
    return this.agentService.updateOrderStatus(dto);
  }
}
