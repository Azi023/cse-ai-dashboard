/**
 * CSE AI Dashboard — PM2 Production Ecosystem
 * Hetzner CPX22 · Ubuntu 24.04
 *
 * NODE_ENV=development is intentional.
 * TypeORM uses it to auto-sync the database schema on startup.
 * This is safe for a personal single-user deployment. If you add proper
 * TypeORM migrations in the future, switch to NODE_ENV=production here.
 */

const APP_DIR = '/opt/cse-ai-dashboard';
const LOG_DIR = '/var/log/cse-dashboard';

module.exports = {
  apps: [
    // ── NestJS Backend ──────────────────────────────────────────────────────
    {
      name: 'cse-backend',
      cwd: `${APP_DIR}/src/backend`,

      // Run the compiled dist — NOT nest start --watch
      script: 'node',
      args: 'dist/main',

      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 8000,
      min_uptime: '30s',

      env: {
        // development → TypeORM auto-syncs schema on startup (intentional)
        NODE_ENV: 'development',
        PORT: 4101,
      },

      // ── Log configuration ────────────────────────────────────────────────
      out_file: `${LOG_DIR}/backend-out.log`,
      error_file: `${LOG_DIR}/backend-err.log`,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: false,

      // ── Memory guard (CPX22 has 4GB RAM) ─────────────────────────────────
      max_memory_restart: '900M',

      // ── Timezone for cron jobs (all crons fire in SLT UTC+5:30) ─────────
      // Set system TZ via: timedatectl set-timezone Asia/Colombo
      // Ensure the VPS clock is correct before deploying.
    },

    // ── Next.js Frontend ────────────────────────────────────────────────────
    {
      name: 'cse-frontend',
      cwd: `${APP_DIR}/src/frontend`,

      // Run the built Next.js app (NOT next dev)
      script: 'node',
      args: 'node_modules/.bin/next start -p 4100',

      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      min_uptime: '20s',

      env: {
        NODE_ENV: 'production',
        PORT: 4100,
      },

      out_file: `${LOG_DIR}/frontend-out.log`,
      error_file: `${LOG_DIR}/frontend-err.log`,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: false,

      max_memory_restart: '600M',
    },
  ],
};
