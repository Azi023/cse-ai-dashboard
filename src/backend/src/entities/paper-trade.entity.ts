import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('paper_trades')
@Index(['portfolio_type', 'asset_type'])
@Index(['symbol'])
export class PaperTrade {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 20, default: 'paper_human' })
  portfolio_type: string; // 'ai_demo' | 'paper_human'

  @Column({ type: 'varchar', length: 20 })
  symbol: string;

  @Column({ type: 'varchar', length: 10, default: 'stock' })
  asset_type: string; // 'stock' | 'crypto'

  @Column({ type: 'varchar', length: 4 })
  direction: string; // 'BUY' | 'SELL'

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  price: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  total_cost: number; // price * quantity + fees

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  fees: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'timestamp', default: () => 'NOW()' })
  executed_at: Date;

  @CreateDateColumn()
  created_at: Date;
}
