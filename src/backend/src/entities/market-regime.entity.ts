import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('market_regimes')
@Index(['detected_at'])
export class MarketRegimeRecord {
  @PrimaryGeneratedColumn()
  id: number;

  // TRENDING_UP | TRENDING_DOWN | RANGING | HIGH_VOLATILITY | RECOVERY | CRISIS
  @Column({ type: 'varchar', length: 20 })
  regime: string;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  confidence: number;

  @Column({ type: 'jsonb', nullable: true })
  indicators: Record<string, number | null> | null;

  @Column({ type: 'text', nullable: true })
  reasoning: string | null;

  @Column({ type: 'timestamp' })
  detected_at: Date;

  @CreateDateColumn()
  created_at: Date;
}
