/**
 * state.ts — Persistent agent state for crash recovery.
 *
 * Tracks currently executing orders and active ATrad order references
 * so the agent can recover after an unexpected restart:
 *
 *  - If an order was EXECUTING but not reported, check the blotter
 *  - If ATrad order refs are known, resume monitoring them
 *  - If browser session timestamp is stale, force re-login
 *
 * State is stored as a JSON file in data/agent-state.json.
 * Written atomically (write to .tmp then rename) to prevent corruption.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

// ── Types ──────────────────────────────────────────────────────────────────

interface ExecutingOrder {
  tradeQueueId: number;
  symbol: string;
  action: string;
  atradOrderRef: string | null;
  startedAt: string;
}

interface AgentState {
  /** Orders currently being executed (form filled, possibly submitted) */
  executingOrders: ExecutingOrder[];
  /** ATrad order refs to monitor in the blotter */
  monitoredRefs: string[];
  /** ISO timestamp of last successful browser login */
  lastLoginAt: string | null;
  /** ISO timestamp of last state write */
  updatedAt: string;
}

// ── Paths ──────────────────────────────────────────────────────────────────

const DATA_DIR = path.resolve(__dirname, '../../../../data');
const STATE_FILE = path.join(DATA_DIR, 'agent-state.json');
const STATE_TMP = `${STATE_FILE}.tmp`;

// ── Default State ──────────────────────────────────────────────────────────

function defaultState(): AgentState {
  return {
    executingOrders: [],
    monitoredRefs: [],
    lastLoginAt: null,
    updatedAt: new Date().toISOString(),
  };
}

// ── Read / Write ───────────────────────────────────────────────────────────

/**
 * Load the persisted agent state. Returns default state if file doesn't exist
 * or is corrupted.
 */
export function loadState(): AgentState {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      logger.info('No agent state file found — starting fresh');
      return defaultState();
    }
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as AgentState;
    logger.info(
      `Loaded agent state: ${parsed.executingOrders.length} executing, ` +
        `${parsed.monitoredRefs.length} monitored, last login=${parsed.lastLoginAt}`,
    );
    return parsed;
  } catch (err) {
    logger.error('Failed to load agent state — starting fresh', err);
    return defaultState();
  }
}

/**
 * Persist the agent state atomically (write .tmp then rename).
 */
export function saveState(state: AgentState): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

    const updated: AgentState = {
      ...state,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(STATE_TMP, JSON.stringify(updated, null, 2));
    fs.renameSync(STATE_TMP, STATE_FILE);
  } catch (err) {
    logger.error('Failed to save agent state', err);
  }
}

// ── Executing Order Tracking ───────────────────────────────────────────────

/**
 * Record that an order is being executed (form filled, about to submit).
 */
export function markExecuting(
  state: AgentState,
  tradeQueueId: number,
  symbol: string,
  action: string,
): AgentState {
  const executingOrders = [
    ...state.executingOrders.filter((o) => o.tradeQueueId !== tradeQueueId),
    {
      tradeQueueId,
      symbol,
      action,
      atradOrderRef: null,
      startedAt: new Date().toISOString(),
    },
  ];
  return { ...state, executingOrders };
}

/**
 * Record the ATrad order ref after successful submission.
 */
export function markSubmitted(
  state: AgentState,
  tradeQueueId: number,
  atradOrderRef: string,
): AgentState {
  const executingOrders = state.executingOrders.map((o) =>
    o.tradeQueueId === tradeQueueId
      ? { ...o, atradOrderRef }
      : o,
  );
  const monitoredRefs = state.monitoredRefs.includes(atradOrderRef)
    ? state.monitoredRefs
    : [...state.monitoredRefs, atradOrderRef];
  return { ...state, executingOrders, monitoredRefs };
}

/**
 * Remove an order from the executing list (execution complete or failed).
 */
export function markComplete(
  state: AgentState,
  tradeQueueId: number,
): AgentState {
  const executingOrders = state.executingOrders.filter(
    (o) => o.tradeQueueId !== tradeQueueId,
  );
  return { ...state, executingOrders };
}

/**
 * Remove an ATrad order ref from monitoring (terminal state reached).
 */
export function unmonitor(
  state: AgentState,
  atradOrderRef: string,
): AgentState {
  const monitoredRefs = state.monitoredRefs.filter((r) => r !== atradOrderRef);
  return { ...state, monitoredRefs };
}

/**
 * Record a successful login timestamp.
 */
export function markLoggedIn(state: AgentState): AgentState {
  return { ...state, lastLoginAt: new Date().toISOString() };
}

// ── Recovery ───────────────────────────────────────────────────────────────

/**
 * Check if there are interrupted executions (orders that were EXECUTING
 * but never completed). Returns the list for the caller to reconcile.
 */
export function getInterruptedOrders(state: AgentState): ExecutingOrder[] {
  return state.executingOrders;
}

/**
 * Check if the browser session is likely expired.
 * ATrad sessions typically expire after ~30 minutes of inactivity.
 */
export function isSessionStale(state: AgentState): boolean {
  if (!state.lastLoginAt) return true;
  const elapsed = Date.now() - new Date(state.lastLoginAt).getTime();
  const thirtyMinutes = 30 * 60 * 1000;
  return elapsed > thirtyMinutes;
}
