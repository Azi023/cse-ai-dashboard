import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('dividends')
@Index(['symbol', 'ex_date'], { unique: true })
export class Dividend {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ length: 20 })
  symbol: string;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  amount_per_share: number;

  @Column({ type: 'date', nullable: true })
  declaration_date: Date | null;

  @Column({ type: 'date' })
  ex_date: Date;

  @Column({ type: 'date', nullable: true })
  payment_date: Date | null;

  @Column({ type: 'varchar', length: 20, default: 'cash' })
  type: string; // 'cash', 'stock', 'special'

  @Column({ type: 'varchar', length: 20, nullable: true })
  fiscal_year: string | null;

  @Column({ type: 'varchar', length: 50, default: 'manual' })
  source: string;

  @CreateDateColumn()
  created_at: Date;
}
