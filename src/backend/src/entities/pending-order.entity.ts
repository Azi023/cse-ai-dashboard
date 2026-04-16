import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export const ORDER_TYPES = [
  'STOP_LOSS',
  'TAKE_PROFIT',
  'LIMIT_BUY',
  'STOP_LIMIT_BUY',
  'STOP_LIMIT_SELL',
] as const;
export const ORDER_ACTIONS = ['BUY', 'SELL'] as const;
export const ORDER_STATUSES = [
  'PENDING',
  'APPROVED',
  'EXECUTING',
  'EXECUTED',
  'FAILED',
  'CANCELLED',
  'CANCELLING',
  'REJECTED',
] as const;
export const ORDER_SOURCES = [
  'RISK_SERVICE',
  'AI_RECOMMENDATION',
  'STRATEGY_ENGINE',
  'MANUAL',
] as const;

export const TIF_VALUES = ['DAY', 'GTC', 'GTD', 'IOC', 'FOK'] as const;
export const BOARD_VALUES = ['REGULAR', 'CROSSING', 'AON', 'AUCTION'] as const;

export type OrderType = (typeof ORDER_TYPES)[number];
export type OrderAction = (typeof ORDER_ACTIONS)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type OrderSource = (typeof ORDER_SOURCES)[number];
export type TifValue = (typeof TIF_VALUES)[number];
export type BoardValue = (typeof BOARD_VALUES)[number];

// !! LESSON: All nullable string columns MUST have type: 'varchar' explicitly.
// When emitDecoratorMetadata is on, TypeScript emits 'Object' for 'string | null'
// union types at runtime, which TypeORM cannot map to a Postgres type.
// Rule: nullable string → @Column({ type: 'varchar', length: N, nullable: true })

@Entity('pending_orders')
export class PendingOrder {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 20 })
  symbol: string;

  @Column({ type: 'varchar', length: 20 })
  order_type: string; // 'STOP_LOSS' | 'TAKE_PROFIT' | 'LIMIT_BUY'

  @Column({ type: 'varchar', length: 10 })
  action: string; // 'BUY' | 'SELL'

  @Column({ type: 'int' })
  quantity: number;

  /** For TP/SL: the trigger/stop price. For limit orders: the limit price. */
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  trigger_price: number;

  /** Optional limit price for stop-limit orders. */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  limit_price: number | null;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: string; // PENDING | APPROVED | EXECUTING | EXECUTED | FAILED | CANCELLED

  // MUST have type: 'varchar' — 'string | null' emits 'Object' via emitDecoratorMetadata
  @Column({ type: 'varchar', length: 50, nullable: true })
  source: string | null; // 'RISK_SERVICE' | 'AI_RECOMMENDATION' | 'MANUAL'

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  /** Snapshot of the PositionRisk data at time of order creation. */
  @Column({ type: 'jsonb', nullable: true })
  risk_data: Record<string, unknown> | null;

  /**
   * Strategy engine ID that generated this signal (e.g. 'MEAN_REVERSION').
   * Null for manually created or risk-service suggested orders.
   */
  // MUST have type: 'varchar' — 'string | null' emits 'Object' via emitDecoratorMetadata
  @Column({ type: 'varchar', length: 50, nullable: true })
  strategy_id: string | null;

  /**
   * Full safety check pipeline result stored as JSON.
   * Allows the approval UI to show which checks passed/failed.
   */
  @Column({ type: 'jsonb', nullable: true })
  safety_check_result: Record<string, unknown> | null;

  /** Time in force: DAY, GTC, GTD, IOC, FOK. Defaults to DAY. */
  @Column({ type: 'varchar', length: 10, default: 'DAY' })
  tif: string;

  /** Trading board: REGULAR, CROSSING, AON, AUCTION. Defaults to REGULAR. */
  @Column({ type: 'varchar', length: 10, default: 'REGULAR' })
  board: string;

  /** Stop/trigger price for STOP_LIMIT orders. Null for plain LIMIT orders. */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  stop_price: number | null;

  /** ATrad blotter status: NEW, FILLED, P.FILLED, CANCELED, etc. Updated by agent polling. */
  // MUST have type: 'varchar' — 'string | null' emits 'Object' via emitDecoratorMetadata
  @Column({ type: 'varchar', length: 50, nullable: true })
  atrad_blotter_status: string | null;

  /** For OCO pairs: points to the counterpart order (e.g., stop-loss ↔ take-profit). */
  @Column({ type: 'int', nullable: true })
  linked_order_id: number | null;

  @Column({ type: 'timestamp', nullable: true })
  approved_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  executed_at: Date | null;

  /** ATrad's internal order reference after execution. */
  // MUST have type: 'varchar' — 'string | null' emits 'Object' via emitDecoratorMetadata
  @Column({ type: 'varchar', length: 100, nullable: true })
  atrad_order_id: string | null;

  /** Relative path to the screenshot taken at time of execution. */
  // MUST have type: 'varchar' — 'string | null' emits 'Object' via emitDecoratorMetadata
  @Column({ type: 'varchar', length: 500, nullable: true })
  execution_screenshot: string | null;

  @Column({ type: 'text', nullable: true })
  error_message: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
