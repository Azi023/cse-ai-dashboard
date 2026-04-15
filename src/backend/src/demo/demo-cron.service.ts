import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DemoAccount } from './entities/demo-account.entity';
import { DemoHolding } from './entities/demo-holding.entity';
import { DemoTrade } from './entities/demo-trade.entity';
import { DemoDailySnapshot } from './entities/demo-daily-snapshot.entity';
import { DemoBenchmark } from './entities/demo-benchmark.entity';
import { Stock } from '../entities/stock.entity';
import { Announcement } from '../entities/announcement.entity';
import { RedisService } from '../modules/cse-data/redis.service';
import { DemoService } from './demo.service';
import { DemoAITraderService } from './demo-ai-trader.service';

const RANDOM_PORTFOLIO_KEY = (id: number) => `demo:random-portfolio:${id}`;

interface RandomPortfolio {
  symbols: string[];
  initial_prices: Record<string, number>;
  initialized_at: string;
}

@Injectable()
export class DemoCronService {
  private readonly logger = new Logger(DemoCronService.name);

  constructor(
    @InjectRepository(DemoAccount)
    private readonly accountRepo: Repository<DemoAccount>,
    @InjectRepository(DemoHolding)
    private readonly holdingRepo: Repository<DemoHolding>,
    @InjectRepository(DemoTrade)
    private readonly tradeRepo: Repository<DemoTrade>,
    @InjectRepository(DemoDailySnapshot)
    private readonly snapshotRepo: Repository<DemoDailySnapshot>,
    @InjectRepository(DemoBenchmark)
    private readonly benchmarkRepo: Repository<DemoBenchmark>,
    @InjectRepository(Stock)
    private readonly stockRepo: Repository<Stock>,
    @InjectRepository(Announcement)
    private readonly announcementRepo: Repository<Announcement>,
    private readonly redisService: RedisService,
    private readonly demoService: DemoService,
    private readonly aiTraderService: DemoAITraderService,
  ) {}

  // ─── AI Demo Trader — every 30 min, 9:30 AM–2:00 PM SLT ─────────────────────
  // VPS timezone is Asia/Colombo — cron times are SLT directly.

  @Cron('0,30 9-14 * * 1-5')
  async runAITrader(): Promise<void> {
    // Only trade if market is open (check Redis market status)
    const marketStatus = await this.redisService.getJson<{ isOpen?: boolean }>(
      'cse:market_status',
    );
    if (marketStatus?.isOpen === false) {
      this.logger.debug('AI trader: market closed, skipping.');
      return;
    }

    const accounts = await this.accountRepo.find({
      where: { is_active: true },
    });
    this.logger.log(`AI trader cron: evaluating ${accounts.length} account(s)`);

    for (const account of accounts) {
      try {
        const decisions = await this.aiTraderService.evaluateAndTrade(
          account.id,
        );
        const trades = decisions.filter((d) => d.action !== 'NO_TRADE');
        this.logger.log(
          `Account ${account.id}: ${trades.length} trade(s) executed, ` +
            `${decisions.length - trades.length} skipped.`,
        );
      } catch (err) {
        this.logger.error(`AI trader failed for account ${account.id}: ${err}`);
      }
    }
  }

  // ─── EOD Snapshot — 2:36 PM SLT, weekdays ────────────────────────────────
  // VPS timezone is Asia/Colombo — cron times are SLT directly.

  @Cron('36 14 * * 1-5')
  async captureEODSnapshot(): Promise<void> {
    const accounts = await this.accountRepo.find({
      where: { is_active: true },
    });
    this.logger.log(
      `EOD snapshot cron: processing ${accounts.length} account(s)`,
    );

    for (const account of accounts) {
      try {
        await this.demoService.captureEODSnapshot(account.id);
        this.logger.log(`EOD snapshot captured for account ${account.id}`);
      } catch (err) {
        this.logger.error(
          `EOD snapshot failed for account ${account.id}: ${err}`,
        );
      }
    }
  }

  // ─── Benchmark Update — 2:37 PM SLT, weekdays ───────────────────────────
  // VPS timezone is Asia/Colombo — cron times are SLT directly.

  @Cron('37 14 * * 1-5')
  async updateBenchmarks(): Promise<void> {
    const accounts = await this.accountRepo.find({
      where: { is_active: true },
    });
    this.logger.log(
      `Benchmark update cron: processing ${accounts.length} account(s)`,
    );

    for (const account of accounts) {
      try {
        await this.updateBenchmarksForAccount(account.id);
      } catch (err) {
        this.logger.error(
          `Benchmark update failed for account ${account.id}: ${err}`,
        );
      }
    }
  }

  // ─── Dividend Simulator — Fridays 3:30 PM SLT ───────────────────────────
  // VPS timezone is Asia/Colombo — cron times are SLT directly.

  @Cron('30 15 * * 5')
  async simulateDividends(): Promise<void> {
    const accounts = await this.accountRepo.find({
      where: { is_active: true },
    });
    if (accounts.length === 0) return;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const dividendAnnouncements = await this.announcementRepo
      .createQueryBuilder('a')
      .where('a.category = :cat', { cat: 'dividend' })
      .andWhere('a.announced_at >= :since', { since: sevenDaysAgo })
      .andWhere('a.symbol IS NOT NULL')
      .getMany();

    if (dividendAnnouncements.length === 0) {
      this.logger.debug('Dividend sim: no dividend announcements this week.');
      return;
    }

    for (const account of accounts) {
      const holdings = await this.holdingRepo.find({
        where: { demo_account_id: account.id },
      });
      if (holdings.length === 0) continue;

      for (const announcement of dividendAnnouncements) {
        const holding = holdings.find((h) => h.symbol === announcement.symbol);
        if (!holding) continue;

        // Try to extract dividend per share from title/content
        const text = `${announcement.title} ${announcement.content ?? ''}`;
        const match = text.match(
          /(?:LKR|Rs\.?)\s*(\d+(?:\.\d{1,2})?)\s*(?:per\s+share|each)/i,
        );
        if (!match) {
          this.logger.debug(
            `Dividend sim: cannot extract per-share amount from "${announcement.title}". Skipping.`,
          );
          continue;
        }

        const dividendPerShare = parseFloat(match[1]);
        const qty = parseFloat(String(holding.quantity));
        const grossDividend = qty * dividendPerShare;
        const wht = grossDividend * 0.14;
        const netDividend = grossDividend - wht;

        // Credit net dividend to cash balance
        account.cash_balance =
          parseFloat(String(account.cash_balance)) + netDividend;
        await this.accountRepo.save(account);

        this.logger.log(
          `Dividend credited for account ${account.id}: ` +
            `${holding.symbol} × ${qty} × LKR ${dividendPerShare} = ` +
            `LKR ${grossDividend.toFixed(2)} gross, LKR ${netDividend.toFixed(2)} net (14% WHT deducted)`,
        );
      }
    }
  }

  // ─── Public Methods (for manual triggers) ─────────────────────────────────

  async triggerSnapshotForAccount(
    accountId: number,
  ): Promise<DemoDailySnapshot> {
    return this.demoService.captureEODSnapshot(accountId);
  }

  async updateBenchmarksForAccount(accountId: number): Promise<DemoBenchmark> {
    const account = await this.accountRepo.findOneBy({ id: accountId });
    if (!account) throw new Error(`Demo account ${accountId} not found`);

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // AI portfolio value from today's snapshot (or calculate it)
    const todaySnapshot = await this.snapshotRepo.findOne({
      where: { demo_account_id: accountId },
      order: { snapshot_date: 'DESC' },
    });
    const aiPortfolioValue = todaySnapshot
      ? parseFloat(String(todaySnapshot.portfolio_value))
      : parseFloat(String(account.cash_balance));

    const initialCapital = parseFloat(String(account.initial_capital));
    const aiReturnPct =
      initialCapital > 0
        ? ((aiPortfolioValue - initialCapital) / initialCapital) * 100
        : 0;

    // ASPI return
    const aspiReturnPct = todaySnapshot
      ? parseFloat(String(todaySnapshot.aspi_return_pct))
      : 0;

    // Random portfolio return
    const randomReturnPct = await this.getRandomPortfolioReturn(
      accountId,
      account,
    );

    // Sharpe ratio (requires 20+ snapshots)
    const allSnapshots = await this.snapshotRepo.find({
      where: { demo_account_id: accountId },
      order: { snapshot_date: 'ASC' },
    });
    const sharpeRatio =
      allSnapshots.length >= 20
        ? this.calculateSharpe(
            allSnapshots.map((s) => parseFloat(String(s.portfolio_value))),
          )
        : null;

    // Max drawdown
    const maxDrawdown =
      allSnapshots.length >= 2
        ? this.calculateMaxDrawdown(
            allSnapshots.map((s) => parseFloat(String(s.portfolio_value))),
          )
        : null;

    // Win rate from closed trades
    const sells = await this.tradeRepo.find({
      where: { demo_account_id: accountId, direction: 'SELL' },
    });
    const profitableSells = sells.filter((t) => {
      const snap = t.market_snapshot as { realized_pnl?: number } | null;
      return (snap?.realized_pnl ?? 0) > 0;
    });
    const winRate =
      sells.length > 0 ? (profitableSells.length / sells.length) * 100 : null;

    // Upsert: find existing benchmark for today, then update-or-insert
    const existingBenchmark = await this.benchmarkRepo
      .createQueryBuilder('b')
      .where('b.demo_account_id = :id', { id: accountId })
      .andWhere('b.benchmark_date = :date', { date: todayStr })
      .getOne();

    const benchmarkData = {
      demo_account_id: accountId,
      benchmark_date: today,
      ai_portfolio_value: aiPortfolioValue,
      ai_return_pct: aiReturnPct,
      aspi_return_pct: aspiReturnPct,
      random_return_pct: randomReturnPct,
      sharpe_ratio: sharpeRatio,
      max_drawdown: maxDrawdown,
      win_rate: winRate,
    };
    const benchmark = this.benchmarkRepo.create(
      existingBenchmark
        ? { ...existingBenchmark, ...benchmarkData }
        : benchmarkData,
    );
    const saved = await this.benchmarkRepo.save(benchmark);
    this.logger.log(
      `Benchmark updated for account ${accountId}: ` +
        `AI ${aiReturnPct.toFixed(2)}% vs ASPI ${aspiReturnPct.toFixed(2)}% vs Random ${randomReturnPct.toFixed(2)}%`,
    );
    return saved;
  }

  // ─── Private Calculation Helpers ──────────────────────────────────────────

  private async getRandomPortfolioReturn(
    accountId: number,
    account: DemoAccount,
  ): Promise<number> {
    const key = RANDOM_PORTFOLIO_KEY(accountId);
    let portfolio = await this.redisService.getJson<RandomPortfolio>(key);

    // Initialize random portfolio on first benchmark
    if (!portfolio) {
      const compliantStocks = await this.stockRepo
        .createQueryBuilder('s')
        .where('s.shariah_status = :status', { status: 'compliant' })
        .andWhere('s.last_price IS NOT NULL')
        .andWhere('s.last_price > 0')
        .orderBy('RANDOM()')
        .take(4)
        .getMany();

      if (compliantStocks.length === 0) return 0;

      const symbols = compliantStocks.map((s) => s.symbol);
      const initialPrices: Record<string, number> = {};
      for (const s of compliantStocks) {
        initialPrices[s.symbol] = parseFloat(String(s.last_price));
      }

      portfolio = {
        symbols,
        initial_prices: initialPrices,
        initialized_at: new Date(account.created_at)
          .toISOString()
          .split('T')[0],
      };
      await this.redisService.setJson(key, portfolio, 365 * 24 * 3600);
      this.logger.log(
        `Random portfolio initialized for account ${accountId}: ${symbols.join(', ')}`,
      );
      return 0; // No return on day 0
    }

    // Calculate current value vs initial
    let initialValue = 0;
    let currentValue = 0;
    for (const symbol of portfolio.symbols) {
      const initPrice = portfolio.initial_prices[symbol];
      if (!initPrice) continue;

      const stock = await this.stockRepo.findOneBy({ symbol });
      const currentPrice = stock?.last_price
        ? parseFloat(String(stock.last_price))
        : initPrice;

      initialValue += initPrice;
      currentValue += currentPrice;
    }

    if (initialValue === 0) return 0;
    return ((currentValue - initialValue) / initialValue) * 100;
  }

  private calculateSharpe(portfolioValues: number[]): number {
    if (portfolioValues.length < 2) return 0;

    const dailyReturns: number[] = [];
    for (let i = 1; i < portfolioValues.length; i++) {
      const prev = portfolioValues[i - 1];
      if (prev > 0) {
        dailyReturns.push((portfolioValues[i] - prev) / prev);
      }
    }
    if (dailyReturns.length < 2) return 0;

    const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const variance =
      dailyReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) /
      (dailyReturns.length - 1);
    const std = Math.sqrt(variance);

    if (std === 0) return 0;
    // Annualized Sharpe (assuming 240 trading days/year on CSE)
    return (mean / std) * Math.sqrt(240);
  }

  private calculateMaxDrawdown(portfolioValues: number[]): number {
    let peak = portfolioValues[0];
    let maxDrawdown = 0;

    for (const value of portfolioValues) {
      if (value > peak) peak = value;
      const drawdown = peak > 0 ? ((peak - value) / peak) * 100 : 0;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    return -maxDrawdown; // return as negative percentage
  }
}
