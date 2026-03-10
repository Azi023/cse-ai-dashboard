import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('alerts')
export class Alert {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'varchar', length: 20, nullable: true })
  symbol: string | null;

  @Column({ type: 'varchar', length: 50 })
  alert_type: string;
  // 'price_above', 'price_below', 'volume_spike', 'pnl_drop',
  // 'shariah_change', 'announcement', 'auto_generated'

  @Column({ type: 'varchar', length: 500 })
  title: string;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  threshold: number | null;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'boolean', default: false })
  is_read: boolean;

  @Column({ type: 'boolean', default: false })
  is_triggered: boolean;

  @Column({ type: 'timestamp', nullable: true })
  triggered_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}
