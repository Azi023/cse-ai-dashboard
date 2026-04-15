import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('user_preferences')
export class UserPreferences {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ length: 100 })
  username: string;

  @Column({ type: 'boolean', default: true })
  shariah_mode: boolean;

  @Column({ type: 'varchar', length: 10, default: 'pro' })
  dashboard_mode: string; // 'simple' | 'pro'

  @Column({ type: 'varchar', length: 5, default: 'en' })
  language: string; // 'en' | 'si' | 'ta'

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
