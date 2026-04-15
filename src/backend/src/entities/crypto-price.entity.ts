import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('crypto_prices')
@Index(['symbol', 'timestamp'])
export class CryptoPrice {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 20 })
  symbol: string;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  price: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  volume_24h: number | null;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  change_24h_pct: number | null;

  @CreateDateColumn()
  timestamp: Date;
}
