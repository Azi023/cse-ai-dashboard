import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Portfolio, Stock, ShariahScreening, DailyPrice } from '../../entities';

@Injectable()
export class ExportService {
  constructor(
    @InjectRepository(Portfolio)
    private readonly portfolioRepo: Repository<Portfolio>,
    @InjectRepository(Stock)
    private readonly stockRepo: Repository<Stock>,
    @InjectRepository(ShariahScreening)
    private readonly shariahRepo: Repository<ShariahScreening>,
    @InjectRepository(DailyPrice)
    private readonly priceRepo: Repository<DailyPrice>,
  ) {}

  async getPortfolioExport(): Promise<{
    csv: string;
    json: Record<string, unknown>[];
    generatedAt: string;
  }> {
    const holdings = await this.portfolioRepo.find();
    const rows: Record<string, unknown>[] = [];

    for (const h of holdings) {
      const stock = await this.stockRepo.findOne({
        where: { symbol: h.symbol },
      });
      const currentPrice = stock ? Number(stock.last_price) || 0 : 0;
      const invested = Number(h.quantity) * Number(h.buy_price);
      const currentVal = Number(h.quantity) * currentPrice;
      const pnl = currentVal - invested;
      const pnlPercent = invested > 0 ? (pnl / invested) * 100 : 0;

      rows.push({
        symbol: h.symbol,
        name: stock?.name || h.symbol,
        sector: stock?.sector || '',
        quantity: Number(h.quantity),
        buy_price: Number(h.buy_price),
        buy_date: h.buy_date,
        current_price: currentPrice,
        invested_value: Math.round(invested * 100) / 100,
        current_value: Math.round(currentVal * 100) / 100,
        pnl: Math.round(pnl * 100) / 100,
        pnl_percent: Math.round(pnlPercent * 100) / 100,
        shariah_status: stock?.shariah_status || 'pending_review',
        dividends_received: Number(h.dividends_received) || 0,
        purification_rate: Number(h.purification_rate) || 0,
        notes: h.notes || '',
      });
    }

    // Build CSV
    const headers = [
      'Symbol',
      'Name',
      'Sector',
      'Quantity',
      'Buy Price',
      'Buy Date',
      'Current Price',
      'Invested',
      'Current Value',
      'P&L',
      'P&L %',
      'Shariah Status',
      'Dividends',
      'Purification Rate',
      'Notes',
    ];
    const csvRows = [headers.join(',')];
    for (const row of rows) {
      csvRows.push(
        [
          row.symbol,
          `"${row.name}"`,
          `"${row.sector}"`,
          row.quantity,
          row.buy_price,
          row.buy_date,
          row.current_price,
          row.invested_value,
          row.current_value,
          row.pnl,
          row.pnl_percent,
          row.shariah_status,
          row.dividends_received,
          row.purification_rate,
          `"${row.notes}"`,
        ].join(','),
      );
    }

    return {
      csv: csvRows.join('\n'),
      json: rows,
      generatedAt: new Date().toISOString(),
    };
  }

  async getShariahReport(): Promise<{
    csv: string;
    json: Record<string, unknown>[];
    generatedAt: string;
    summary: {
      total: number;
      compliant: number;
      nonCompliant: number;
      pending: number;
    };
  }> {
    const stocks = await this.stockRepo.find({
      where: { is_active: true },
      order: { symbol: 'ASC' },
    });

    const screenings = await this.shariahRepo.find();
    const screeningMap = new Map<string, ShariahScreening>();
    for (const s of screenings) {
      screeningMap.set(s.symbol, s);
    }

    const rows: Record<string, unknown>[] = [];
    let compliant = 0;
    let nonCompliant = 0;
    let pending = 0;

    for (const stock of stocks) {
      const screening = screeningMap.get(stock.symbol);
      const status = stock.shariah_status;

      if (status === 'compliant') compliant++;
      else if (status === 'non_compliant') nonCompliant++;
      else pending++;

      rows.push({
        symbol: stock.symbol,
        name: stock.name,
        sector: stock.sector || '',
        shariah_status: status,
        tier1_result: screening?.tier1_result || '',
        tier2_pass: screening?.tier2_pass ?? null,
        interest_income_ratio: screening?.interest_income_ratio ?? null,
        debt_ratio: screening?.debt_ratio ?? null,
        interest_deposit_ratio: screening?.interest_deposit_ratio ?? null,
        receivables_ratio: screening?.receivables_ratio ?? null,
        last_screened: screening?.screened_at || '',
      });
    }

    const headers = [
      'Symbol',
      'Name',
      'Sector',
      'Shariah Status',
      'Tier 1 Result',
      'Tier 2 Pass',
      'Interest Income Ratio',
      'Debt Ratio',
      'Interest Deposit Ratio',
      'Receivables Ratio',
      'Last Screened',
    ];
    const csvRows = [headers.join(',')];
    for (const row of rows) {
      csvRows.push(
        [
          row.symbol,
          `"${row.name}"`,
          `"${row.sector}"`,
          row.shariah_status,
          `"${row.tier1_result}"`,
          row.tier2_pass ?? '',
          row.interest_income_ratio ?? '',
          row.debt_ratio ?? '',
          row.interest_deposit_ratio ?? '',
          row.receivables_ratio ?? '',
          row.last_screened,
        ].join(','),
      );
    }

    return {
      csv: csvRows.join('\n'),
      json: rows,
      generatedAt: new Date().toISOString(),
      summary: {
        total: stocks.length,
        compliant,
        nonCompliant,
        pending,
      },
    };
  }

  async getPriceHistoryExport(
    symbol: string,
    days: number = 365,
  ): Promise<{ csv: string; json: Record<string, unknown>[] }> {
    const stock = await this.stockRepo.findOne({
      where: { symbol: symbol.toUpperCase() },
    });

    if (!stock) {
      return { csv: 'No data found', json: [] };
    }

    const prices = await this.priceRepo.find({
      where: { stock_id: stock.id },
      order: { trade_date: 'DESC' },
      take: days,
    });

    const rows = prices.map((p) => ({
      date: p.trade_date,
      open: Number(p.open),
      high: Number(p.high),
      low: Number(p.low),
      close: Number(p.close),
      volume: Number(p.volume),
      turnover: Number(p.turnover),
    }));

    const headers = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume', 'Turnover'];
    const csvRows = [headers.join(',')];
    for (const row of rows) {
      csvRows.push(
        [row.date, row.open, row.high, row.low, row.close, row.volume, row.turnover].join(','),
      );
    }

    return { csv: csvRows.join('\n'), json: rows };
  }
}
