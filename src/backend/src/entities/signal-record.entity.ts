import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('signal_records')
export class SignalRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ length: 20 })
  symbol: string;

  @Column({ length: 10 })
  direction: string; // 'BUY', 'SELL', 'HOLD'

  @Column({ length: 10 })
  confidence: string; // 'HIGH', 'MEDIUM', 'LOW'

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  price_at_signal: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  price_after_7d: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  price_after_14d: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  price_after_30d: number | null;

  @Column({ type: 'decimal', precision: 8, scale: 4, nullable: true })
  return_7d: number | null;

  @Column({ type: 'decimal', precision: 8, scale: 4, nullable: true })
  return_14d: number | null;

  @Column({ type: 'decimal', precision: 8, scale: 4, nullable: true })
  return_30d: number | null;

  @Column({ type: 'text', nullable: true })
  reasoning: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  outcome: string; // 'pending', 'win', 'loss', 'neutral'

  @Column({ type: 'date' })
  signal_date: Date;

  @CreateDateColumn()
  created_at: Date;
}
