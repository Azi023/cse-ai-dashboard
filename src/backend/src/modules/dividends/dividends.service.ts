import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { Dividend, Stock, Portfolio } from '../../entities';

@Injectable()
export class DividendsService {
  private readonly logger = new Logger(DividendsService.name);

  constructor(
    @InjectRepository(Dividend)
    private readonly dividendRepository: Repository<Dividend>,
    @InjectRepository(Stock)
    private readonly stockRepository: Repository<Stock>,
    @InjectRepository(Portfolio)
    private readonly portfolioRepository: Repository<Portfolio>,
  ) {}

  /**
   * Get dividend history for a stock.
   */
  async getBySymbol(symbol: string): Promise<Dividend[]> {
    return this.dividendRepository.find({
      where: { symbol: symbol.toUpperCase() },
      order: { ex_date: 'DESC' },
    });
  }

  /**
   * Get upcoming ex-dividend dates (next 90 days).
   */
  async getUpcoming(): Promise<Dividend[]> {
    const today = new Date().toISOString().split('T')[0];
    return this.dividendRepository
      .createQueryBuilder('d')
      .where('d.ex_date >= :today', { today })
      .orderBy('d.ex_date', 'ASC')
      .getMany();
  }

  /**
   * Get dividend yield for a stock based on trailing 12-month dividends.
   */
  async getDividendYield(
    symbol: string,
  ): Promise<{ symbol: string; annualDividend: number; yield: number | null }> {
    const stock = await this.stockRepository.findOne({
      where: { symbol: symbol.toUpperCase() },
    });

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const dividends = await this.dividendRepository
      .createQueryBuilder('d')
      .where('d.symbol = :symbol', { symbol: symbol.toUpperCase() })
      .andWhere('d.ex_date >= :date', { date: oneYearAgo.toISOString().split('T')[0] })
      .getMany();

    const annualDividend = dividends.reduce(
      (sum, d) => sum + (typeof d.amount_per_share === 'string' ? parseFloat(d.amount_per_share) : Number(d.amount_per_share)),
      0,
    );

    const price = stock?.last_price ? Number(stock.last_price) : null;
    const yieldPct = price && price > 0 ? (annualDividend / price) * 100 : null;

    return {
      symbol: symbol.toUpperCase(),
      annualDividend,
      yield: yieldPct ? Math.round(yieldPct * 100) / 100 : null,
    };
  }

  /**
   * Get portfolio dividend income summary.
   */
  async getPortfolioDividendIncome(): Promise<{
    holdings: Array<{
      symbol: string;
      quantity: number;
      dividends: Array<{ ex_date: string; amount_per_share: number; total: number }>;
      total_income: number;
    }>;
    total_portfolio_income: number;
  }> {
    const holdings = await this.portfolioRepository.find();
    const result: Array<{
      symbol: string;
      quantity: number;
      dividends: Array<{ ex_date: string; amount_per_share: number; total: number }>;
      total_income: number;
    }> = [];

    let totalPortfolioIncome = 0;

    for (const holding of holdings) {
      const dividends = await this.dividendRepository.find({
        where: { symbol: holding.symbol },
        order: { ex_date: 'DESC' },
      });

      const qty = Number(holding.quantity);
      const holdingDividends = dividends.map((d) => {
        const amount = typeof d.amount_per_share === 'string' ? parseFloat(d.amount_per_share) : Number(d.amount_per_share);
        return {
          ex_date: d.ex_date instanceof Date ? d.ex_date.toISOString().split('T')[0] : String(d.ex_date),
          amount_per_share: amount,
          total: Math.round(amount * qty * 100) / 100,
        };
      });

      const totalIncome = holdingDividends.reduce((s, d) => s + d.total, 0);
      totalPortfolioIncome += totalIncome;

      if (holdingDividends.length > 0) {
        result.push({
          symbol: holding.symbol,
          quantity: qty,
          dividends: holdingDividends,
          total_income: Math.round(totalIncome * 100) / 100,
        });
      }
    }

    return {
      holdings: result,
      total_portfolio_income: Math.round(totalPortfolioIncome * 100) / 100,
    };
  }

  /**
   * Add a dividend record.
   */
  async addDividend(data: {
    symbol: string;
    amount_per_share: number;
    ex_date: string;
    declaration_date?: string;
    payment_date?: string;
    type?: string;
    fiscal_year?: string;
  }): Promise<Dividend> {
    const dividend = new Dividend();
    dividend.symbol = data.symbol.toUpperCase();
    dividend.amount_per_share = data.amount_per_share;
    dividend.ex_date = new Date(data.ex_date);
    dividend.declaration_date = data.declaration_date ? new Date(data.declaration_date) : null;
    dividend.payment_date = data.payment_date ? new Date(data.payment_date) : null;
    dividend.type = data.type ?? 'cash';
    dividend.fiscal_year = data.fiscal_year ?? null;
    dividend.source = 'manual';

    return this.dividendRepository.save(dividend);
  }

  /**
   * Delete a dividend record.
   */
  async deleteDividend(id: number): Promise<void> {
    const result = await this.dividendRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Dividend ${id} not found`);
    }
  }
}
