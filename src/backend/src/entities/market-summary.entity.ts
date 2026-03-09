import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('market_summaries')
@Index(['summary_date'], { unique: true })
export class MarketSummary {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  summary_date: Date;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  aspi_value: number | null;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  aspi_change: number | null;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  aspi_change_percent: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  sp_sl20_value: number | null;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  sp_sl20_change: number | null;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  sp_sl20_change_percent: number | null;

  @Column({ type: 'bigint', nullable: true })
  total_volume: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  total_turnover: number | null;

  @Column({ type: 'int', nullable: true })
  total_trades: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  market_cap: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  foreign_buying: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  foreign_selling: number | null;

  @CreateDateColumn()
  created_at: Date;
}
