import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('crypto_dca_config')
export class CryptoDCAConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 20 })
  symbol: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount_usdt: number;

  /** 'daily' | 'weekly' | 'biweekly' */
  @Column({ type: 'varchar', length: 10 })
  frequency: string;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'date' })
  start_date: string;

  @Column({ type: 'timestamptz', nullable: true })
  last_execution: Date | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  total_invested: number;

  @Column({ type: 'decimal', precision: 18, scale: 8, default: 0 })
  total_units_bought: number;

  @Column({ type: 'decimal', precision: 18, scale: 8, default: 0 })
  average_cost: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
