import { Entity, PrimaryGeneratedColumn, Column, Index, Unique } from 'typeorm';

@Entity('crypto_technical_signals')
@Unique(['symbol', 'timeframe', 'date'])
@Index(['symbol', 'timeframe', 'date'])
export class CryptoTechnicalSignal {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 20 })
  symbol: string;

  @Column({ type: 'varchar', length: 5 })
  timeframe: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  close_price: number;

  @Column({ type: 'decimal', precision: 18, scale: 8, nullable: true })
  sma_20: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 8, nullable: true })
  sma_50: number | null;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  rsi_14: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 8, nullable: true })
  macd_line: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 8, nullable: true })
  macd_signal: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 8, nullable: true })
  macd_histogram: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 8, nullable: true })
  bollinger_upper: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 8, nullable: true })
  bollinger_middle: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 8, nullable: true })
  bollinger_lower: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 8, nullable: true })
  atr_14: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  volume_avg_20: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  overall_signal: string | null; // 'BULLISH', 'NEUTRAL', 'BEARISH'

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  signal_score: number | null; // -100 to +100
}
