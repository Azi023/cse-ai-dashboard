import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('investment_goals')
export class InvestmentGoal {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  target_amount: number;

  @Column({ type: 'date', nullable: true })
  target_date: Date | null;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'text', nullable: true })
  label: string | null; // e.g., "First LKR 100,000"

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
