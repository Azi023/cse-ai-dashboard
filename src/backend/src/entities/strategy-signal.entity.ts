import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('strategy_signals')
@Index(['signal_date', 'symbol', 'strategy_id'], { unique: true })
export class StrategySignal {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  @Index()
  signal_date: string;

  @Column({ type: 'varchar', length: 20 })
  @Index()
  symbol: string;

  @Column({ type: 'varchar', length: 30 })
  strategy_id: string;

  @Column({ type: 'varchar', length: 50 })
  strategy_name: string;

  // BUY | SELL | HOLD
  @Column({ type: 'varchar', length: 10 })
  direction: string;

  // HIGH | MEDIUM | LOW
  @Column({ type: 'varchar', length: 10 })
  confidence: string;

  // 0-100 composite score
  @Column({ type: 'int' })
  score: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  entry_price: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  stop_loss: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  take_profit: number | null;

  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true })
  risk_reward_ratio: number | null;

  @Column({ type: 'int', nullable: true })
  position_size_shares: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  position_size_lkr: number | null;

  @Column({ type: 'jsonb', nullable: true })
  reasoning: string[] | null;

  @Column({ type: 'jsonb', nullable: true })
  rules_triggered: Array<{ rule: string; actual: unknown; threshold: unknown }> | null;

  // Which regime was active when this signal was generated
  @Column({ type: 'varchar', length: 20 })
  market_regime: string;

  // Signal valid for 3 trading days from generation
  @Column({ type: 'timestamp' })
  expires_at: Date;

  // 0-1: how much data was available (0 = no data, 1 = full data)
  @Column({ type: 'decimal', precision: 4, scale: 2, nullable: true })
  data_confidence: number | null;

  @CreateDateColumn()
  created_at: Date;
}
