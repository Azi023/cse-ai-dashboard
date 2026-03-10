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

  // ── Cron: Every 15 minutes during market hours (9:30 AM - 2:30 PM SLT, Mon-Fri) ──
  // SLT is UTC+5:30, so 9:30 SLT = 04:00 UTC, 14:30 SLT = 09:00 UTC
  @Cron('0 */15 4-8 * * 1-5', {
    name: 'atrad-sync-market-hours',
    timeZone: 'Asia/Colombo',
  })
  async handleMarketHoursSync(): Promise<void> {
    // Check if within market hours (9:30-14:30 SLT)
    const now = new Date();
    const sltHour = now.getUTCHours() + 5 + (now.getUTCMinutes() + 30 >= 60 ? 1 : 0);
    const sltMinute = (now.getUTCMinutes() + 30) % 60;
    const sltTime = sltHour * 100 + sltMinute;

    if (sltTime < 930 || sltTime > 1430) {
      return;
    }

    this.logger.log('Cron: ATrad market hours sync triggered');
    await this.triggerSync();
  }

  // ── Cron: Once at 3:00 PM SLT (post-market) ──
  @Cron('0 0 15 * * 1-5', {
    name: 'atrad-sync-post-market',
    timeZone: 'Asia/Colombo',
  })
  async handlePostMarketSync(): Promise<void> {
    this.logger.log('Cron: ATrad post-market sync triggered (3:00 PM SLT)');
    await this.triggerSync();
  }

  /**
   * Trigger a manual or scheduled ATrad portfolio sync.
   */
  async triggerSync(): Promise<ATradPortfolio> {
    if (this.isSyncing) {
      this.logger.warn('Sync already in progress, skipping...');
      return this.lastSyncResult ?? {
        holdings: [],
        buyingPower: 0,
        accountValue: 0,
        cashBalance: 0,
        lastSynced: new Date(),
        syncSuccess: false,
        error: 'Sync already in progress',
      };
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

        // Compare with portfolio table and auto-update
        await this.reconcilePortfolio(result.holdings);

        // Detect deposits via buying power changes
        await this.detectDeposit(result.buyingPower);

        // Cache the result in Redis (5 minute TTL)
        await this.redisService.setJson('atrad:last_sync', {
          ...result,
          lastSynced: result.lastSynced.toISOString(),
        }, 300);

        // Cache holdings separately for quick access
        await this.redisService.setJson('atrad:holdings', result.holdings, 300);
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
   */
  getLastSyncStatus(): SyncStatus {
    if (!this.lastSyncResult) {
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

  /**
   * Get the latest synced holdings.
   */
  getHoldings(): ATradHolding[] {
    return this.lastSyncResult?.holdings ?? [];
  }

  // ── Private: Reconcile ATrad holdings with portfolio table ────────────

  private async reconcilePortfolio(atradHoldings: ATradHolding[]): Promise<void> {
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
        const totalDbQty = dbEntries.reduce((sum, e) => sum + Number(e.quantity), 0);
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
