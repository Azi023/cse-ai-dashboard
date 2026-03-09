import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  CreateDateColumn,
} from 'typeorm';
import { Stock } from './stock.entity';

@Entity('daily_prices')
@Index(['stock_id', 'trade_date'], { unique: true })
export class DailyPrice {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  stock_id: number;

  @ManyToOne(() => Stock, (stock) => stock.daily_prices)
  @JoinColumn({ name: 'stock_id' })
  stock: Stock;

  @Column({ type: 'date' })
  trade_date: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  open: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  high: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  low: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  close: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  previous_close: number | null;

  @Column({ type: 'bigint', default: 0 })
  volume: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  turnover: number;

  @Column({ type: 'int', default: 0 })
  trades_count: number;

  @CreateDateColumn()
  created_at: Date;
}
