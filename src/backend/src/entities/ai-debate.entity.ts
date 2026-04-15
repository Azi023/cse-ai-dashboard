import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Bull/bear/synthesis debate per stock.
 *
 * One row per (symbol, debate_date) — 7-day caching via unique index.
 * Use debate_date = the Friday the debate was produced (weekly cron).
 */
@Entity('ai_debates')
@Index(['symbol', 'debate_date'], { unique: true })
export class AiDebate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 20 })
  @Index()
  symbol: string;

  @Column({ type: 'date' })
  @Index()
  debate_date: string;

  @Column({ type: 'text' })
  bull_thesis: string;

  @Column({ type: 'text' })
  bear_thesis: string;

  @Column({ type: 'text' })
  synthesis: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  price_target_p10: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  price_target_p50: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  price_target_p90: number | null;

  @Column({ type: 'int', nullable: true })
  confidence_score: number | null;

  @Column({ type: 'jsonb', nullable: true })
  key_risks: string[] | null;

  @Column({ type: 'jsonb', nullable: true })
  catalysts: string[] | null;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  price_at_debate: number;

  @Column({ type: 'int' })
  tokens_used: number;

  @Column({ type: 'varchar', length: 20 })
  provider: 'claude' | 'openai';

  @CreateDateColumn()
  created_at: Date;
}
