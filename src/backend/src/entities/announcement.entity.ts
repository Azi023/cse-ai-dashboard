import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('announcements')
export class Announcement {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ length: 50 })
  type: string; // 'financial', 'approved', 'circular', 'directive', 'non_compliance', 'new_listing', 'buy_in'

  @Column({ length: 500 })
  title: string;

  @Column({ type: 'text', nullable: true })
  content: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  category: string | null; // 'earnings', 'dividend', 'agm', 'board_change', 'regulatory', 'listing', 'other'

  @Index()
  @Column({ type: 'varchar', length: 20, nullable: true })
  symbol: string | null;

  @Column({ type: 'text', nullable: true })
  url: string | null;

  @Column({ type: 'timestamp', nullable: true })
  announced_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}
