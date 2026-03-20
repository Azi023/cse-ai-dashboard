import {
  Injectable,
  Logger,
  OnModuleInit,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { DemoAccount } from './entities/demo-account.entity';
import { DemoTrade } from './entities/demo-trade.entity';
import { DemoHolding } from './entities/demo-holding.entity';
import { DemoDailySnapshot } from './entities/demo-daily-snapshot.entity';
import { DemoBenchmark } from './entities/demo-benchmark.entity';
import { Stock } from '../entities/stock.entity';
import { DailyPrice } from '../entities/daily-price.entity';
import { RedisService } from '../modules/cse-data/redis.service';
import { CreateDemoAccountDto } from './dto/create-demo-account.dto';
import { CreateDemoTradeDto } from './dto/create-demo-trade.dto';
import { DemoQueryDto } from './dto/demo-query.dto';
import { calculateNetBuy, calculateNetSell } from './utils/fee-calculator';

@Injectable()
export class DemoService implements OnModuleInit {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    @InjectRepository(DemoAccount)
    private readonly accountRepo: Repository<DemoAccount>,
    @InjectRepository(DemoTrade)
    private readonly tradeRepo: Repository<DemoTrade>,
    @InjectRepository(DemoHolding)
    private readonly holdingRepo: Repository<DemoHolding>,
    @InjectRepository(DemoDailySnapshot)
    private readonly snapshotRepo: Repository<DemoDailySnapshot>,
    @InjectRepository(DemoBenchmark)
    private readonly benchmarkRepo: Repository<DemoBenchmark>,
    @InjectRepository(Stock)
    private readonly stockRepo: Repository<Stock>,
    @InjectRepository(DailyPrice)
    private readonly dailyPriceRepo: Repository<DailyPrice>,
    private readonly redisService: RedisService,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaultAccount();
  }

  private async seedDefaultAccount(): Promise<void> {
    const existing = await this.accountRepo.count();
    if (existing > 0) return;

    await this.accountRepo.save({
      name: 'Default Demo',
      initial_capital: 1000000.0,
      cash_balance: 1000000.0,
      total_fees_paid: 0,
      strategy: 'rca',
      is_active: true,
    });

    this.logger.log('Demo account seeded: Default Demo (LKR 1,000,000)');
  }

  // ─── Account Management ────────────────────────────────────────────────────

  async getAccounts(): Promise<DemoAccount[]> {
    return this.accountRepo.find({
      where: { is_active: true },
      order: { created_at: 'ASC' },
    });
  }

  async getAccount(id: number) {
    const account = await this.accountRepo.findOneBy({ id });
    if (!account) throw new NotFoundException(`Demo account ${id} not found`);

    const holdings = await this.holdingRepo.find({
      where: { demo_account_id: id },
    });
    let holdingsValue = 0;
    for (const h of holdings) {
      const price = await this.getCurrentPrice(h.symbol, h.stock_id);
      holdingsValue +=
        (price ?? parseFloat(String(h.avg_cost_basis))) *
        parseFloat(String(h.quantity));
    }

    const cashBalance = parseFloat(String(account.cash_balance));
    const totalValue = cashBalance + holdingsValue;
    const initialCapital = parseFloat(String(account.initial_capital));
    const totalReturnPct =
      initialCapital > 0
        ? ((totalValue - initialCapital) / initialCapital) * 100
        : 0;

    return {
      ...account,
      holdings_value: holdingsValue,
      total_value: totalValue,
      portfolio_value: holdingsValue,
      total_return_pct: totalReturnPct,
    };
  }

  async createAccount(dto: CreateDemoAccountDto): Promise<DemoAccount> {
    const capital = dto.initial_capital ?? 1000000;
    return this.accountRepo.save({
      name: dto.name ?? 'New Demo Account',
      initial_capital: capital,
      cash_balance: capital,
      total_fees_paid: 0,
      strategy: dto.strategy ?? null,
      is_active: true,
    });
  }

  async resetAccount(id: number): Promise<DemoAccount> {
    const account = await this.accountRepo.findOneBy({ id });
    if (!account) throw new NotFoundException(`Demo account ${id} not found`);

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(DemoTrade, { demo_account_id: id });
      await manager.delete(DemoHolding, { demo_account_id: id });
      await manager.delete(DemoDailySnapshot, { demo_account_id: id });
      await manager.delete(DemoBenchmark, { demo_account_id: id });
      account.cash_balance = parseFloat(String(account.initial_capital));
      account.total_fees_paid = 0;
      await manager.save(DemoAccount, account);
    });

    return account;
  }

  // ─── Trade Execution ───────────────────────────────────────────────────────

  async executeTrade(dto: CreateDemoTradeDto): Promise<DemoTrade> {
    const account = await this.accountRepo.findOneBy({
      id: dto.demo_account_id,
    });
    if (!account) throw new NotFoundException('Demo account not found');
    if (!account.is_active)
      throw new BadRequestException('Demo account is not active');

    const stock = await this.stockRepo.findOneBy({ symbol: dto.symbol });
    if (!stock)
      throw new BadRequestException(
        `Stock ${dto.symbol} not found in database`,
      );

    const price = await this.getCurrentPrice(dto.symbol, stock.id);
    if (!price || price <= 0)
      throw new BadRequestException(
        `No price data available for ${dto.symbol}`,
      );

    const shariahStatus = this.mapShariahStatus(stock.shariah_status);
    const aspi = await this.getCurrentAspi();

    if (dto.direction === 'BUY') {
      return this.executeBuy(dto, account, stock, price, shariahStatus, aspi);
    }
    return this.executeSell(dto, account, stock, price, shariahStatus, aspi);
  }

  private async executeBuy(
    dto: CreateDemoTradeDto,
    account: DemoAccount,
    stock: Stock,
    price: number,
    shariahStatus: string,
    aspi: number,
  ): Promise<DemoTrade> {
    const { totalValue, fee, netValue } = calculateNetBuy(dto.quantity, price);
    const cashBalance = parseFloat(String(account.cash_balance));

    if (cashBalance < netValue) {
      throw new BadRequestException(
        `Insufficient demo funds. Need LKR ${netValue.toFixed(2)}, have LKR ${cashBalance.toFixed(2)}`,
      );
    }

    // Concentration cap: single stock ≤ 40% of portfolio value
    const portfolioValue = await this.getPortfolioValue(
      dto.demo_account_id,
      account,
    );
    const existingHolding = await this.holdingRepo.findOne({
      where: { demo_account_id: dto.demo_account_id, stock_id: stock.id },
    });
    const existingValue = existingHolding
      ? price * parseFloat(String(existingHolding.quantity))
      : 0;
    if (
      portfolioValue > 0 &&
      (existingValue + totalValue) / portfolioValue > 0.4
    ) {
      throw new BadRequestException(
        'This trade would exceed the 40% single-stock concentration cap',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      // Update account balances
      account.cash_balance = cashBalance - netValue;
      account.total_fees_paid =
        parseFloat(String(account.total_fees_paid)) + fee;
      await manager.save(DemoAccount, account);

      // Upsert holding — weighted average cost basis including fees
      const newCostPerShare = netValue / dto.quantity;
      const existing = await manager.findOne(DemoHolding, {
        where: { demo_account_id: dto.demo_account_id, stock_id: stock.id },
      });

      if (existing) {
        const oldQty = parseFloat(String(existing.quantity));
        const oldCost = parseFloat(String(existing.avg_cost_basis));
        const newQty = oldQty + dto.quantity;
        existing.avg_cost_basis =
          (oldCost * oldQty + newCostPerShare * dto.quantity) / newQty;
        existing.quantity = newQty;
        existing.total_invested =
          parseFloat(String(existing.total_invested)) + netValue;
        await manager.save(DemoHolding, existing);
      } else {
        const holding = manager.create(DemoHolding, {
          demo_account_id: dto.demo_account_id,
          stock_id: stock.id,
          symbol: dto.symbol,
          quantity: dto.quantity,
          avg_cost_basis: newCostPerShare,
          total_invested: netValue,
          realized_pnl: 0,
          shariah_status: shariahStatus,
        });
        await manager.save(DemoHolding, holding);
      }

      const trade = manager.create(DemoTrade, {
        demo_account_id: dto.demo_account_id,
        stock_id: stock.id,
        symbol: dto.symbol,
        direction: 'BUY',
        quantity: dto.quantity,
        price,
        total_value: totalValue,
        fee,
        net_value: netValue,
        source: dto.source ?? 'MANUAL',
        ai_reasoning: dto.ai_reasoning ?? null,
        shariah_status: shariahStatus,
        market_snapshot: { aspi },
        executed_at: new Date(),
      });
      return manager.save(DemoTrade, trade);
    });
  }

  private async executeSell(
    dto: CreateDemoTradeDto,
    account: DemoAccount,
    stock: Stock,
    price: number,
    shariahStatus: string,
    aspi: number,
  ): Promise<DemoTrade> {
    const holding = await this.holdingRepo.findOne({
      where: { demo_account_id: dto.demo_account_id, stock_id: stock.id },
    });
    const heldQty = parseFloat(String(holding?.quantity ?? 0));

    if (!holding || heldQty < dto.quantity) {
      throw new BadRequestException(
        `Insufficient shares. Hold ${heldQty.toFixed(0)}, selling ${dto.quantity}`,
      );
    }

    const { totalValue, fee, netValue } = calculateNetSell(dto.quantity, price);
    const avgCost = parseFloat(String(holding.avg_cost_basis));
    const realizedPnl = (price - avgCost) * dto.quantity - fee;

    return this.dataSource.transaction(async (manager) => {
      account.cash_balance =
        parseFloat(String(account.cash_balance)) + netValue;
      account.total_fees_paid =
        parseFloat(String(account.total_fees_paid)) + fee;
      await manager.save(DemoAccount, account);

      const newQty = heldQty - dto.quantity;
      if (newQty === 0) {
        await manager.delete(DemoHolding, holding.id);
      } else {
        holding.quantity = newQty;
        holding.realized_pnl =
          parseFloat(String(holding.realized_pnl)) + realizedPnl;
        await manager.save(DemoHolding, holding);
      }

      const trade = manager.create(DemoTrade, {
        demo_account_id: dto.demo_account_id,
        stock_id: stock.id,
        symbol: dto.symbol,
        direction: 'SELL',
        quantity: dto.quantity,
        price,
        total_value: totalValue,
        fee,
        net_value: netValue,
        source: dto.source ?? 'MANUAL',
        ai_reasoning: dto.ai_reasoning ?? null,
        shariah_status: shariahStatus,
        market_snapshot: { aspi, realized_pnl: realizedPnl },
        executed_at: new Date(),
      });
      return manager.save(DemoTrade, trade);
    });
  }

  // ─── Holdings & Performance ────────────────────────────────────────────────

  async getHoldings(accountId: number) {
    const holdings = await this.holdingRepo.find({
      where: { demo_account_id: accountId },
      order: { symbol: 'ASC' },
    });

    const result = [];
    for (const h of holdings) {
      const price = await this.getCurrentPrice(h.symbol, h.stock_id);
      const currentPrice = price ?? parseFloat(String(h.avg_cost_basis));
      const qty = parseFloat(String(h.quantity));
      const avgCost = parseFloat(String(h.avg_cost_basis));
      const marketValue = currentPrice * qty;
      const unrealizedPnl = (currentPrice - avgCost) * qty;
      const pnlPct =
        avgCost > 0 ? ((currentPrice - avgCost) / avgCost) * 100 : 0;

      result.push({
        ...h,
        avg_cost_basis: avgCost,
        quantity: qty,
        total_invested: parseFloat(String(h.total_invested)),
        realized_pnl: parseFloat(String(h.realized_pnl)),
        current_price: currentPrice,
        market_value: marketValue,
        unrealized_pnl: unrealizedPnl,
        pnl_pct: pnlPct,
      });
    }
    return result;
  }

  async getPerformance(accountId: number) {
    const account = await this.accountRepo.findOneBy({ id: accountId });
    if (!account)
      throw new NotFoundException(`Demo account ${accountId} not found`);

    const holdings = await this.holdingRepo.find({
      where: { demo_account_id: accountId },
    });
    let holdingsValue = 0;
    let compliantCount = 0;
    for (const h of holdings) {
      const price = await this.getCurrentPrice(h.symbol, h.stock_id);
      holdingsValue +=
        (price ?? parseFloat(String(h.avg_cost_basis))) *
        parseFloat(String(h.quantity));
      if (h.shariah_status === 'COMPLIANT') compliantCount++;
    }

    const cashBalance = parseFloat(String(account.cash_balance));
    const totalValue = cashBalance + holdingsValue;
    const initialCapital = parseFloat(String(account.initial_capital));
    const totalReturn = totalValue - initialCapital;
    const returnPct =
      initialCapital > 0 ? (totalReturn / initialCapital) * 100 : 0;

    const allTrades = await this.tradeRepo.find({
      where: { demo_account_id: accountId },
    });
    const sells = allTrades.filter((t) => t.direction === 'SELL');
    const profitableSells = sells.filter((t) => {
      const snap = t.market_snapshot as { realized_pnl?: number } | null;
      return (snap?.realized_pnl ?? 0) > 0;
    });
    const totalRealizedPnl = sells.reduce((sum, t) => {
      const snap = t.market_snapshot as { realized_pnl?: number } | null;
      return sum + (snap?.realized_pnl ?? 0);
    }, 0);

    return {
      total_value: totalValue,
      cash_balance: cashBalance,
      holdings_value: holdingsValue,
      total_return: totalReturn,
      return_pct: returnPct,
      win_rate:
        sells.length > 0 ? (profitableSells.length / sells.length) * 100 : 0,
      total_trades: allTrades.length,
      total_sell_trades: sells.length,
      profitable_trades: profitableSells.length,
      avg_return_per_trade:
        sells.length > 0 ? totalRealizedPnl / sells.length : 0,
      total_fees: parseFloat(String(account.total_fees_paid)),
      shariah_compliance:
        holdings.length > 0 ? (compliantCount / holdings.length) * 100 : 100,
    };
  }

  async getTradeHistory(
    accountId: number,
    query: DemoQueryDto,
  ): Promise<{ trades: DemoTrade[]; total: number; page: number }> {
    if (!accountId) return { trades: [], total: 0, page: 1 };

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const qb = this.tradeRepo
      .createQueryBuilder('t')
      .where('t.demo_account_id = :accountId', { accountId })
      .orderBy('t.executed_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.symbol)
      qb.andWhere('t.symbol = :symbol', { symbol: query.symbol });
    if (query.dateFrom)
      qb.andWhere('t.executed_at >= :dateFrom', { dateFrom: query.dateFrom });
    if (query.dateTo)
      qb.andWhere('t.executed_at <= :dateTo', { dateTo: query.dateTo });

    const [trades, total] = await qb.getManyAndCount();
    return { trades, total, page };
  }

  // ─── Snapshots & Benchmarks ────────────────────────────────────────────────

  async captureEODSnapshot(accountId: number): Promise<DemoDailySnapshot> {
    const account = await this.accountRepo.findOneBy({ id: accountId });
    if (!account)
      throw new NotFoundException(`Demo account ${accountId} not found`);

    const holdings = await this.holdingRepo.find({
      where: { demo_account_id: accountId },
    });
    let holdingsValue = 0;
    for (const h of holdings) {
      const price = await this.getCurrentPrice(h.symbol, h.stock_id);
      holdingsValue +=
        (price ?? parseFloat(String(h.avg_cost_basis))) *
        parseFloat(String(h.quantity));
    }

    const cashBalance = parseFloat(String(account.cash_balance));
    const portfolioValue = cashBalance + holdingsValue;
    const initialCapital = parseFloat(String(account.initial_capital));
    const totalReturnPct =
      initialCapital > 0
        ? ((portfolioValue - initialCapital) / initialCapital) * 100
        : 0;

    const aspi = await this.getCurrentAspi();

    // Calculate ASPI return since account creation
    const initialAspiKey = `demo:initial-aspi:${accountId}`;
    let aspiReturnPct = 0;
    const initialAspiData = await this.redisService.getJson<{ value: number }>(
      initialAspiKey,
    );
    if (!initialAspiData && aspi > 0) {
      await this.redisService.setJson(
        initialAspiKey,
        { value: aspi },
        365 * 24 * 3600,
      );
    } else if (initialAspiData?.value && aspi > 0) {
      aspiReturnPct =
        ((aspi - initialAspiData.value) / initialAspiData.value) * 100;
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const tradesToday = await this.tradeRepo
      .createQueryBuilder('t')
      .where('t.demo_account_id = :id', { id: accountId })
      .andWhere("DATE(t.executed_at AT TIME ZONE 'UTC') = :date", {
        date: todayStr,
      })
      .getCount();

    const snapshot = this.snapshotRepo.create({
      demo_account_id: accountId,
      snapshot_date: today,
      portfolio_value: portfolioValue,
      cash_balance: cashBalance,
      holdings_value: holdingsValue,
      total_return_pct: totalReturnPct,
      aspi_value: aspi,
      aspi_return_pct: aspiReturnPct,
      num_holdings: holdings.length,
      trades_today: tradesToday,
    });

    return this.snapshotRepo.save(snapshot);
  }

  async getBenchmarks(accountId: number): Promise<DemoBenchmark[]> {
    return this.benchmarkRepo.find({
      where: { demo_account_id: accountId },
      order: { benchmark_date: 'DESC' },
      take: 90,
    });
  }

  async getSnapshots(accountId: number): Promise<DemoDailySnapshot[]> {
    return this.snapshotRepo.find({
      where: { demo_account_id: accountId },
      order: { snapshot_date: 'ASC' },
    });
  }

  // ─── AI Trading (Phase 3 stubs) ────────────────────────────────────────────

  async triggerAITrade(accountId: number) {
    return {
      message:
        'AI trade cycle triggered. Full AI auto-trading coming in Phase 3.',
      accountId,
    };
  }

  async getAILog(accountId: number) {
    const trades = await this.tradeRepo.find({
      where: {
        demo_account_id: accountId,
        source: In(['AI_SIGNAL', 'AI_AUTO']),
      },
      order: { executed_at: 'DESC' },
      take: 50,
    });
    return { trades, total: trades.length };
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private async getCurrentPrice(
    symbol: string,
    stockId: number,
  ): Promise<number | null> {
    // 1. Try Redis live trade summary
    try {
      const tradeSummary = await this.redisService.getJson<{
        reqTradeSummery?: Array<{ symbol?: string; price?: number }>;
      }>('cse:trade_summary');
      const match = tradeSummary?.reqTradeSummery?.find(
        (t) => t.symbol === symbol,
      );
      if (match?.price != null && Number(match.price) > 0) {
        return Number(match.price);
      }
    } catch {
      // Redis unavailable — fall through
    }

    // 2. Try stock.last_price from DB
    const stock = await this.stockRepo.findOneBy({ id: stockId });
    if (stock?.last_price != null && Number(stock.last_price) > 0) {
      return parseFloat(String(stock.last_price));
    }

    // 3. Try most recent daily_prices close
    const rows = await this.dailyPriceRepo.find({
      where: { stock_id: stockId },
      order: { trade_date: 'DESC' },
      take: 1,
    });
    if (rows.length > 0 && rows[0].close) {
      return parseFloat(String(rows[0].close));
    }

    return null;
  }

  private async getCurrentAspi(): Promise<number> {
    try {
      const aspi = await this.redisService.getJson<{ value?: number }>(
        'cse:aspi_data',
      );
      return Number(aspi?.value ?? 0);
    } catch {
      return 0;
    }
  }

  private async getPortfolioValue(
    accountId: number,
    account: DemoAccount,
  ): Promise<number> {
    const holdings = await this.holdingRepo.find({
      where: { demo_account_id: accountId },
    });
    let holdingsValue = 0;
    for (const h of holdings) {
      const price = await this.getCurrentPrice(h.symbol, h.stock_id);
      holdingsValue +=
        (price ?? parseFloat(String(h.avg_cost_basis))) *
        parseFloat(String(h.quantity));
    }
    return parseFloat(String(account.cash_balance)) + holdingsValue;
  }

  private mapShariahStatus(status: string): string {
    if (status === 'compliant') return 'COMPLIANT';
    if (status === 'non_compliant' || status === 'blacklisted')
      return 'NON_COMPLIANT';
    return 'PENDING';
  }
}
