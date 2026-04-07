import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Portfolio, Stock, MonthlyDeposit } from '../../entities';
import { RedisService } from '../cse-data/redis.service';
import {
  syncATradPortfolio,
  ATradPortfolio,
  ATradHolding,
} from './atrad-browser';

export interface SyncStatus {
  lastSyncTime: Date | null;
  syncSuccess: boolean;
  holdingsCount: number;
  error?: string;
  buyingPower: number;
  accountValue: number;
  cashBalance: number;
}

@Injectable()
export class ATradSyncService {
  private readonly logger = new Logger(ATradSyncService.name);
  private lastSyncResult: ATradPortfolio | null = null;
  private previousBuyingPower: number | null = null;
  private isSyncing = false;

  constructor(
    @InjectRepository(Portfolio)
    private readonly portfolioRepository: Repository<Portfolio>,
    @InjectRepository(Stock)
    private readonly stockRepository: Repository<Stock>,
    @InjectRepository(MonthlyDeposit)
    private readonly monthlyDepositRepository: Repository<MonthlyDeposit>,
    private readonly redisService: RedisService,
  ) {}

  // ── ATrad VPS crons DISABLED ──
  // ATrad blocks Hetzner datacenter IPs (403 Forbidden).
  // Sync now runs from local WSL2 machine via POST /api/atrad/sync-push.
  // Keeping cron methods commented for reference:
  //
  // @Cron('0 */15 4-8 * * 1-5')  — market hours (every 15min)
  // @Cron('8 9 * * 1-5')         — post-close (2:38 PM SLT)
  // @Cron('0 0 15 * * 1-5')      — post-market (3:00 PM SLT)

  /**
   * Trigger a manual or scheduled ATrad portfolio sync.
   */
  async triggerSync(): Promise<ATradPortfolio> {
    if (this.isSyncing) {
      this.logger.warn('Sync already in progress, skipping...');
      return (
        this.lastSyncResult ?? {
          holdings: [],
          buyingPower: 0,
          accountValue: 0,
          cashBalance: 0,
          lastSynced: new Date(),
          syncSuccess: false,
          error: 'Sync already in progress',
        }
      );
    }

    this.isSyncing = true;
    this.logger.log('Starting ATrad portfolio sync...');

    try {
      const result = await syncATradPortfolio();
      this.lastSyncResult = result;

      if (result.syncSuccess) {
        this.logger.log(
          `Sync successful: ${result.holdings.length} holdings, ` +
            `Buying Power: ${result.buyingPower}, Account Value: ${result.accountValue}`,
        );

        // ATrad returns portfolios:[] after market hours even when holdings exist
        // (accountValue > 0 means we have positions). Preserve previous holdings
        // in that case — only reconcile when we actually received holding data.
        const hasHoldings = result.holdings.length > 0;
        const holdsExistOnServer = result.accountValue > 0;

        if (hasHoldings) {
          await this.reconcilePortfolio(result.holdings);
        } else if (holdsExistOnServer) {
          this.logger.log(
            'ATrad returned 0 holdings but accountValue > 0 — likely after-hours. ' +
              'Preserving previously cached holdings, updating cash/balance only.',
          );
        } else {
          // Genuine empty portfolio
          await this.reconcilePortfolio([]);
        }

        // Detect deposits via buying power changes
        await this.detectDeposit(result.buyingPower);

        // Build cache payload — reuse previous holdings when ATrad returned empty after-hours
        let holdingsToCache = result.holdings;
        if (!hasHoldings && holdsExistOnServer) {
          const prev = await this.redisService.getJson<{
            holdings?: unknown[];
          }>('atrad:last_sync');
          holdingsToCache = (prev?.holdings ?? []) as typeof result.holdings;
        }

        // Cache the result in Redis (24 hour TTL — survives backend restarts)
        await this.redisService.setJson(
          'atrad:last_sync',
          {
            ...result,
            holdings: holdingsToCache,
            syncedAt: result.lastSynced.toISOString(),
            lastSynced: result.lastSynced.toISOString(),
          },
          86400,
        );

        // Store balance separately for quick access by safety checks
        await this.redisService.setJson(
          'atrad:balance',
          {
            cashBalance: result.cashBalance,
            buyingPower: result.buyingPower,
            accountValue: result.accountValue,
            syncedAt: result.lastSynced.toISOString(),
          },
          86400,
        );

        // Cache holdings separately for quick access (5 min TTL during market, 24h otherwise)
        await this.redisService.setJson(
          'atrad:holdings',
          holdingsToCache,
          hasHoldings ? 300 : 86400,
        );
      } else {
        this.logger.error(`Sync failed: ${result.error}`);
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`Sync error: ${errorMessage}`);
      const failResult: ATradPortfolio = {
        holdings: [],
        buyingPower: 0,
        accountValue: 0,
        cashBalance: 0,
        lastSynced: new Date(),
        syncSuccess: false,
        error: errorMessage,
      };
      this.lastSyncResult = failResult;
      return failResult;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Process portfolio data pushed from local machine.
   * Same reconcile + cache logic as triggerSync, but skips Playwright entirely.
   */
  async processPushedSync(data: {
    holdings: ATradHolding[];
    buyingPower: number;
    accountValue: number;
    cashBalance: number;
  }): Promise<ATradPortfolio> {
    this.logger.log(
      `Processing pushed sync: ${data.holdings.length} holdings, ` +
        `cash=${data.cashBalance}, buyingPower=${data.buyingPower}`,
    );

    const result: ATradPortfolio = {
      holdings: data.holdings,
      buyingPower: data.buyingPower,
      accountValue: data.accountValue,
      cashBalance: data.cashBalance,
      lastSynced: new Date(),
      syncSuccess: true,
    };

    this.lastSyncResult = result;

    // Reconcile portfolio in DB
    if (result.holdings.length > 0) {
      await this.reconcilePortfolio(result.holdings);
    }

    // Detect deposits via buying power changes
    await this.detectDeposit(result.buyingPower);

    // Cache in Redis (24h TTL)
    await this.redisService.setJson(
      'atrad:last_sync',
      {
        ...result,
        syncedAt: result.lastSynced.toISOString(),
        lastSynced: result.lastSynced.toISOString(),
      },
      86400,
    );

    await this.redisService.setJson(
      'atrad:balance',
      {
        cashBalance: result.cashBalance,
        buyingPower: result.buyingPower,
        accountValue: result.accountValue,
        syncedAt: result.lastSynced.toISOString(),
      },
      86400,
    );

    await this.redisService.setJson('atrad:holdings', result.holdings, 86400);

    this.logger.log('Pushed sync processed and cached successfully');

    return result;
  }

  /**
   * Test ATrad connection by attempting login only.
   */
  async testConnection(): Promise<{
    success: boolean;
    message: string;
    holdingsFound: number;
  }> {
    this.logger.log('Testing ATrad connection...');

    const result = await syncATradPortfolio();

    return {
      success: result.syncSuccess,
      message: result.syncSuccess
        ? `Connection successful. Found ${result.holdings.length} holdings.`
        : `Connection failed: ${result.error}`,
      holdingsFound: result.holdings.length,
    };
  }

  /**
   * Get the status of the last sync.
   * Falls back to Redis cache so data survives backend restarts.
   */
  async getLastSyncStatus(): Promise<SyncStatus> {
    // Use in-memory first (freshest), fall back to Redis cache
    if (this.lastSyncResult) {
      return {
        lastSyncTime: this.lastSyncResult.lastSynced,
        syncSuccess: this.lastSyncResult.syncSuccess,
        holdingsCount: this.lastSyncResult.holdings.length,
        buyingPower: this.lastSyncResult.buyingPower,
        accountValue: this.lastSyncResult.accountValue,
        cashBalance: this.lastSyncResult.cashBalance,
        error: this.lastSyncResult.error,
      };
    }

    // Restore from Redis after restart
    try {
      const cached = await this.redisService.getJson<{
        buyingPower: number;
        accountValue: number;
        cashBalance: number;
        lastSynced: string;
        syncSuccess: boolean;
        holdings: ATradHolding[];
        error?: string;
      }>('atrad:last_sync');

      if (cached) {
        this.logger.log(
          `Restored ATrad status from Redis cache (buying power: ${cached.buyingPower})`,
        );
        this.lastSyncResult = {
          ...cached,
          lastSynced: new Date(cached.lastSynced),
        };
        return {
          lastSyncTime: this.lastSyncResult.lastSynced,
          syncSuccess: this.lastSyncResult.syncSuccess,
          holdingsCount: this.lastSyncResult.holdings.length,
          buyingPower: this.lastSyncResult.buyingPower,
          accountValue: this.lastSyncResult.accountValue,
          cashBalance: this.lastSyncResult.cashBalance,
          error: this.lastSyncResult.error,
        };
      }
    } catch (err) {
      this.logger.warn(
        `Could not restore ATrad status from Redis: ${String(err)}`,
      );
    }

    return {
      lastSyncTime: null,
      syncSuccess: false,
      holdingsCount: 0,
      buyingPower: 0,
      accountValue: 0,
      cashBalance: 0,
      error: 'No sync has been performed yet',
    };
  }

  /**
   * GET /api/atrad/sync-status — detailed health check.
   * Returns isStale (>24hr old) and nextScheduledSync for the UI dashboard.
   */
  async getSyncStatus(): Promise<{
    lastSync: string | null;
    balance: number;
    holdingsCount: number;
    isStale: boolean;
    nextScheduledSync: string;
    syncSuccess: boolean;
    error?: string;
  }> {
    const status = await this.getLastSyncStatus();
    const lastSync = status.lastSyncTime?.toISOString() ?? null;
    const isStale = lastSync
      ? Date.now() - new Date(lastSync).getTime() > 24 * 60 * 60 * 1000
      : true;

    return {
      lastSync,
      balance: status.cashBalance,
      holdingsCount: status.holdingsCount,
      isStale,
      nextScheduledSync: this.computeNextScheduledSync(),
      syncSuccess: status.syncSuccess,
      error: status.error,
    };
  }

  private computeNextScheduledSync(): string {
    const now = new Date();
    // Convert to SLT (UTC+5:30)
    const sltMs = now.getTime() + 5.5 * 60 * 60 * 1000;
    const slt = new Date(sltMs);
    const dow = slt.getUTCDay(); // 0=Sun, 1=Mon...5=Fri, 6=Sat
    const h = slt.getUTCHours();
    const m = slt.getUTCMinutes();
    const time = h * 100 + m;

    // Weekend — next sync is Monday 09:30
    if (dow === 0 || dow === 6) {
      return 'Monday 09:30 AM SLT (market open)';
    }

    // Before market open
    if (time < 930) {
      return `Today 09:30 AM SLT (market open)`;
    }

    // During market hours (9:30–14:30) — next 15-min tick
    if (time >= 930 && time <= 1430) {
      const nextMin = Math.ceil((m + 1) / 15) * 15;
      if (nextMin < 60) {
        return `~${60 - m} min (market hours sync at :${nextMin.toString().padStart(2, '0')})`;
      }
      return `~${60 - m} min (market hours sync)`;
    }

    // Post-close: next sync at 14:38 if not yet passed
    if (time > 1430 && time < 1438) {
      return 'Post-close sync at 14:38 SLT';
    }

    // End of day — tomorrow
    return 'Tomorrow 09:30 AM SLT (market open)';
  }

  /**
   * Get the latest synced holdings (from memory or Redis).
   */
  async getHoldings(): Promise<ATradHolding[]> {
    if (this.lastSyncResult?.holdings?.length) {
      return this.lastSyncResult.holdings;
    }
    try {
      const cached =
        await this.redisService.getJson<ATradHolding[]>('atrad:holdings');
      return cached ?? [];
    } catch {
      return [];
    }
  }

  // ── Private: Reconcile ATrad holdings with portfolio table ────────────

  private async reconcilePortfolio(
    atradHoldings: ATradHolding[],
  ): Promise<void> {
    if (atradHoldings.length === 0) {
      this.logger.log('No ATrad holdings to reconcile');
      return;
    }

    const dbHoldings = await this.portfolioRepository.find({
      where: { is_open: true },
    });

    // Build lookup map of DB holdings by symbol (strip .N0000 for comparison)
    const dbMap = new Map<string, Portfolio[]>();
    for (const h of dbHoldings) {
      const baseSymbol = h.symbol.replace(/\.N\d+$/i, '');
      const existing = dbMap.get(baseSymbol) ?? [];
      existing.push(h);
      dbMap.set(baseSymbol, existing);
    }

    for (const atradHolding of atradHoldings) {
      const baseSymbol = atradHolding.symbol.replace(/\.N\d+$/i, '');
      const dbEntries = dbMap.get(baseSymbol);

      if (!dbEntries || dbEntries.length === 0) {
        // New stock not in our portfolio — auto-add it
        await this.addNewHolding(atradHolding);
      } else {
        // Check for quantity changes
        const totalDbQty = dbEntries.reduce(
          (sum, e) => sum + Number(e.quantity),
          0,
        );
        if (totalDbQty !== atradHolding.quantity) {
          this.logger.log(
            `Quantity mismatch for ${baseSymbol}: DB=${totalDbQty}, ATrad=${atradHolding.quantity}`,
          );
          // Update the most recent entry's quantity to match
          // (Simple approach: adjust the last entry to make totals match)
          const lastEntry = dbEntries[dbEntries.length - 1];
          const diff = atradHolding.quantity - totalDbQty;
          const newQty = Number(lastEntry.quantity) + diff;

          if (newQty > 0) {
            lastEntry.quantity = newQty;
            await this.portfolioRepository.save(lastEntry);
            this.logger.log(
              `Updated ${baseSymbol} quantity: ${totalDbQty} -> ${atradHolding.quantity}`,
            );
          } else if (newQty === 0) {
            // Position fully closed
            lastEntry.is_open = false;
            lastEntry.sell_date = new Date();
            lastEntry.sell_price = atradHolding.currentPrice;
            await this.portfolioRepository.save(lastEntry);
            this.logger.log(`Position closed for ${baseSymbol}`);
          }
        }
      }
    }

    // Check for positions that exist in DB but not in ATrad (possibly sold)
    const atradSymbols = new Set(
      atradHoldings.map((h) => h.symbol.replace(/\.N\d+$/i, '')),
    );

    for (const [baseSymbol, dbEntries] of dbMap) {
      if (!atradSymbols.has(baseSymbol)) {
        this.logger.log(
          `${baseSymbol} exists in DB portfolio but not in ATrad — may have been sold`,
        );
        // Don't auto-close here; could be a scraping issue. Just log it.
      }
    }
  }

  private async addNewHolding(holding: ATradHolding): Promise<void> {
    // Resolve full CSE symbol
    let fullSymbol = holding.symbol;
    if (!fullSymbol.includes('.')) {
      fullSymbol = `${fullSymbol}.N0000`;
    }

    // Try to find the stock in our database
    const stock = await this.stockRepository.findOne({
      where: { symbol: fullSymbol },
    });

    if (!stock) {
      this.logger.warn(
        `Stock ${fullSymbol} not found in database. Adding holding with symbol as-is.`,
      );
    }

    const newHolding = this.portfolioRepository.create({
      symbol: stock?.symbol ?? fullSymbol,
      quantity: holding.quantity,
      buy_price: holding.avgPrice,
      buy_date: new Date(),
      notes: `Auto-added from ATrad sync on ${new Date().toISOString().split('T')[0]}`,
      is_open: true,
      dividends_received: 0,
      purification_rate: 0.03,
    });

    await this.portfolioRepository.save(newHolding);
    this.logger.log(
      `Auto-added new holding: ${newHolding.symbol} x${holding.quantity} @ ${holding.avgPrice}`,
    );
  }

  // ── Private: Detect deposits via buying power changes ─────────────────

  private async detectDeposit(currentBuyingPower: number): Promise<void> {
    if (this.previousBuyingPower === null) {
      this.previousBuyingPower = currentBuyingPower;
      this.logger.log(`Initial buying power recorded: ${currentBuyingPower}`);
      return;
    }

    const diff = currentBuyingPower - this.previousBuyingPower;

    // Only detect significant increases (> LKR 1000) as potential deposits
    // Small changes are from trade settlements, dividends, etc.
    if (diff > 1000) {
      this.logger.log(
        `Potential deposit detected: Buying power increased by LKR ${diff.toFixed(2)} ` +
          `(${this.previousBuyingPower} -> ${currentBuyingPower})`,
      );

      // Check if we already recorded a deposit this month
      const now = new Date();
      const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const existingDeposit = await this.monthlyDepositRepository.findOne({
        where: { month: monthStr, source: 'atrad-auto' },
      });

      if (!existingDeposit) {
        // Get cumulative deposited
        const allDeposits = await this.monthlyDepositRepository.find({
          order: { deposit_date: 'DESC' },
        });
        const cumulativeDeposited = allDeposits.reduce(
          (sum, d) => sum + Number(d.deposit_amount),
          0,
        );

        const deposit = this.monthlyDepositRepository.create({
          month: monthStr,
          deposit_amount: diff,
          deposit_date: now,
          portfolio_value_at_deposit: this.lastSyncResult?.accountValue ?? 0,
          cumulative_deposited: cumulativeDeposited + diff,
          source: 'atrad-auto',
          notes: `Auto-detected from ATrad buying power change: ${this.previousBuyingPower} -> ${currentBuyingPower}`,
        });

        await this.monthlyDepositRepository.save(deposit);
        this.logger.log(
          `Auto-created monthly deposit record: LKR ${diff.toFixed(2)} for ${monthStr}`,
        );
      } else {
        this.logger.log(
          `Deposit already recorded for ${monthStr} (source: atrad-auto). Skipping.`,
        );
      }
    }

    this.previousBuyingPower = currentBuyingPower;
  }
}
