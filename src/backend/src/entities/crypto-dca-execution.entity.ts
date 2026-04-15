import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('crypto_dca_executions')
@Index(['config_id', 'executed_at'])
export class CryptoDCAExecution {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  config_id: number;

  @Column({ type: 'varchar', length: 20 })
  symbol: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount_usdt: number;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  price_at_execution: number;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  units_bought: number;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  cumulative_units: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  cumulative_invested: number;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  average_cost_after: number;

  @CreateDateColumn()
  executed_at: Date;
}
