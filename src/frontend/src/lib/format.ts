/**
 * Central safe number formatting utilities.
 * All API data should be formatted through these functions — never call
 * .toFixed() or .toLocaleString() directly on API values.
 */

/** Coerce any API value to a safe finite number (0 on null/undefined/NaN). */
export const safeNum = (v: unknown): number => {
  const n = Number(v ?? 0);
  return isNaN(n) ? 0 : n;
};

/** Format to 2 decimal places. */
export const fmt2 = (v: unknown): string => safeNum(v).toFixed(2);

/** Format to 1 decimal place. */
export const fmt1 = (v: unknown): string => safeNum(v).toFixed(1);

/** Format as integer with locale thousands separator. */
export const fmt0 = (v: unknown): string =>
  safeNum(v).toLocaleString('en-US', { maximumFractionDigits: 0 });

/** Format as LKR currency (no decimals). */
export const fmtLKR = (v: unknown): string => `LKR ${fmt0(v)}`;

/** Format as percentage with optional leading + sign. */
export const fmtPct = (v: unknown, sign = false): string =>
  `${sign && safeNum(v) > 0 ? '+' : ''}${fmt2(v)}%`;

/** Format large numbers as B/M/K abbreviations. */
export const fmtCompact = (v: unknown, prefix = ''): string => {
  const n = safeNum(v);
  if (n >= 1_000_000_000) return `${prefix}${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${prefix}${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${prefix}${(n / 1_000).toFixed(2)}K`;
  return `${prefix}${n.toLocaleString()}`;
};

/** Format a date string as relative time (e.g. "5m ago", "3h ago", "2d ago"). */
export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
