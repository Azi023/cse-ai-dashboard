import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { DemoAccount } from './demo-account.entity';

@Entity('demo_holdings')
@Unique(['demo_account_id', 'stock_id'])
export class DemoHolding {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  demo_account_id: number;

  @ManyToOne(() => DemoAccount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'demo_account_id' })
  demo_account: DemoAccount;

  @Column({ type: 'int' })
  stock_id: number;

  @Column({ type: 'varchar', length: 20 })
  symbol: string;

  @Column({ type: 'int', default: 0 })
  quantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  avg_cost_basis: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  total_invested: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  realized_pnl: number;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  shariah_status: string;

  @UpdateDateColumn()
  updated_at: Date;
}
