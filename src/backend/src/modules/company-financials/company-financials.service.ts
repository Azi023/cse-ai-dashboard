import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanyFinancial, Stock } from '../../entities';

const VALID_QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4', 'ANNUAL'];

interface CreateFinancialDto {
  symbol: string;
  fiscal_year: string;
  quarter: string;
  total_revenue?: number | null;
  interest_income?: number | null;
  non_compliant_income?: number | null;
  net_profit?: number | null;
  earnings_per_share?: number | null;
  total_assets?: number | null;
  total_liabilities?: number | null;
  shareholders_equity?: number | null;
  interest_bearing_debt?: number | null;
  interest_bearing_deposits?: number | null;
  receivables?: number | null;
  prepayments?: number | null;
  cash_and_equivalents?: number | null;
  pe_ratio?: number | null;
  pb_ratio?: number | null;
  debt_to_equity?: number | null;
  return_on_equity?: number | null;
  dividend_yield?: number | null;
  source?: string;
  report_date?: string | null;
}

type UpdateFinancialDto = Partial<Omit<CreateFinancialDto, 'symbol'>>;

@Injectable()
export class CompanyFinancialsService {
  private readonly logger = new Logger(CompanyFinancialsService.name);

  constructor(
    @InjectRepository(CompanyFinancial)
    private readonly financialRepository: Repository<CompanyFinancial>,
    @InjectRepository(Stock)
    private readonly stockRepository: Repository<Stock>,
  ) {}

  /**
   * POST /api/financials — Create a new financial record.
   */
  async create(dto: CreateFinancialDto): Promise<CompanyFinancial> {
    if (!dto.symbol || !dto.fiscal_year || !dto.quarter) {
      throw new BadRequestException(
        'symbol, fiscal_year, and quarter are required',
      );
    }

    const quarter = dto.quarter.toUpperCase();
    if (!VALID_QUARTERS.includes(quarter)) {
      throw new BadRequestException(
        `quarter must be one of: ${VALID_QUARTERS.join(', ')}`,
      );
    }

    const symbol = dto.symbol.toUpperCase();

    // Check for duplicates
    const existing = await this.financialRepository.findOne({
      where: { symbol, fiscal_year: dto.fiscal_year, quarter },
    });
    if (existing) {
      throw new ConflictException(
        `Financial record already exists for ${symbol} ${dto.fiscal_year} ${quarter}. Use PUT to update.`,
      );
    }

    const record = this.financialRepository.create({
      symbol,
      fiscal_year: dto.fiscal_year,
      quarter,
      total_revenue: dto.total_revenue ?? null,
      interest_income: dto.interest_income ?? null,
      non_compliant_income: dto.non_compliant_income ?? null,
      net_profit: dto.net_profit ?? null,
      earnings_per_share: dto.earnings_per_share ?? null,
      total_assets: dto.total_assets ?? null,
      total_liabilities: dto.total_liabilities ?? null,
      shareholders_equity: dto.shareholders_equity ?? null,
      interest_bearing_debt: dto.interest_bearing_debt ?? null,
      interest_bearing_deposits: dto.interest_bearing_deposits ?? null,
      receivables: dto.receivables ?? null,
      prepayments: dto.prepayments ?? null,
      cash_and_equivalents: dto.cash_and_equivalents ?? null,
      pe_ratio: dto.pe_ratio ?? null,
      pb_ratio: dto.pb_ratio ?? null,
      debt_to_equity: dto.debt_to_equity ?? null,
      return_on_equity: dto.return_on_equity ?? null,
      dividend_yield: dto.dividend_yield ?? null,
      source: dto.source ?? 'MANUAL',
      report_date: dto.report_date ? new Date(dto.report_date) : null,
    });

    // Auto-calculate derived ratios
    await this.calculateDerivedRatios(record);

    const saved = await this.financialRepository.save(record);
    this.logger.log(
      `Created financial record for ${symbol} ${dto.fiscal_year} ${quarter}`,
    );
    return saved;
  }

  /**
   * GET /api/financials/:symbol — All financial records for a symbol.
   */
  async getBySymbol(symbol: string): Promise<CompanyFinancial[]> {
    return this.financialRepository.find({
      where: { symbol: symbol.toUpperCase() },
      order: { fiscal_year: 'DESC', quarter: 'ASC' },
    });
  }

  /**
   * GET /api/financials/:symbol/latest — Most recent financial record.
   */
  async getLatest(symbol: string): Promise<CompanyFinancial> {
    const record = await this.financialRepository.findOne({
      where: { symbol: symbol.toUpperCase() },
      order: { fiscal_year: 'DESC', quarter: 'DESC' },
    });

    if (!record) {
      throw new NotFoundException(
        `No financial records found for ${symbol.toUpperCase()}`,
      );
    }

    return record;
  }

  /**
   * PUT /api/financials/:id — Update an existing financial record.
   */
  async update(
    id: number,
    dto: UpdateFinancialDto,
  ): Promise<CompanyFinancial> {
    const record = await this.financialRepository.findOne({ where: { id } });
    if (!record) {
      throw new NotFoundException(`Financial record with id ${id} not found`);
    }

    if (dto.fiscal_year !== undefined) record.fiscal_year = dto.fiscal_year;
    if (dto.quarter !== undefined) {
      const quarter = dto.quarter.toUpperCase();
      if (!VALID_QUARTERS.includes(quarter)) {
        throw new BadRequestException(
          `quarter must be one of: ${VALID_QUARTERS.join(', ')}`,
        );
      }
      record.quarter = quarter;
    }

    // Income Statement fields
    if (dto.total_revenue !== undefined)
      record.total_revenue = dto.total_revenue;
    if (dto.interest_income !== undefined)
      record.interest_income = dto.interest_income;
    if (dto.non_compliant_income !== undefined)
      record.non_compliant_income = dto.non_compliant_income;
    if (dto.net_profit !== undefined) record.net_profit = dto.net_profit;
    if (dto.earnings_per_share !== undefined)
      record.earnings_per_share = dto.earnings_per_share;

    // Balance Sheet fields
    if (dto.total_assets !== undefined) record.total_assets = dto.total_assets;
    if (dto.total_liabilities !== undefined)
      record.total_liabilities = dto.total_liabilities;
    if (dto.shareholders_equity !== undefined)
      record.shareholders_equity = dto.shareholders_equity;
    if (dto.interest_bearing_debt !== undefined)
      record.interest_bearing_debt = dto.interest_bearing_debt;
    if (dto.interest_bearing_deposits !== undefined)
      record.interest_bearing_deposits = dto.interest_bearing_deposits;
    if (dto.receivables !== undefined) record.receivables = dto.receivables;
    if (dto.prepayments !== undefined) record.prepayments = dto.prepayments;
    if (dto.cash_and_equivalents !== undefined)
      record.cash_and_equivalents = dto.cash_and_equivalents;

    // Ratios (allow manual override)
    if (dto.pe_ratio !== undefined) record.pe_ratio = dto.pe_ratio;
    if (dto.pb_ratio !== undefined) record.pb_ratio = dto.pb_ratio;
    if (dto.debt_to_equity !== undefined)
      record.debt_to_equity = dto.debt_to_equity;
    if (dto.return_on_equity !== undefined)
      record.return_on_equity = dto.return_on_equity;
    if (dto.dividend_yield !== undefined)
      record.dividend_yield = dto.dividend_yield;

    // Metadata
    if (dto.source !== undefined) record.source = dto.source;
    if (dto.report_date !== undefined)
      record.report_date = dto.report_date ? new Date(dto.report_date) : null;

    // Recalculate derived ratios where not manually provided
    await this.calculateDerivedRatios(record);

    const saved = await this.financialRepository.save(record);
    this.logger.log(`Updated financial record id=${id}`);
    return saved;
  }

  /**
   * GET /api/financials/summary/coverage — Coverage stats.
   */
  async getCoverage(): Promise<{
    total_stocks: number;
    stocks_with_financials: number;
    coverage_percent: number;
    symbols_with_data: string[];
  }> {
    const totalStocks = await this.stockRepository.count({
      where: { is_active: true },
    });

    const result = await this.financialRepository
      .createQueryBuilder('cf')
      .select('DISTINCT cf.symbol', 'symbol')
      .getRawMany<{ symbol: string }>();

    const symbolsWithData = result.map((r) => r.symbol).sort();

    return {
      total_stocks: totalStocks,
      stocks_with_financials: symbolsWithData.length,
      coverage_percent:
        totalStocks > 0 ? (symbolsWithData.length / totalStocks) * 100 : 0,
      symbols_with_data: symbolsWithData,
    };
  }

  /**
   * Auto-calculate derived ratios from fundamental data + stock's last_price.
   * Only overwrites null values — manual entries are preserved.
   */
  private async calculateDerivedRatios(
    record: CompanyFinancial,
  ): Promise<void> {
    const stock = await this.stockRepository.findOne({
      where: { symbol: record.symbol },
    });

    const eps = record.earnings_per_share
      ? Number(record.earnings_per_share)
      : null;
    const equity = record.shareholders_equity
      ? Number(record.shareholders_equity)
      : null;
    const debt = record.interest_bearing_debt
      ? Number(record.interest_bearing_debt)
      : null;
    const netProfit = record.net_profit ? Number(record.net_profit) : null;
    const lastPrice = stock?.last_price ? Number(stock.last_price) : null;
    const sharesOutstanding = stock?.shares_outstanding
      ? Number(stock.shares_outstanding)
      : null;

    // P/E = last_price / EPS
    if (record.pe_ratio == null && lastPrice != null && eps != null && eps !== 0) {
      record.pe_ratio = Number((lastPrice / eps).toFixed(4));
    }

    // P/B = market_cap / shareholders_equity
    // or last_price / (equity / shares_outstanding)
    if (
      record.pb_ratio == null &&
      lastPrice != null &&
      equity != null &&
      equity !== 0 &&
      sharesOutstanding != null &&
      sharesOutstanding !== 0
    ) {
      const bookValuePerShare = equity / sharesOutstanding;
      if (bookValuePerShare !== 0) {
        record.pb_ratio = Number(
          (lastPrice / bookValuePerShare).toFixed(4),
        );
      }
    }

    // D/E = interest_bearing_debt / shareholders_equity
    if (
      record.debt_to_equity == null &&
      debt != null &&
      equity != null &&
      equity !== 0
    ) {
      record.debt_to_equity = Number((debt / equity).toFixed(4));
    }

    // ROE = net_profit / shareholders_equity
    if (
      record.return_on_equity == null &&
      netProfit != null &&
      equity != null &&
      equity !== 0
    ) {
      record.return_on_equity = Number((netProfit / equity).toFixed(4));
    }
  }
}
