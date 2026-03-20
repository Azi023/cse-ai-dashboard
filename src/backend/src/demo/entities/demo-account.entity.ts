import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

// LESSON: Nullable string columns MUST have type: 'varchar' explicitly.
// When emitDecoratorMetadata is on, TypeScript emits 'Object' for 'string | null'
// union types at runtime, which TypeORM cannot map to a Postgres type.

@Entity('demo_accounts')
export class DemoAccount {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100, default: 'Default Demo' })
  name: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 1000000.0 })
  initial_capital: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 1000000.0 })
  cash_balance: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  total_fees_paid: number;

  // MUST have type: 'varchar' — 'string | null' emits 'Object' via emitDecoratorMetadata
  @Column({ type: 'varchar', length: 50, nullable: true })
  strategy: string | null;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
