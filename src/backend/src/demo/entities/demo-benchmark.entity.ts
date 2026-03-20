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

@Entity('demo_benchmarks')
@Unique(['demo_account_id', 'benchmark_date'])
export class DemoBenchmark {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  demo_account_id: number;

  @ManyToOne(() => DemoAccount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'demo_account_id' })
  demo_account: DemoAccount;

  @Column({ type: 'date' })
  benchmark_date: Date;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  ai_portfolio_value: number;

  @Column({ type: 'decimal', precision: 8, scale: 4, default: 0 })
  ai_return_pct: number;

  @Column({ type: 'decimal', precision: 8, scale: 4, default: 0 })
  aspi_return_pct: number;

  @Column({ type: 'decimal', precision: 8, scale: 4, default: 0 })
  random_return_pct: number;

  @Column({ type: 'decimal', precision: 6, scale: 4, nullable: true })
  sharpe_ratio: number | null;

  @Column({ type: 'decimal', precision: 8, scale: 4, nullable: true })
  max_drawdown: number | null;

  @Column({ type: 'decimal', precision: 6, scale: 4, nullable: true })
  win_rate: number | null;

  @CreateDateColumn()
  created_at: Date;
}
