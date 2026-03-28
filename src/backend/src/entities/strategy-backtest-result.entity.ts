import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('strategy_backtest_results')
@Index(['strategy_id', 'run_date'], { unique: true })
export class StrategyBacktestResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 50 })
  strategy_id: string;

  @Column({ length: 100 })
  strategy_name: string;

  @Column({ type: 'date' })
  run_date: Date;

  @Column({ type: 'int', default: 0 })
  total_trades: number;

  @Column({ type: 'int', default: 0 })
  winning_trades: number;

  @Column({ type: 'int', default: 0 })
  losing_trades: number;

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 0 })
  win_rate: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  avg_return_pct: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  max_drawdown: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  sharpe_ratio: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  total_return_pct: number;

  @Column({ type: 'int', default: 0 })
  stocks_tested: number;

  @Column({ type: 'jsonb', nullable: true })
  trades_detail: object | null;

  @Column({ type: 'date', nullable: true })
  period_start: Date | null;

  @Column({ type: 'date', nullable: true })
  period_end: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes: string | null;

  @Column({ type: 'boolean', default: false })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;
}
