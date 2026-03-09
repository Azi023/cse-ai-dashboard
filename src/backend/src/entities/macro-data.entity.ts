import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('macro_data')
@Index(['indicator', 'data_date'], { unique: true })
export class MacroData {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100 })
  indicator: string; // 'interest_rate', 'inflation', 'usd_lkr', 'aspi', 'sp_sl20'

  @Column({ type: 'date' })
  data_date: Date;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  value: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  source: string | null;

  @CreateDateColumn()
  created_at: Date;
}
