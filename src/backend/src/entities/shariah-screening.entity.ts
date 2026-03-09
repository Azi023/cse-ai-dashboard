import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('shariah_screenings')
@Index(['symbol', 'screened_at'])
export class ShariahScreening {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 20 })
  symbol: string;

  @Column({ length: 20 })
  status: string; // 'compliant', 'non_compliant', 'blacklisted', 'needs_review'

  @Column({ type: 'varchar', length: 50, nullable: true })
  tier1_result: string | null; // 'pass', 'fail_alcohol', 'fail_tobacco', 'fail_finance', 'fail_insurance', etc.

  @Column({ type: 'decimal', precision: 8, scale: 4, nullable: true })
  interest_income_ratio: number | null;

  @Column({ type: 'decimal', precision: 8, scale: 4, nullable: true })
  debt_ratio: number | null;

  @Column({ type: 'decimal', precision: 8, scale: 4, nullable: true })
  interest_deposit_ratio: number | null;

  @Column({ type: 'decimal', precision: 8, scale: 4, nullable: true })
  receivables_ratio: number | null;

  @Column({ type: 'boolean', default: false })
  tier2_pass: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'timestamp' })
  screened_at: Date;

  @CreateDateColumn()
  created_at: Date;
}
