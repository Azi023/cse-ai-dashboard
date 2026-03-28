/**
 * safety-rails.ts — Hardcoded trade execution safety limits.
 *
 * CRITICAL: These constants CANNOT be overridden via API, UI, or config files.
 * They are compile-time constants. To change them you must edit this file and
 * redeploy. This is intentional — safety limits must be reviewed by a human
 * developer, not tweaked at runtime.
 *
 * Set ENABLED = true only after:
 *   1. At least 30 manual approval cycles completed successfully
 *   2. ATrad order execution selectors confirmed in atrad-order-executor.ts
 *   3. Full end-to-end test in non-live mode passed
 */

export const SAFETY_RAILS = {
  // ── HARD LIMITS (cannot be changed via API or UI) ──────────────────────────

  /** Max LKR per single order — ~1.5× monthly RCA budget (LKR 10K/month). */
  MAX_SINGLE_ORDER_LKR: 15_000,

  /** Max total BUY spend in a single calendar day. */
  MAX_DAILY_BUY_LKR: 20_000,

  /** No single stock > 50% of total portfolio value (concentration risk). */
  MAX_PORTFOLIO_ALLOCATION_PCT: 50,

  /** Always keep at least LKR 1,000 in buying power (emergency buffer). */
  MIN_CASH_RESERVE_LKR: 1_000,

  /** Max 3 buy orders placed per day (prevents runaway execution). */
  MAX_DAILY_ORDERS: 3,

  /**
   * If total portfolio P&L (vs cost basis) drops below -5%,
   * halt all new buy orders for the day.
   */
  DAILY_LOSS_LIMIT_PCT: 5,

  // ── SHARIAH (NON-NEGOTIABLE) ────────────────────────────────────────────────

  /** NEVER buy non-compliant stocks. This check blocks execution entirely. */
  SHARIAH_ONLY: true,

  /** Re-verify Shariah status from DB before every order, even if cached. */
  VERIFY_BEFORE_ORDER: true,

  // ── EXECUTION MODE ──────────────────────────────────────────────────────────

  /**
   * DEFAULT: true — every order MUST be manually approved before execution.
   * Phase C (auto-approve) requires weeks of manual testing first.
   * DO NOT set this to false without extensive testing.
   */
  REQUIRE_HUMAN_APPROVAL: true,

  /** NEVER use market orders on CSE — always use limit orders. */
  ORDER_TYPE: 'LIMIT' as const,

  /**
   * Place limit price 0.5% below the signal's entry price.
   * This makes us slightly patient buyers — we get a modest discount
   * or the trade doesn't happen (which is fine; we wait for next signal).
   */
  LIMIT_OFFSET_PCT: 0.5,

  // ── KILL SWITCH ─────────────────────────────────────────────────────────────

  /**
   * Master kill switch. START disabled — must manually set to true.
   *
   * When false:
   *   - No trade queue entries are created from strategy signals
   *   - Manually posted orders via API are rejected
   *   - The /api/trade/queue endpoint still reads existing entries
   *
   * When true:
   *   - Strategy HIGH confidence BUY signals create PENDING_APPROVAL entries
   *   - Manual orders via API are accepted (subject to other safety checks)
   *   - REQUIRE_HUMAN_APPROVAL remains true (auto-execution never happens)
   */
  ENABLED: false,
} as const;

// ── Derived types ─────────────────────────────────────────────────────────────

export interface SafetyCheckDetail {
  name: string;
  passed: boolean;
  reason: string;
  value?: number;
  limit?: number;
}

export interface SafetyCheckResult {
  passed: boolean;
  checks: SafetyCheckDetail[];
  /** Which check was the first to fail, if any. */
  rejectedBy?: string;
  checkedAt: string; // ISO timestamp
}
