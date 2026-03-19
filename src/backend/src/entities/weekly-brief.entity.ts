import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('weekly_briefs')
export class WeeklyBrief {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ type: 'date' })
  week_start: string;

  @Column({ type: 'date' })
  week_end: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  model_used: string | null;

  @Column({ type: 'integer', nullable: true })
  tokens_used: number | null;

  @CreateDateColumn()
  created_at: Date;
}
