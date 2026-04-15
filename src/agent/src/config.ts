import * as path from 'path';
import * as fs from 'fs';

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

function loadEnv(): void {
  // Load agent .env first (takes priority), then root .env for missing keys
  const agentEnv = path.resolve(__dirname, '..', '.env');
  const rootEnv = path.resolve(__dirname, '..', '..', '..', '.env');
  loadEnvFile(agentEnv);
  loadEnvFile(rootEnv);
}

loadEnv();

export const config = {
  vpsUrl: process.env.VPS_URL || 'https://csedash.xyz',
  agentSecret: process.env.AGENT_SECRET || '',
  atradUsername: process.env.ATRAD_USERNAME || '',
  atradPassword: process.env.ATRAD_PASSWORD || '',
  atradUrl:
    process.env.ATRAD_URL ||
    process.env.ATRAD_LOGIN_URL ||
    'https://trade.hnbstockbrokers.lk/atsweb/login',

  // Polling intervals (ms)
  heartbeatInterval: 60_000, // 1 minute
  pollInterval: 30_000, // 30 seconds during market hours
  idleHeartbeatInterval: 5 * 60_000, // 5 minutes outside market hours

  // Market hours (SLT)
  marketOpenHour: 9.5, // 9:30 AM
  marketCloseHour: 14.5, // 2:30 PM

  // Paths
  screenshotDir: path.resolve(__dirname, '..', 'screenshots'),
  logDir: path.resolve(__dirname, '..', 'logs'),
} as const;

export function validateConfig(): void {
  const missing: string[] = [];
  if (!config.agentSecret) missing.push('AGENT_SECRET');
  if (!config.atradUsername) missing.push('ATRAD_USERNAME');
  if (!config.atradPassword) missing.push('ATRAD_PASSWORD');

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }
}
