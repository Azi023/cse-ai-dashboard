import { Entity, PrimaryGeneratedColumn, Column, Index, Unique } from 'typeorm';

@Entity('crypto_ohlcv')
@Unique(['symbol', 'timeframe', 'timestamp'])
@Index(['symbol', 'timeframe', 'timestamp'])
export class CryptoOHLCV {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 20 })
  symbol: string;

  @Column({ type: 'varchar', length: 5 })
  timeframe: string; // '1d', '1h', '5m'

  @Column({ type: 'timestamptz' })
  timestamp: Date;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  open: number;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  high: number;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  low: number;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  close: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  volume: number;
}
