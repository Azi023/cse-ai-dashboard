import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('portfolio')
export class Portfolio {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 20 })
  symbol: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  buy_price: number;

  @Column({ type: 'date' })
  buy_date: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  sell_price: number | null;

  @Column({ type: 'date', nullable: true })
  sell_date: Date | null;

  @Column({ type: 'boolean', default: true })
  is_open: boolean;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  dividends_received: number;

  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0.03 })
  purification_rate: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    default: 0,
  })
  fees: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
