import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('company_financials')
@Index(['symbol', 'fiscal_year', 'quarter'], { unique: true })
export class CompanyFinancial {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 20 })
  symbol: string;

  @Column({ type: 'varchar', length: 10 })
  fiscal_year: string;

  @Column({ type: 'varchar', length: 10 })
  quarter: string; // 'Q1', 'Q2', 'Q3', 'Q4', 'ANNUAL'

  // --- Income Statement ---
  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  total_revenue: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  interest_income: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  non_compliant_income: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  net_profit: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  earnings_per_share: number | null;

  // --- Balance Sheet ---
  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  total_assets: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  total_liabilities: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  shareholders_equity: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  interest_bearing_debt: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  interest_bearing_deposits: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  receivables: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  prepayments: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  cash_and_equivalents: number | null;

  // --- Derived / Valuation Ratios ---
  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  pe_ratio: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  pb_ratio: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  debt_to_equity: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  return_on_equity: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  dividend_yield: number | null;

  // --- Metadata ---
  @Column({ type: 'varchar', length: 30, default: 'MANUAL' })
  source: string; // 'MANUAL', 'CSE_ANNUAL_REPORT', 'PARSED'

  @Column({ type: 'date', nullable: true })
  report_date: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
