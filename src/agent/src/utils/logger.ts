import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';

const LOG_DIR = config.logDir;

function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function formatTimestamp(): string {
  return new Date().toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getLogFile(): string {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(LOG_DIR, `agent-${date}.log`);
}

function writeToFile(level: string, message: string): void {
  ensureLogDir();
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${message}\n`;
  fs.appendFileSync(getLogFile(), line, 'utf-8');
}

export const logger = {
  info(msg: string): void {
    const formatted = `[${formatTimestamp()}] INFO  ${msg}`;
    console.log(formatted);
    writeToFile('INFO', msg);
  },

  warn(msg: string): void {
    const formatted = `[${formatTimestamp()}] WARN  ${msg}`;
    console.warn(formatted);
    writeToFile('WARN', msg);
  },

  error(msg: string, err?: unknown): void {
    const errMsg =
      err instanceof Error ? ` — ${err.message}` : err ? ` — ${String(err)}` : '';
    const formatted = `[${formatTimestamp()}] ERROR ${msg}${errMsg}`;
    console.error(formatted);
    writeToFile('ERROR', `${msg}${errMsg}`);
  },

  debug(msg: string): void {
    const formatted = `[${formatTimestamp()}] DEBUG ${msg}`;
    console.log(formatted);
    writeToFile('DEBUG', msg);
  },
};
