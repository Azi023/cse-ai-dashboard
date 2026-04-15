import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaperPortfolio } from '../../entities/paper-portfolio.entity';
import { PaperTrade } from '../../entities/paper-trade.entity';
import { Stock, DailyPrice } from '../../entities';
import { RedisService } from '../cse-data/redis.service';
import { UserPreferencesService } from '../user-preferences/user-preferences.service';
import { ExecuteTradeDto } from './dto/execute-trade.dto';

const STOCK_INITIAL_BALANCE = 1_000_000; // LKR 1M
const CRYPTO_INITIAL_BALANCE = 10_000; // USDT 10K
const CSE_FEE_RATE = 0.0112; // 1.12% brokerage fee

export interface HoldingPosition {
  symbol: string;
  quantity: number;
  avg_cost: number;
  total_invested: number;
  current_price: number;
  market_value: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
}

export interface PortfolioSummary {
  portfolio_type: string;
  asset_type: string;
  initial_balance: number;
  current_cash: number;
  holdings_value: number;
  total_value: number;
  total_return: number;
  total_return_pct: number;
  holdings: HoldingPosition[];
}

export interface PerformanceMetrics {
  total_trades: number;
  buy_trades: number;
  sell_trades: number;
  total_return_pct: number;
  win_rate: number;
  avg_trade_return: number;
  best_trade: { symbol: string; return_pct: number } | null;
  worst_trade: { symbol: string; return_pct: number } | null;
  equity_curve: { date: string; value: number }[];
}

@Injectable()
export class PaperTradingService {
  private readonly logger = new Logger(PaperTradingService.name);

  constructor(
    @InjectRepository(PaperPortfolio)
    private readonly portfolioRepo: Repository<PaperPortfolio>,
    @InjectRepository(PaperTrade)
    private readonly tradeRepo: Repository<PaperTrade>,
    @InjectRepository(Stock)
    private readonly stockRepo: Repository<Stock>,
    @InjectRepository(DailyPrice)
    private readonly dailyPriceRepo: Repository<DailyPrice>,
    private readonly redisService: RedisService,
    private readonly userPrefsService: UserPreferencesService,
  ) {}

  // ── Portfolio Management ──────────────────────────────────────────────

  async getOrCreatePortfolio(
    type: string = 'paper_human',
    assetType: string = 'stock',
  ): Promise<PaperPortfolio> {
    const existing = await this.portfolioRepo.findOne({
      where: { portfolio_type: type, asset_type: assetType },
    });
    if (existing) return existing;

    const initialBalance =
      assetType === 'crypto' ? CRYPTO_INITIAL_BALANCE : STOCK_INITIAL_BALANCE;
    const portfolio = this.portfolioRepo.create({
      portfolio_type: type,
      asset_type: assetType,
      initial_balance: initialBalance,
      current_cash: initialBalance,
    });
    return this.portfolioRepo.save(portfolio);
  }

  // ── Trade Execution ───────────────────────────────────────────────────

  async executeTrade(
    dto: ExecuteTradeDto,
  ): Promise<{ trade: PaperTrade; portfolio: PaperPortfolio }> {
    const assetType = dto.asset_type ?? 'stock';
    const portfolio = await this.getOrCreatePortfolio('paper_human', assetType);

    // Shariah compliance check
    if (assetType === 'stock') {
      const shariahMode = await this.userPrefsService.getDefaultShariahMode();
      if (shariahMode) {
        const stock = await this.stockRepo.findOne({
          where: { symbol: dto.symbol },
        });
        if (stock && stock.shariah_status !== 'compliant') {
          throw new BadRequestException(
            `${dto.symbol} is not Shariah-compliant. Disable Shariah mode to trade all stocks.`,
          );
        }
      }
    }

    // Get current price if not provided
    const price =
      dto.price ?? (await this.getCurrentPrice(dto.symbol, assetType));
    if (!price || price <= 0) {
      throw new BadRequestException(
        `Could not determine price for ${dto.symbol}`,
      );
    }

    const fees =
      assetType === 'stock' ? price * dto.quantity * CSE_FEE_RATE : 0;
    const totalCost = price * dto.quantity + fees;

    if (dto.direction === 'BUY') {
      if (Number(portfolio.current_cash) < totalCost) {
        throw new BadRequestException(
          `Insufficient cash. Need ${totalCost.toFixed(2)}, have ${Number(portfolio.current_cash).toFixed(2)}`,
        );
      }
      portfolio.current_cash = Number(portfolio.current_cash) - totalCost;
    } else {
      // SELL — check holdings
      const held = await this.getHeldQuantity(
        dto.symbol,
        'paper_human',
        assetType,
      );
      if (held < dto.quantity) {
        throw new BadRequestException(
          `Insufficient holdings. Own ${held}, trying to sell ${dto.quantity}`,
        );
      }
      const proceeds = price * dto.quantity - fees;
      portfolio.current_cash = Number(portfolio.current_cash) + proceeds;
    }

    const trade = this.tradeRepo.create({
      portfolio_type: 'paper_human',
      symbol: dto.symbol,
      asset_type: assetType,
      direction: dto.direction,
      quantity: dto.quantity,
      price,
      total_cost: totalCost,
      fees,
      notes: dto.notes ?? null,
      executed_at: new Date(),
    });

    const [savedTrade, savedPortfolio] = await Promise.all([
      this.tradeRepo.save(trade),
      this.portfolioRepo.save(portfolio),
    ]);

    this.logger.log(
      `Paper ${dto.direction}: ${dto.quantity} ${dto.symbol} @ ${price} (fees: ${fees.toFixed(2)})`,
    );

    return { trade: savedTrade, portfolio: savedPortfolio };
  }

  // ── Portfolio View ────────────────────────────────────────────────────

  async getPortfolio(
    type: string = 'paper_human',
    assetType: string = 'stock',
  ): Promise<PortfolioSummary> {
    const portfolio = await this.getOrCreatePortfolio(type, assetType);
    const holdings = await this.computeHoldings(type, assetType);

    const holdingsValue = holdings.reduce((sum, h) => sum + h.market_value, 0);
    const cash = Number(portfolio.current_cash);
    const totalValue = cash + holdingsValue;
    const initial = Number(portfolio.initial_balance);

    return {
      portfolio_type: type,
      asset_type: assetType,
      initial_balance: initial,
      current_cash: cash,
      holdings_value: holdingsValue,
      total_value: totalValue,
      total_return: totalValue - initial,
      total_return_pct:
        initial > 0 ? ((totalValue - initial) / initial) * 100 : 0,
      holdings,
    };
  }

  async getTradeHistory(
    type: string = 'paper_human',
    assetType?: string,
    limit: number = 50,
  ): Promise<PaperTrade[]> {
    const where: Record<string, string> = { portfolio_type: type };
    if (assetType) where.asset_type = assetType;
    return this.tradeRepo.find({
      where,
      order: { executed_at: 'DESC' },
      take: limit,
    });
  }

  async getPerformance(
    type: string = 'paper_human',
    assetType: string = 'stock',
  ): Promise<PerformanceMetrics> {
    const portfolio = await this.getPortfolio(type, assetType);
    const trades = await this.tradeRepo.find({
      where: { portfolio_type: type, asset_type: assetType },
      order: { executed_at: 'ASC' },
    });

    const sellTrades = trades.filter((t) => t.direction === 'SELL');
    const buyTrades = trades.filter((t) => t.direction === 'BUY');

    // Compute win rate from closed round-trip trades
    let wins = 0;
    let totalReturn = 0;
    let bestTrade: { symbol: string; return_pct: number } | null = null;
    let worstTrade: { symbol: string; return_pct: number } | null = null;

    for (const sell of sellTrades) {
      // Find the average buy price for this symbol before this sell
      const buysForSymbol = buyTrades.filter(
        (b) =>
          b.symbol === sell.symbol &&
          new Date(b.executed_at) <= new Date(sell.executed_at),
      );
      if (buysForSymbol.length === 0) continue;

      const avgBuyPrice =
        buysForSymbol.reduce((s, b) => s + Number(b.price) * b.quantity, 0) /
        buysForSymbol.reduce((s, b) => s + b.quantity, 0);
      const returnPct =
        ((Number(sell.price) - avgBuyPrice) / avgBuyPrice) * 100;
      totalReturn += returnPct;
      if (returnPct > 0) wins++;
      if (!bestTrade || returnPct > bestTrade.return_pct) {
        bestTrade = { symbol: sell.symbol, return_pct: returnPct };
      }
      if (!worstTrade || returnPct < worstTrade.return_pct) {
        worstTrade = { symbol: sell.symbol, return_pct: returnPct };
      }
    }

    // Build equity curve from trades
    const initial = Number(
      (await this.getOrCreatePortfolio(type, assetType)).initial_balance,
    );
    const equityCurve: { date: string; value: number }[] = [
      {
        date:
          trades.length > 0
            ? new Date(trades[0].executed_at).toISOString().slice(0, 10)
            : new Date().toISOString().slice(0, 10),
        value: initial,
      },
    ];

    let runningCash = initial;
    for (const t of trades) {
      if (t.direction === 'BUY') {
        runningCash -= Number(t.total_cost);
      } else {
        runningCash += Number(t.price) * t.quantity - Number(t.fees);
      }
      equityCurve.push({
        date: new Date(t.executed_at).toISOString().slice(0, 10),
        value: runningCash,
      });
    }

    return {
      total_trades: trades.length,
      buy_trades: buyTrades.length,
      sell_trades: sellTrades.length,
      total_return_pct: portfolio.total_return_pct,
      win_rate: sellTrades.length > 0 ? (wins / sellTrades.length) * 100 : 0,
      avg_trade_return:
        sellTrades.length > 0 ? totalReturn / sellTrades.length : 0,
      best_trade: bestTrade,
      worst_trade: worstTrade,
      equity_curve: equityCurve,
    };
  }

  async resetPortfolio(
    type: string = 'paper_human',
    assetType: string = 'stock',
  ): Promise<{ message: string }> {
    await this.tradeRepo.delete({
      portfolio_type: type,
      asset_type: assetType,
    });

    const portfolio = await this.getOrCreatePortfolio(type, assetType);
    portfolio.current_cash = Number(portfolio.initial_balance);
    await this.portfolioRepo.save(portfolio);

    this.logger.log(`Reset paper portfolio: ${type}/${assetType}`);
    return { message: `Portfolio reset to ${portfolio.initial_balance}` };
  }

  async comparePortfolios(): Promise<{
    ai_demo: PortfolioSummary;
    paper_human: PortfolioSummary;
  }> {
    const [aiDemo, paperHuman] = await Promise.all([
      this.getPortfolio('ai_demo', 'stock').catch(
        () =>
          ({
            portfolio_type: 'ai_demo',
            asset_type: 'stock',
            initial_balance: STOCK_INITIAL_BALANCE,
            current_cash: STOCK_INITIAL_BALANCE,
            holdings_value: 0,
            total_value: STOCK_INITIAL_BALANCE,
            total_return: 0,
            total_return_pct: 0,
            holdings: [],
          }) as PortfolioSummary,
      ),
      this.getPortfolio('paper_human', 'stock'),
    ]);
    return { ai_demo: aiDemo, paper_human: paperHuman };
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private async getCurrentPrice(
    symbol: string,
    assetType: string,
  ): Promise<number> {
    if (assetType === 'crypto') {
      // Read from Redis crypto ticker cache
      const cached = await this.redisService.get(`crypto:ticker:${symbol}`);
      if (cached) {
        const data = JSON.parse(cached);
        return data.price ?? 0;
      }
      return 0;
    }

    // Stock: check Redis trade summary first, fall back to daily_prices
    const tradeSummary = await this.redisService.get('cse:trade_summary');
    if (tradeSummary) {
      const stocks = JSON.parse(tradeSummary);
      const match = stocks.find((s: { symbol: string }) => s.symbol === symbol);
      if (match?.price) return Number(match.price);
    }

    // DailyPrice uses stock_id, not symbol — look up via Stock first
    const stock = await this.stockRepo.findOne({ where: { symbol } });
    if (!stock) return 0;

    const latest = await this.dailyPriceRepo.findOne({
      where: { stock_id: stock.id },
      order: { trade_date: 'DESC' },
    });
    return latest ? Number(latest.close) : 0;
  }

  private async getHeldQuantity(
    symbol: string,
    type: string,
    assetType: string,
  ): Promise<number> {
    const trades = await this.tradeRepo.find({
      where: { symbol, portfolio_type: type, asset_type: assetType },
      order: { executed_at: 'ASC' },
    });

    let qty = 0;
    for (const t of trades) {
      if (t.direction === 'BUY') {
        qty += t.quantity;
      } else {
        qty -= t.quantity;
      }
    }
    return Math.max(0, qty);
  }

  private async computeHoldings(
    type: string,
    assetType: string,
  ): Promise<HoldingPosition[]> {
    const trades = await this.tradeRepo.find({
      where: { portfolio_type: type, asset_type: assetType },
      order: { executed_at: 'ASC' },
    });

    // Aggregate by symbol
    const positions = new Map<string, { qty: number; totalCost: number }>();

    for (const t of trades) {
      const pos = positions.get(t.symbol) ?? { qty: 0, totalCost: 0 };
      if (t.direction === 'BUY') {
        pos.totalCost += Number(t.total_cost);
        pos.qty += t.quantity;
      } else {
        // Proportional cost reduction
        if (pos.qty > 0) {
          const costPerShare = pos.totalCost / pos.qty;
          pos.totalCost -= costPerShare * t.quantity;
          pos.qty -= t.quantity;
        }
      }
      positions.set(t.symbol, pos);
    }

    const holdings: HoldingPosition[] = [];
    for (const [symbol, pos] of positions) {
      if (pos.qty <= 0) continue;

      const currentPrice = await this.getCurrentPrice(symbol, assetType);
      const marketValue = currentPrice * pos.qty;
      const avgCost = pos.qty > 0 ? pos.totalCost / pos.qty : 0;
      const pnl = marketValue - pos.totalCost;
      const pnlPct = pos.totalCost > 0 ? (pnl / pos.totalCost) * 100 : 0;

      holdings.push({
        symbol,
        quantity: pos.qty,
        avg_cost: avgCost,
        total_invested: pos.totalCost,
        current_price: currentPrice,
        market_value: marketValue,
        unrealized_pnl: pnl,
        unrealized_pnl_pct: pnlPct,
      });
    }

    return holdings;
  }
}
