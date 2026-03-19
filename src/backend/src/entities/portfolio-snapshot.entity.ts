import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('portfolio_snapshots')
@Index(['date'], { unique: true })
export class PortfolioSnapshot {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  total_value: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  total_invested: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  unrealized_pl: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  cash_balance: number;

  @Column({ type: 'int', default: 0 })
  holdings_count: number;

  @Column({ type: 'jsonb', nullable: true })
  holdings: unknown | null;

  @CreateDateColumn()
  created_at: Date;
}
