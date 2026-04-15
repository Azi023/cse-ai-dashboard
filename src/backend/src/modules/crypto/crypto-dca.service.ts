import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { CryptoDCAConfig } from '../../entities/crypto-dca-config.entity';
import { CryptoDCAExecution } from '../../entities/crypto-dca-execution.entity';
import { CryptoService } from './crypto.service';
import { CreateDCADto } from './dto/dca.dto';

// ── Default seed plans ─────────────────────────────────────────────────────

const DEFAULT_PLANS: Array<{
  symbol: string;
  amount_usdt: number;
  frequency: string;
}> = [
  { symbol: 'BTC/USDT', amount_usdt: 50, frequency: 'weekly' },
  { symbol: 'ETH/USDT', amount_usdt: 25, frequency: 'weekly' },
];

// ── Performance summary shape ──────────────────────────────────────────────

export interface DCAPlanPerformance {
  id: number;
  symbol: string;
  frequency: string;
  amount_usdt: number;
  total_invested: number;
  total_units_bought: number;
  average_cost: number;
  current_price: number;
  current_value: number;
  unrealized_pnl: number;
  pnl_pct: number;
  last_execution: Date | null;
}

@Injectable()
export class CryptoDCAService implements OnModuleInit {
  private readonly logger = new Logger(CryptoDCAService.name);

  constructor(
    @InjectRepository(CryptoDCAConfig)
    private readonly configRepo: Repository<CryptoDCAConfig>,
    @InjectRepository(CryptoDCAExecution)
    private readonly executionRepo: Repository<CryptoDCAExecution>,
    private readonly cryptoService: CryptoService,
  ) {}

  // ── Lifecycle ──────────────────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    const existing = await this.configRepo.count();
    if (existing > 0) return;

    const today = new Date().toISOString().split('T')[0];
    for (const seed of DEFAULT_PLANS) {
      await this.configRepo.save(
        this.configRepo.create({ ...seed, start_date: today }),
      );
      this.logger.log(
        `Seeded default DCA plan: ${seed.symbol} $${seed.amount_usdt}/${seed.frequency}`,
      );
    }
  }

  // ── CRUD ───────────────────────────────────────────────────────────────

  /**
   * Create a new DCA plan after Shariah validation.
   *
   * @param dto Validated CreateDCADto from the request body.
   * @returns The persisted CryptoDCAConfig row.
   */
  async createPlan(dto: CreateDCADto): Promise<CryptoDCAConfig> {
    if (!this.cryptoService.isShariahCompliant(dto.symbol)) {
      throw new BadRequestException(
        `${dto.symbol} is not Shariah-compliant. Allowed: ${this.cryptoService.getShariahWhitelist().join(', ')}`,
      );
    }

    const today = new Date().toISOString().split('T')[0];
    const config = this.configRepo.create({
      symbol: dto.symbol,
      amount_usdt: dto.amountUsdt,
      frequency: dto.frequency,
      start_date: today,
    });

    return this.configRepo.save(config);
  }

  /**
   * Return all DCA plans (active and paused).
   */
  async getPlans(): Promise<CryptoDCAConfig[]> {
    return this.configRepo.find({ order: { created_at: 'ASC' } });
  }

  /**
   * Return a single DCA plan with its execution history.
   *
   * @param id Plan primary key.
   */
  async getPlanById(
    id: number,
  ): Promise<{ config: CryptoDCAConfig; executions: CryptoDCAExecution[] }> {
    const config = await this.configRepo.findOne({ where: { id } });
    if (!config) {
      throw new NotFoundException(`DCA plan #${id} not found`);
    }

    const executions = await this.executionRepo.find({
      where: { config_id: id },
      order: { executed_at: 'DESC' },
    });

    return { config, executions };
  }

  /**
   * Pause an active DCA plan.
   *
   * @param id Plan primary key.
   */
  async pausePlan(id: number): Promise<CryptoDCAConfig> {
    const config = await this.configRepo.findOne({ where: { id } });
    if (!config) {
      throw new NotFoundException(`DCA plan #${id} not found`);
    }

    const updated = { ...config, is_active: false };
    return this.configRepo.save(updated);
  }

  /**
   * Resume a paused DCA plan.
   *
   * @param id Plan primary key.
   */
  async resumePlan(id: number): Promise<CryptoDCAConfig> {
    const config = await this.configRepo.findOne({ where: { id } });
    if (!config) {
      throw new NotFoundException(`DCA plan #${id} not found`);
    }

    const updated = { ...config, is_active: true };
    return this.configRepo.save(updated);
  }

  /**
   * Delete a DCA plan and all its execution history.
   *
   * @param id Plan primary key.
   */
  async deletePlan(id: number): Promise<{ deleted: boolean }> {
    const config = await this.configRepo.findOne({ where: { id } });
    if (!config) {
      throw new NotFoundException(`DCA plan #${id} not found`);
    }

    await this.executionRepo.delete({ config_id: id });
    await this.configRepo.delete({ id });

    return { deleted: true };
  }

  // ── Execution ──────────────────────────────────────────────────────────

  /**
   * Execute a single DCA purchase for the given config.
   *
   * Fetches the live price, converts USDT amount → units, calls paperBuy,
   * records the execution, and updates the config's running totals.
   *
   * @param config Active DCA config row to execute.
   */
  async executeDCA(config: CryptoDCAConfig): Promise<CryptoDCAExecution> {
    const ticker = await this.cryptoService.fetchTicker(config.symbol);
    const price = ticker.price;
    const amountUsdt = Number(config.amount_usdt);
    const units = amountUsdt / price;

    // Paper buy (units as the crypto amount)
    await this.cryptoService.paperBuy(config.symbol, units);

    // Cumulative totals after this execution
    const prevInvested = Number(config.total_invested);
    const prevUnits = Number(config.total_units_bought);
    const cumulativeInvested = prevInvested + amountUsdt;
    const cumulativeUnits = prevUnits + units;
    const averageCostAfter =
      cumulativeUnits > 0 ? cumulativeInvested / cumulativeUnits : 0;

    // Persist execution record (immutable snapshot)
    const execution = this.executionRepo.create({
      config_id: config.id,
      symbol: config.symbol,
      amount_usdt: amountUsdt,
      price_at_execution: price,
      units_bought: units,
      cumulative_units: cumulativeUnits,
      cumulative_invested: cumulativeInvested,
      average_cost_after: averageCostAfter,
    });
    const savedExecution = await this.executionRepo.save(execution);

    // Update config running totals (immutable update via object spread)
    const updatedConfig: CryptoDCAConfig = {
      ...config,
      last_execution: savedExecution.executed_at,
      total_invested: cumulativeInvested,
      total_units_bought: cumulativeUnits,
      average_cost: averageCostAfter,
    };
    await this.configRepo.save(updatedConfig);

    this.logger.log(
      `DCA executed: ${config.symbol} $${amountUsdt} @ ${price} = ${units.toFixed(8)} units (avg cost: ${averageCostAfter.toFixed(2)})`,
    );

    return savedExecution;
  }

  // ── Performance ────────────────────────────────────────────────────────

  /**
   * Calculate unrealized P&L for each active DCA plan.
   * Returns { plans, totals } wrapper for the frontend.
   */
  async getPerformanceSummary(): Promise<{
    plans: DCAPlanPerformance[];
    totals: {
      totalInvested: number;
      currentValue: number;
      unrealizedPnl: number;
      pnlPct: number;
    };
  }> {
    const plans = await this.configRepo.find({
      where: { is_active: true },
      order: { created_at: 'ASC' },
    });

    const results: DCAPlanPerformance[] = [];

    for (const plan of plans) {
      let currentPrice = 0;
      try {
        const ticker = await this.cryptoService.fetchTicker(plan.symbol);
        currentPrice = ticker.price;
      } catch (err) {
        this.logger.warn(
          `Could not fetch price for ${plan.symbol}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      const totalInvested = Number(plan.total_invested);
      const totalUnits = Number(plan.total_units_bought);
      const currentValue = totalUnits * currentPrice;
      const unrealizedPnl = currentValue - totalInvested;
      const pnlPct =
        totalInvested > 0 ? (unrealizedPnl / totalInvested) * 100 : 0;

      results.push({
        id: plan.id,
        symbol: plan.symbol,
        frequency: plan.frequency,
        amount_usdt: Number(plan.amount_usdt),
        total_invested: totalInvested,
        total_units_bought: totalUnits,
        average_cost: Number(plan.average_cost),
        current_price: currentPrice,
        current_value: currentValue,
        unrealized_pnl: unrealizedPnl,
        pnl_pct: pnlPct,
        last_execution: plan.last_execution,
      });
    }

    const totals = results.reduce(
      (acc, p) => ({
        totalInvested: acc.totalInvested + p.total_invested,
        currentValue: acc.currentValue + p.current_value,
        unrealizedPnl: acc.unrealizedPnl + p.unrealized_pnl,
        pnlPct: 0,
      }),
      { totalInvested: 0, currentValue: 0, unrealizedPnl: 0, pnlPct: 0 },
    );
    totals.pnlPct =
      totals.totalInvested > 0
        ? (totals.unrealizedPnl / totals.totalInvested) * 100
        : 0;

    return { plans: results, totals };
  }

  // ── Cron ───────────────────────────────────────────────────────────────

  /**
   * Daily DCA execution check at 08:00 UTC (13:30 SLT).
   *
   * Frequency rules:
   *   daily    — execute every day
   *   weekly   — execute on Mondays (UTC day 1)
   *   biweekly — execute on even-ISO-week Mondays
   */
  @Cron('0 0 8 * * *') // 08:00 UTC = 13:30 SLT
  async runDCACron(): Promise<void> {
    const today = new Date();
    const dayOfWeek = today.getUTCDay(); // 0=Sun, 1=Mon
    const isMonday = dayOfWeek === 1;
    const weekNumber = Math.floor(
      (today.getTime() - new Date(today.getFullYear(), 0, 1).getTime()) /
        (7 * 86_400_000),
    );
    const isEvenWeek = weekNumber % 2 === 0;

    const activePlans = await this.configRepo.find({
      where: { is_active: true },
    });

    for (const plan of activePlans) {
      const shouldExecute =
        plan.frequency === 'daily' ||
        (plan.frequency === 'weekly' && isMonday) ||
        (plan.frequency === 'biweekly' && isMonday && isEvenWeek);

      if (!shouldExecute) continue;

      try {
        const result = await this.executeDCA(plan);
        this.logger.log(
          `Cron DCA success: plan #${plan.id} ${plan.symbol} execution #${result.id}`,
        );
      } catch (err) {
        this.logger.error(
          `Cron DCA failed for plan #${plan.id} ${plan.symbol}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}
