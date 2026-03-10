import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('news_items')
export class NewsItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 500 })
  title: string;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Index()
  @Column({ type: 'varchar', length: 100 })
  source: string;
  // 'daily_ft', 'economy_next', 'reuters', 'cnbc', 'google_news'

  @Column({ type: 'varchar', length: 1000, nullable: true })
  url: string | null;

  @Column({ type: 'varchar', length: 50, default: 'NEUTRAL' })
  impact_level: string;
  // 'HIGH', 'MEDIUM', 'LOW', 'NEUTRAL'

  @Column({ type: 'varchar', length: 50, default: 'MIXED' })
  impact_direction: string;
  // 'POSITIVE', 'NEGATIVE', 'MIXED'

  @Column({ type: 'simple-array', nullable: true })
  affected_symbols: string[] | null;

  @Column({ type: 'simple-array', nullable: true })
  affected_sectors: string[] | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  category: string | null;
  // 'MONETARY_POLICY', 'FISCAL_POLICY', 'CORPORATE', 'COMMODITY', 'GLOBAL', 'POLITICAL', 'SECTOR'

  @Column({ type: 'text', nullable: true })
  ai_analysis: string | null;

  @Index()
  @Column({ type: 'timestamp' })
  published_at: Date;

  @Column({ type: 'varchar', length: 64, unique: true })
  guid: string;

  @CreateDateColumn()
  created_at: Date;
}
