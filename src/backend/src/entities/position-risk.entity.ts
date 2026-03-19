import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('position_risk')
@Index(['date', 'symbol'], { unique: true })
export class PositionRisk {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar', length: 20 })
  symbol: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  entry_price: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  current_price: number;

  @Column({ type: 'int' })
  shares_held: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  stop_loss_atr: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  stop_loss_support: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  recommended_stop: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  take_profit: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  risk_per_share: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  reward_per_share: number;

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  risk_reward_ratio: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  max_loss_lkr: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  max_gain_lkr: number;

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  distance_to_stop_pct: number;

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  position_heat_pct: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  portfolio_heat_pct: number | null;

  // SAFE, CAUTION, DANGER
  @Column({ type: 'varchar', length: 10 })
  risk_status: string;

  @CreateDateColumn()
  created_at: Date;
}
