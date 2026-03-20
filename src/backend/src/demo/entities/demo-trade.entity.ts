import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { DemoAccount } from './demo-account.entity';

// LESSON: Nullable string columns MUST have type: 'varchar' explicitly.

@Entity('demo_trades')
@Index('idx_demo_trades_account', ['demo_account_id'])
@Index('idx_demo_trades_symbol', ['symbol'])
@Index('idx_demo_trades_executed', ['executed_at'])
export class DemoTrade {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  demo_account_id: number;

  @ManyToOne(() => DemoAccount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'demo_account_id' })
  demo_account: DemoAccount;

  @Column({ type: 'int' })
  stock_id: number;

  @Column({ type: 'varchar', length: 20 })
  symbol: string;

  @Column({ type: 'varchar', length: 4 })
  direction: string; // 'BUY' | 'SELL'

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  total_value: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  fee: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  net_value: number;

  @Column({ type: 'varchar', length: 20, default: 'MANUAL' })
  source: string; // 'AI_SIGNAL' | 'AI_AUTO' | 'MANUAL' | 'STRATEGY_TEST'

  @Column({ type: 'int', nullable: true })
  signal_id: number | null;

  // MUST have type: 'text' — nullable text columns need explicit type
  @Column({ type: 'text', nullable: true })
  ai_reasoning: string | null;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  shariah_status: string; // 'COMPLIANT' | 'VERIFY' | 'PENDING'

  @Column({ type: 'jsonb', nullable: true })
  market_snapshot: Record<string, unknown> | null;

  @Column({ type: 'timestamp', default: () => 'NOW()' })
  executed_at: Date;

  @CreateDateColumn()
  created_at: Date;
}
