import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('market_snapshots')
@Index(['date'], { unique: true })
export class MarketSnapshot {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  aspi_close: number | null;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  aspi_change_pct: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  sp20_close: number | null;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  sp20_change_pct: number | null;

  @Column({ type: 'bigint', nullable: true })
  total_volume: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  total_turnover: number | null;

  @Column({ type: 'int', nullable: true })
  total_trades: number | null;

  @Column({ type: 'jsonb', nullable: true })
  top_gainers: unknown | null;

  @Column({ type: 'jsonb', nullable: true })
  top_losers: unknown | null;

  @Column({ type: 'jsonb', nullable: true })
  sector_performance: unknown | null;

  @CreateDateColumn()
  created_at: Date;
}
