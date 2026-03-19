import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('ai_recommendations')
@Index(['week_start'], { unique: true })
export class AiRecommendation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  week_start: string;

  @Column({ type: 'varchar', length: 20 })
  recommended_stock: string;

  // 'HIGH', 'MEDIUM', 'LOW'
  @Column({ type: 'varchar', length: 10, default: 'MEDIUM' })
  confidence: string;

  @Column({ type: 'text' })
  reasoning: string;

  @Column({ type: 'text', nullable: true })
  price_outlook_3m: string | null;

  @Column({ type: 'jsonb', nullable: true })
  risk_flags: unknown | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  alternative: string | null;

  @Column({ type: 'varchar', length: 50, default: 'claude-sonnet-4-6' })
  model_used: string;

  @Column({ type: 'int', default: 0 })
  tokens_used: number;

  @CreateDateColumn()
  created_at: Date;
}
