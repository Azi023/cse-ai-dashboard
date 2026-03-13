import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Portfolio, Stock } from '../../entities';
import { RedisService } from '../cse-data/redis.service';

interface CreateHoldingDto {
  symbol: string;
  quantity: number;
  buy_price: number;
  buy_date: string;
  notes?: string;
  dividends_received?: number;
  purification_rate?: number;
}

interface UpdateHoldingDto {
  quantity?: number;
  buy_price?: number;
  buy_date?: string;
  notes?: string;
  dividends_received?: number;
  purification_rate?: number;
}

export interface HoldingWithPnL {
  id: number;
  symbol: string;
  name: string;
  sector: string | null;
  quantity: number;
  buy_price: number;
  buy_date: Date;
  current_price: number | null;
  invested_value: number;
  current_value: number | null;
  pnl: number | null;
  pnl_percent: number | null;
  daily_change: number | null;
  allocation_percent: number | null;
  shariah_status: string;
  dividends_received: number;
  purification_rate: number;
  notes: string | null;
}

export interface PortfolioSummary {
  total_value: number;
  total_invested: number;
  total_pnl: number;
  total_pnl_percent: number;
  daily_change: number;
  holdings_count: number;
  cash_balance: number;
  allocation: Array<{
    symbol: string;
    name: string;
    value: number;
    percent: number;
  }>;
  sector_allocation: Array<{
    sector: string;
    value: number;
    percent: number;
  }>;
}

@Injectable()
export class PortfolioService {
  private readonly logger = new Logger(PortfolioService.name);

  constructor(
    @InjectRepository(Portfolio)
    private readonly portfolioRepository: Repository<Portfolio>,
    @InjectRepository(Stock)
    private readonly stockRepository: Repository<Stock>,
    private readonly redisService: RedisService,
  ) {}

  /**
   * GET /api/portfolio — All open holdings with live prices and P&L.
   */
  async getAllHoldings(): Promise<HoldingWithPnL[]> {
    const holdings = await this.portfolioRepository.find({
      where: { is_open: true },
      order: { symbol: 'ASC' },
    });

    if (holdings.length === 0) return [];

    // Get live trade data from Redis for current prices
    const tradeData = await this.getTradeData();
    const totalValue = this.calcTotalValue(holdings, tradeData);

    const result: HoldingWithPnL[] = [];
    for (const h of holdings) {
      const stock = await this.stockRepository.findOne({
        where: { symbol: h.symbol },
      });
      const trade = tradeData.get(h.symbol);
      const currentPrice = trade?.price ?? stock?.last_price ?? null;
      const investedValue = Number(h.quantity) * Number(h.buy_price);
      const currentValue =
        currentPrice != null ? Number(h.quantity) * Number(currentPrice) : null;
      const pnl = currentValue != null ? currentValue - investedValue : null;
      const pnlPercent =
        pnl != null && investedValue > 0 ? (pnl / investedValue) * 100 : null;
      const dailyChange =
        trade?.change != null
          ? Number(h.quantity) * Number(trade.change)
          : null;
      const allocationPercent =
        currentValue != null && totalValue > 0
          ? (currentValue / totalValue) * 100
          : null;

      result.push({
        id: h.id,
        symbol: h.symbol,
        name: stock?.name ?? h.symbol,
        sector: stock?.sector ?? null,
        quantity: h.quantity,
        buy_price: Number(h.buy_price),
        buy_date: h.buy_date,
        current_price: currentPrice != null ? Number(currentPrice) : null,
        invested_value: investedValue,
        current_value: currentValue,
        pnl,
        pnl_percent: pnlPercent,
        daily_change: dailyChange,
        allocation_percent: allocationPercent,
        shariah_status: stock?.shariah_status ?? 'unknown',
        dividends_received: Number(h.dividends_received),
        purification_rate: Number(h.purification_rate),
        notes: h.notes,
      });
    }

    return result;
  }

  /**
   * POST /api/portfolio — Add a new holding.
   */
  async addHolding(dto: CreateHoldingDto): Promise<Portfolio> {
    if (!dto.symbol || dto.quantity <= 0 || dto.buy_price <= 0) {
      throw new BadRequestException(
        'Symbol, positive quantity, and positive buy_price are required',
      );
    }

    let symbol = dto.symbol.toUpperCase().trim();

    // Auto-append .N0000 suffix if not present (CSE convention)
    if (!symbol.includes('.')) {
      symbol = `${symbol}.N0000`;
    }

    // Validate symbol exists in the stocks table
    const stock = await this.stockRepository.findOne({ where: { symbol } });
    if (!stock) {
      throw new BadRequestException(
        `Stock "${symbol}" not found. Use the full CSE symbol format (e.g., JKH.N0000). Check /api/stocks for valid symbols.`,
      );
    }

    const holding = this.portfolioRepository.create({
      symbol,
      quantity: dto.quantity,
      buy_price: dto.buy_price,
      buy_date: new Date(dto.buy_date),
      notes: dto.notes ?? null,
      dividends_received: dto.dividends_received ?? 0,
      purification_rate: dto.purification_rate ?? 0.03,
      is_open: true,
    });

    return this.portfolioRepository.save(holding);
  }

  /**
   * PUT /api/portfolio/:id — Update a holding.
   */
  async updateHolding(id: number, dto: UpdateHoldingDto): Promise<Portfolio> {
    const holding = await this.portfolioRepository.findOne({ where: { id } });
    if (!holding) {
      throw new NotFoundException(`Holding with id ${id} not found`);
    }

    if (dto.quantity !== undefined) holding.quantity = dto.quantity;
    if (dto.buy_price !== undefined) holding.buy_price = dto.buy_price;
    if (dto.buy_date !== undefined) holding.buy_date = new Date(dto.buy_date);
    if (dto.notes !== undefined) holding.notes = dto.notes;
    if (dto.dividends_received !== undefined)
      holding.dividends_received = dto.dividends_received;
    if (dto.purification_rate !== undefined)
      holding.purification_rate = dto.purification_rate;

    return this.portfolioRepository.save(holding);
  }

  /**
   * DELETE /api/portfolio/:id — Remove a holding.
   */
  async deleteHolding(id: number): Promise<{ deleted: boolean }> {
    const holding = await this.portfolioRepository.findOne({ where: { id } });
    if (!holding) {
      throw new NotFoundException(`Holding with id ${id} not found`);
    }

    await this.portfolioRepository.remove(holding);
    return { deleted: true };
  }

  /**
   * GET /api/portfolio/summary — Total value, P&L, allocation breakdown.
   */
  async getSummary(): Promise<PortfolioSummary> {
    const holdings = await this.portfolioRepository.find({
      where: { is_open: true },
    });

    const cashBalance = await this.getATradCashBalance();

    if (holdings.length === 0) {
      return {
        total_value: cashBalance,
        total_invested: 0,
        total_pnl: 0,
        total_pnl_percent: 0,
        daily_change: 0,
        holdings_count: 0,
        cash_balance: cashBalance,
        allocation: [],
        sector_allocation: [],
      };
    }

    const tradeData = await this.getTradeData();
    let totalValue = 0;
    let totalInvested = 0;
    let dailyChange = 0;

    const allocationMap: Map<
      string,
      { name: string; value: number; sector: string | null }
    > = new Map();

    for (const h of holdings) {
      const stock = await this.stockRepository.findOne({
        where: { symbol: h.symbol },
      });
      const trade = tradeData.get(h.symbol);
      const currentPrice = trade?.price ?? stock?.last_price ?? null;
      const invested = Number(h.quantity) * Number(h.buy_price);
      totalInvested += invested;

      if (currentPrice != null) {
        const value = Number(h.quantity) * Number(currentPrice);
        totalValue += value;

        const existing = allocationMap.get(h.symbol);
        if (existing) {
          existing.value += value;
        } else {
          allocationMap.set(h.symbol, {
            name: stock?.name ?? h.symbol,
            value,
            sector: stock?.sector ?? null,
          });
        }
      }

      if (trade?.change != null) {
        dailyChange += Number(h.quantity) * Number(trade.change);
      }
    }

    const totalPnl = totalValue - totalInvested;
    const totalPnlPercent =
      totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

    // Stock allocation
    const allocation = Array.from(allocationMap.entries())
      .map(([symbol, data]) => ({
        symbol,
        name: data.name,
        value: data.value,
        percent: totalValue > 0 ? (data.value / totalValue) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);

    // Sector allocation
    const sectorMap = new Map<string, number>();
    for (const data of allocationMap.values()) {
      const sector = data.sector ?? 'Unknown';
      sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + data.value);
    }
    const sectorAllocation = Array.from(sectorMap.entries())
      .map(([sector, value]) => ({
        sector,
        value,
        percent: totalValue > 0 ? (value / totalValue) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);

    return {
      total_value: totalValue + cashBalance,
      total_invested: totalInvested,
      total_pnl: totalPnl,
      total_pnl_percent: totalPnlPercent,
      daily_change: dailyChange,
      holdings_count: holdings.length,
      cash_balance: cashBalance,
      allocation,
      sector_allocation: sectorAllocation,
    };
  }

  /**
   * GET /api/portfolio/shariah — Shariah compliance breakdown.
   */
  async getShariahSummary(): Promise<{
    compliant_count: number;
    non_compliant_count: number;
    pending_count: number;
    compliant_value: number;
    total_value: number;
    compliant_percent: number;
    holdings: Array<{
      symbol: string;
      name: string;
      value: number;
      shariah_status: string;
    }>;
  }> {
    const holdings = await this.portfolioRepository.find({
      where: { is_open: true },
    });

    const tradeData = await this.getTradeData();
    let compliantCount = 0;
    let nonCompliantCount = 0;
    let pendingCount = 0;
    let compliantValue = 0;
    let totalValue = 0;

    const holdingsList: Array<{
      symbol: string;
      name: string;
      value: number;
      shariah_status: string;
    }> = [];

    for (const h of holdings) {
      const stock = await this.stockRepository.findOne({
        where: { symbol: h.symbol },
      });
      const trade = tradeData.get(h.symbol);
      const currentPrice = trade?.price ?? stock?.last_price ?? null;
      const value =
        currentPrice != null ? Number(h.quantity) * Number(currentPrice) : 0;
      const status = stock?.shariah_status ?? 'unknown';

      totalValue += value;

      if (status === 'compliant') {
        compliantCount++;
        compliantValue += value;
      } else if (status === 'non_compliant') {
        nonCompliantCount++;
      } else {
        pendingCount++;
      }

      holdingsList.push({
        symbol: h.symbol,
        name: stock?.name ?? h.symbol,
        value,
        shariah_status: status,
      });
    }

    return {
      compliant_count: compliantCount,
      non_compliant_count: nonCompliantCount,
      pending_count: pendingCount,
      compliant_value: compliantValue,
      total_value: totalValue,
      compliant_percent:
        totalValue > 0 ? (compliantValue / totalValue) * 100 : 0,
      holdings: holdingsList,
    };
  }

  /**
   * GET /api/portfolio/purification — Purification calculator.
   * Only applies to non-blacklisted stocks (compliant or pending).
   * Purification = dividends_received × purification_rate
   */
  async getPurification(): Promise<{
    holdings: Array<{
      symbol: string;
      name: string;
      shariah_status: string;
      dividends_received: number;
      purification_rate: number;
      purification_amount: number;
    }>;
    total_purification: number;
    total_dividends: number;
  }> {
    const portfolioHoldings = await this.portfolioRepository.find({
      where: { is_open: true },
    });

    const holdings: Array<{
      symbol: string;
      name: string;
      shariah_status: string;
      dividends_received: number;
      purification_rate: number;
      purification_amount: number;
    }> = [];
    let totalPurification = 0;
    let totalDividends = 0;

    for (const h of portfolioHoldings) {
      const stock = await this.stockRepository.findOne({
        where: { symbol: h.symbol },
      });
      const status = stock?.shariah_status ?? 'unknown';
      const dividends = Number(h.dividends_received);
      const rate = Number(h.purification_rate);

      // Purification only applies to non-blacklisted stocks
      // (compliant or pending — not non_compliant)
      const purificationAmount =
        status !== 'non_compliant' ? dividends * rate : 0;

      totalDividends += dividends;
      totalPurification += purificationAmount;

      if (dividends > 0) {
        holdings.push({
          symbol: h.symbol,
          name: stock?.name ?? h.symbol,
          shariah_status: status,
          dividends_received: dividends,
          purification_rate: rate,
          purification_amount: purificationAmount,
        });
      }
    }

    return {
      holdings,
      total_purification: totalPurification,
      total_dividends: totalDividends,
    };
  }

  /**
   * Get cash balance from ATrad Redis cache.
   */
  private async getATradCashBalance(): Promise<number> {
    try {
      const cached = await this.redisService.getJson<{
        cashBalance?: number;
        buyingPower?: number;
      }>('atrad:last_sync');
      return Number(cached?.cashBalance ?? cached?.buyingPower ?? 0);
    } catch {
      return 0;
    }
  }

  /**
   * Get trade data from Redis cache for live prices.
   */
  private async getTradeData(): Promise<
    Map<string, { price: number; change: number }>
  > {
    const map = new Map<string, { price: number; change: number }>();
    const cached = await this.redisService.getJson<{
      reqTradeSummery?: Array<{
        symbol?: string;
        lastTradedPrice?: number;
        priceChange?: number;
      }>;
    }>('cse:trade_summary');

    const trades = cached?.reqTradeSummery ?? [];
    for (const t of trades) {
      if (t.symbol) {
        map.set(t.symbol, {
          price: t.lastTradedPrice ?? 0,
          change: t.priceChange ?? 0,
        });
      }
    }
    return map;
  }

  /**
   * Calculate total portfolio value from holdings and trade data.
   */
  private calcTotalValue(
    holdings: Portfolio[],
    tradeData: Map<string, { price: number; change: number }>,
  ): number {
    let total = 0;
    for (const h of holdings) {
      const trade = tradeData.get(h.symbol);
      const price = trade?.price ?? Number(h.buy_price);
      total += Number(h.quantity) * price;
    }
    return total;
  }
}
