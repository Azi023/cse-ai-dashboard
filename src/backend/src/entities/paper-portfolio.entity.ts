import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('paper_portfolios')
@Index(['portfolio_type', 'asset_type'], { unique: true })
export class PaperPortfolio {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 20, default: 'paper_human' })
  portfolio_type: string; // 'ai_demo' | 'paper_human'

  @Column({ type: 'varchar', length: 10, default: 'stock' })
  asset_type: string; // 'stock' | 'crypto'

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  initial_balance: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  current_cash: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
