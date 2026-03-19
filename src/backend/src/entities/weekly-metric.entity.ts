import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('weekly_metrics')
@Index(['week_start'], { unique: true })
export class WeeklyMetric {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  week_start: string;

  @Column({ type: 'date' })
  week_end: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  aspi_start: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  aspi_end: number | null;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  aspi_return_pct: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  portfolio_start: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  portfolio_end: number | null;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  portfolio_return_pct: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  best_holding: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  worst_holding: string | null;

  @CreateDateColumn()
  created_at: Date;
}
