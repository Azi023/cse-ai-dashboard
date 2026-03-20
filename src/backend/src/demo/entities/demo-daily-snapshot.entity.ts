import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { DemoAccount } from './demo-account.entity';

@Entity('demo_daily_snapshots')
@Unique(['demo_account_id', 'snapshot_date'])
export class DemoDailySnapshot {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  demo_account_id: number;

  @ManyToOne(() => DemoAccount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'demo_account_id' })
  demo_account: DemoAccount;

  @Column({ type: 'date' })
  snapshot_date: Date;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  portfolio_value: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  cash_balance: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  holdings_value: number;

  @Column({ type: 'decimal', precision: 8, scale: 4, default: 0 })
  total_return_pct: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  aspi_value: number;

  @Column({ type: 'decimal', precision: 8, scale: 4, default: 0 })
  aspi_return_pct: number;

  @Column({ type: 'int', default: 0 })
  num_holdings: number;

  @Column({ type: 'int', default: 0 })
  trades_today: number;

  @CreateDateColumn()
  created_at: Date;
}
