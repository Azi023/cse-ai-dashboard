import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export const ORDER_TYPES = ['STOP_LOSS', 'TAKE_PROFIT', 'LIMIT_BUY'] as const;
export const ORDER_ACTIONS = ['BUY', 'SELL'] as const;
export const ORDER_STATUSES = ['PENDING', 'APPROVED', 'EXECUTING', 'EXECUTED', 'FAILED', 'CANCELLED'] as const;
export const ORDER_SOURCES = ['RISK_SERVICE', 'AI_RECOMMENDATION', 'MANUAL'] as const;

export type OrderType = (typeof ORDER_TYPES)[number];
export type OrderAction = (typeof ORDER_ACTIONS)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type OrderSource = (typeof ORDER_SOURCES)[number];

@Entity('pending_orders')
export class PendingOrder {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 20 })
  symbol: string;

  @Column({ length: 20 })
  order_type: string; // 'STOP_LOSS' | 'TAKE_PROFIT' | 'LIMIT_BUY'

  @Column({ length: 10 })
  action: string; // 'BUY' | 'SELL'

  @Column({ type: 'int' })
  quantity: number;

  /** For TP/SL: the trigger/stop price. For limit orders: the limit price. */
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  trigger_price: number;

  /** Optional limit price for stop-limit orders. */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  limit_price: number | null;

  @Column({ length: 20, default: 'PENDING' })
  status: string; // PENDING | APPROVED | EXECUTING | EXECUTED | FAILED | CANCELLED

  @Column({ length: 50, nullable: true })
  source: string | null; // 'RISK_SERVICE' | 'AI_RECOMMENDATION' | 'MANUAL'

  @Column({ type: 'text', nullable: true })
  reason: string | null; // Why this order was suggested

  /** Snapshot of the PositionRisk data at time of order creation. */
  @Column({ type: 'jsonb', nullable: true })
  risk_data: Record<string, unknown> | null;

  @Column({ type: 'timestamp', nullable: true })
  approved_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  executed_at: Date | null;

  /** ATrad's internal order reference after execution. */
  @Column({ length: 100, nullable: true })
  atrad_order_id: string | null;

  /** Relative path to the screenshot taken at time of execution. */
  @Column({ length: 500, nullable: true })
  execution_screenshot: string | null;

  @Column({ type: 'text', nullable: true })
  error_message: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
