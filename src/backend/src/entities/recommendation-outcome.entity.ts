import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

@Entity('recommendation_outcomes')
export class RecommendationOutcome {
  @PrimaryGeneratedColumn()
  id: number;

  // Soft FK to ai_recommendations.id
  @Column({ type: 'int' })
  recommendation_id: number;

  @Column({ type: 'varchar', length: 20 })
  symbol: string;

  @Column({ type: 'date' })
  recommended_date: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  recommended_price: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  price_1w: number | null;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  return_1w: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  price_1m: number | null;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  return_1m: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  price_3m: number | null;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  return_3m: number | null;

  @Column({ type: 'boolean', default: false })
  hit_stop_loss: boolean;

  @Column({ type: 'boolean', default: false })
  hit_take_profit: boolean;

  @Column({ type: 'boolean', default: false })
  was_purchased: boolean;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  max_drawdown: number | null;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  max_gain: number | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @UpdateDateColumn()
  updated_at: Date;
}
