import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('stock_scores')
@Index(['date', 'symbol'], { unique: true })
export class StockScore {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  date: string;

  @Column({ length: 20 })
  symbol: string;

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 0 })
  composite_score: number;

  // Number of trading days with price data used in scoring
  @Column({ type: 'int', default: 0 })
  data_days: number;

  // true = < 20 days of data, score is not yet meaningful
  @Column({ type: 'boolean', default: false })
  is_placeholder: boolean;

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 50 })
  momentum_score: number;

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 50 })
  volume_score: number;

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 50 })
  volatility_score: number;

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 50 })
  sector_score: number;

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 50 })
  liquidity_score: number;

  // Fundamentals category scores (35% total)
  @Column({ type: 'decimal', precision: 6, scale: 2, default: 50 })
  earnings_growth_score: number;

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 50 })
  debt_health_score: number;

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 50 })
  roe_score: number;

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 50 })
  revenue_trend_score: number;

  // Valuation category scores (25% total)
  @Column({ type: 'decimal', precision: 6, scale: 2, default: 50 })
  pe_score: number;

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 50 })
  pb_score: number;

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 50 })
  dividend_score: number;

  // Technical category - week52 position (7%)
  @Column({ type: 'decimal', precision: 6, scale: 2, default: 50 })
  week52_position_score: number;

  // Full breakdown of inputs and weights
  @Column({ type: 'jsonb', nullable: true })
  components: unknown | null;

  @CreateDateColumn()
  created_at: Date;
}
