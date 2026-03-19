import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('technical_signals')
@Index(['date', 'symbol'], { unique: true })
export class TechnicalSignal {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar', length: 20 })
  symbol: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  close_price: number | null;

  // SMA
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  sma_20: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  sma_50: number | null;

  // BULLISH, BEARISH, GOLDEN_CROSS, DEATH_CROSS, NEUTRAL
  @Column({ type: 'varchar', length: 20, nullable: true })
  sma_trend: string | null;

  // RSI
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true })
  rsi_14: number | null;

  // OVERSOLD, NEUTRAL, OVERBOUGHT
  @Column({ type: 'varchar', length: 15, nullable: true })
  rsi_signal: string | null;

  // MACD
  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  macd_line: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  macd_signal_line: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  macd_histogram: number | null;

  // BULLISH, BEARISH, POSITIVE, NEGATIVE
  @Column({ type: 'varchar', length: 15, nullable: true })
  macd_crossover: string | null;

  // Support & Resistance
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  support_20d: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  resistance_20d: number | null;

  // ATR
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  atr_14: number | null;

  // Volume
  @Column({ type: 'bigint', nullable: true })
  volume_avg_20d: number | null;

  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true })
  volume_ratio: number | null;

  // ACCUMULATION, DISTRIBUTION, NEUTRAL
  @Column({ type: 'varchar', length: 15, nullable: true })
  volume_trend: string | null;

  // BULLISH_ENGULFING, BEARISH_ENGULFING, BULLISH_HAMMER, DOJI, etc.
  @Column({ type: 'varchar', length: 30, nullable: true })
  candlestick_pattern: string | null;

  // STRONG_BUY, BUY, NEUTRAL, SELL, STRONG_SELL
  @Column({ type: 'varchar', length: 15 })
  overall_signal: string;

  @Column({ type: 'int' })
  signal_score: number;

  @Column({ type: 'text', nullable: true })
  signal_summary: string | null;

  @CreateDateColumn()
  created_at: Date;
}
