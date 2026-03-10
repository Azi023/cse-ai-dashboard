import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('monthly_deposits')
export class MonthlyDeposit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 7 })
  month: string; // '2026-03'

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  deposit_amount: number;

  @Column({ type: 'date' })
  deposit_date: Date;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  portfolio_value_at_deposit: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  cumulative_deposited: number;

  @Column({ type: 'varchar', length: 20, default: 'manual' })
  source: string; // 'manual' | 'atrad-auto'

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  created_at: Date;
}
