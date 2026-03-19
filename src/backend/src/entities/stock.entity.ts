import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { DailyPrice } from './daily-price.entity';

@Entity('stocks')
export class Stock {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ length: 20 })
  symbol: string;

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  sector: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  market_cap: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  last_price: number | null;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  change_percent: number | null;

  @Column({ type: 'decimal', precision: 8, scale: 4, nullable: true })
  beta: number | null;

  @Column({ type: 'bigint', nullable: true })
  shares_outstanding: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  week52_high: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  week52_low: number | null;

  @Column({ length: 20, default: 'unknown' })
  shariah_status: string; // 'compliant', 'non_compliant', 'unknown', 'blacklisted'

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @OneToMany(() => DailyPrice, (price) => price.stock)
  daily_prices: DailyPrice[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
