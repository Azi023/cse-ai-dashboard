# VPS Deployment Guide — CSE AI Dashboard

> Last updated: 2026-04-06
> Target: Hetzner CPX22 · Ubuntu 24.04 · IP 195.201.33.87
> SSH alias: `hetzner-vps` (key configured in `~/.ssh/config`)

---

## Overview

This document is the authoritative reference for deploying and operating the CSE AI Dashboard on the Hetzner VPS. It covers provisioning, app deployment, Nginx reverse proxy, UFW firewall, PM2 process management, cron timezone alignment, database security, log rotation, backup, and the health check workflow.

**All deploy artefacts live in `deploy/`:**

| File | Purpose | When to run |
|------|---------|-------------|
| `deploy/01-vps-provision.sh` | One-time VPS setup (Node, PG, Redis, Nginx, PM2, UFW) | Once on fresh VPS |
| `deploy/02-app-deploy.sh` | Clone repo, build, start PM2 | Every deploy / update |
| `deploy/03-set-timezone.sh` | Set VPS clock to Asia/Colombo (SLT) | Once after provisioning |
| `deploy/ecosystem.production.js` | PM2 production process config | Managed by `02-app-deploy.sh` |
| `deploy/health-check.sh` | Full health check from local machine | After any deploy |

---

## Architecture

```
Internet
    │
    ▼ :80 (HTTP)
 Nginx
    ├── /api  ──► NestJS  :4101  (backend)
    └── /     ──► Next.js :4100  (frontend)

Internally (not exposed):
    PostgreSQL  :5432  (native, localhost only)
    Redis       :6379  (localhost only)
```

Ports 4100 and 4101 are **never opened** externally. UFW allows only 22/80/443.

---

## First-Time Provisioning

### 1. Run the provision script on the VPS

```bash
# From your local machine
scp deploy/01-vps-provision.sh hetzner-vps:/tmp/
ssh hetzner-vps "bash /tmp/01-vps-provision.sh"
```

When prompted, enter the `DATABASE_PASSWORD` that matches the one you will put in your `.env`. The script:

- Updates system packages
- Installs Node.js 20 LTS (via NodeSource)
- Installs PostgreSQL 16 (native, port 5432)
- Installs Redis 7 (bound to localhost only)
- Installs Nginx
- Installs PM2 globally
- Installs Playwright Chromium system dependencies (for ATrad automation)
- Configures UFW (22/80/443 open; 4100/4101/5432/6379 blocked externally)
- Creates PostgreSQL user `cse_user` and database `cse_dashboard`
- Grants schema privileges for TypeORM
- Creates `/opt/cse-ai-dashboard` and `/var/log/cse-dashboard`
- Configures PM2 startup on reboot

### 2. Set timezone to Sri Lanka Time

```bash
ssh hetzner-vps "bash -s" < deploy/03-set-timezone.sh
```

This sets the system clock to `Asia/Colombo` (UTC+5:30). **This is critical** — all 18 NestJS `@Cron` jobs use server time. Without this, market-hours polling, digests, and weekly briefs fire at wrong times.

Key cron jobs affected:
- 9:25 AM SLT → `preMarketWarmup`
- 9:30–2:30 PM SLT → 5-min market polling
- 2:35 PM SLT → `postCloseSnapshot`
- 2:45 PM SLT → `generateDailyDigest`
- 3:00 PM SLT (Fri) → `generateWeeklyBrief`

---

## Deploying the App

```bash
# Run from local machine — SSHs into VPS automatically
bash deploy/02-app-deploy.sh
```

The script:

1. Clones or pulls `https://github.com/Azi023/cse-ai-dashboard.git` to `/opt/cse-ai-dashboard`
2. **Pauses** and prompts you to manually SCP your `.env`
3. Copies `deploy/ecosystem.production.js` to the VPS
4. Runs `npm ci` + `npm run build` for the NestJS backend (`dist/main.js`)
5. Runs `npm ci` + `npm run build` for the Next.js frontend (`.next/`)
6. Runs `npx playwright install chromium` for ATrad browser automation
7. Stops any existing PM2 processes, starts fresh from `ecosystem.production.js`
8. Runs `pm2 save`
9. Performs a quick health check (PostgreSQL, Redis, Nginx, HTTP 200s)

---

## .env File Transfer

**The `.env` file is NEVER automated.** The deploy script pauses at this step.

```bash
# In a new terminal while deploy script is waiting:
scp .env hetzner-vps:/opt/cse-ai-dashboard/.env
```

### Critical: Change this value for VPS

The local setup runs PostgreSQL in Docker on port 5433. The VPS runs native PostgreSQL on the default port 5432.

```bash
# In your VPS .env — change:
DATABASE_PORT=5432    # was 5433 locally (Docker)
DATABASE_HOST=localhost
```

Everything else in `.env` should transfer as-is.

### Full .env reference

```bash
# Application
NODE_ENV=development    # Intentional — see TypeORM note below
PORT=4101

# PostgreSQL (VPS: port 5432, not 5433)
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=cse_user
DATABASE_PASSWORD=<matches what you entered during 01-vps-provision.sh>
DATABASE_NAME=cse_dashboard

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Claude AI
ANTHROPIC_API_KEY=<your-anthropic-key>

# ATrad broker credentials (READ-ONLY — no trades ever placed)
ATRAD_USERNAME=<your-atrad-login>
ATRAD_PASSWORD=<your-atrad-password>

# API authentication key (protects write endpoints)
# Generate: openssl rand -hex 32
API_SECRET_KEY=<generate-with-openssl-rand-hex-32>

# Frontend API base URL (used at build time by Next.js)
NEXT_PUBLIC_API_URL=http://195.201.33.87/api
```

---

## PM2 Production Configuration

The production ecosystem (`deploy/ecosystem.production.js`) differs from the local dev `ecosystem.config.js`:

| Setting | Local (dev) | VPS (prod) |
|---------|------------|------------|
| Backend script | `nest start --watch` | `node dist/main` |
| Frontend script | `next dev -p 4100` | `next start -p 4100` |
| Log path | `logs/` (repo) | `/var/log/cse-dashboard/` |
| Max memory | unlimited | 900M (backend), 600M (frontend) |
| App dir | `./src/backend` | `/opt/cse-ai-dashboard/src/backend` |

### NODE_ENV=development is intentional

TypeORM is configured in `app.module.ts` to run `synchronize: true` only when `NODE_ENV=development`. This means TypeORM auto-creates and updates all 29 entity tables on each backend startup.

For this personal single-user deployment, this is acceptable and prevents the complexity of maintaining a separate migration pipeline. If TypeORM migrations are added in the future, switch to `NODE_ENV=production` in `ecosystem.production.js`.

### Useful PM2 commands on VPS

```bash
pm2 list                        # Process status
pm2 logs                        # Stream all logs
pm2 logs cse-backend --lines 50 # Backend logs only
pm2 restart cse-backend         # Restart backend only
pm2 restart all                 # Restart all processes
pm2 monit                       # Live CPU/memory dashboard
pm2 save                        # Persist process list across reboots
```

---

## Nginx Reverse Proxy

Config at `/etc/nginx/sites-available/cse-dashboard` (deployed by `01-vps-provision.sh`).

Key routing decisions:
- `location /api` → `http://127.0.0.1:4101` (NestJS backend)
- `location /` → `http://127.0.0.1:4100` (Next.js frontend)
- `proxy_read_timeout 300s` on `/api` — Claude Sonnet inference can be slow
- `client_max_body_size 50M` — accommodates Excel financial imports
- Security headers set at Nginx level (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy)

### Adding HTTPS / SSL (future)

When a domain is pointed to this IP:

```bash
ssh hetzner-vps
apt install certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com

# Verify auto-renewal:
systemctl status certbot.timer
```

Update the Nginx config to redirect HTTP → HTTPS and add `Strict-Transport-Security` header.

---

## Firewall (UFW)

Rules applied by `01-vps-provision.sh`:

```
Default: deny incoming, allow outgoing
22/tcp   — SSH
80/tcp   — HTTP (Nginx)
443/tcp  — HTTPS (future SSL)

Not opened: 4100, 4101, 5432, 6379
```

Verify at any time:

```bash
ssh hetzner-vps "ufw status verbose"
```

---

## Database Security

PostgreSQL runs natively on `localhost:5432`. It is not accessible from outside the server.

```bash
# Confirm PG is not exposed:
ssh hetzner-vps "ss -tlnp | grep 5432"
# Should show: 127.0.0.1:5432, NOT 0.0.0.0:5432
```

The `cse_user` has privileges only on the `cse_dashboard` database — not superuser. Schema `public` is fully granted to support TypeORM's `synchronize` behaviour.

---

## Redis Security

Redis is bound to `127.0.0.1` only (`bind 127.0.0.1` in `/etc/redis/redis.conf`). It is not password-protected (acceptable for a localhost-only binding on a personal server). If you want to add a password:

```bash
# /etc/redis/redis.conf
requirepass <strong-password>

# Restart Redis
systemctl restart redis-server

# Then add to .env:
REDIS_PASSWORD=<same-password>
```

---

## Log Rotation

Logs go to `/var/log/cse-dashboard/`. Set up logrotate so they don't fill the disk:

```bash
ssh hetzner-vps "cat > /etc/logrotate.d/cse-dashboard" <<'EOF'
/var/log/cse-dashboard/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
EOF
```

---

## Database Backup

```bash
ssh hetzner-vps "crontab -e"

# Add these two lines:
# Daily backup at 3:00 AM SLT
0 3 * * * pg_dump -U cse_user -h localhost -p 5432 cse_dashboard | gzip > /root/backups/cse_$(date +\%Y\%m\%d).sql.gz
# Purge backups older than 30 days
0 4 * * * find /root/backups/ -name "*.sql.gz" -mtime +30 -delete
```

Create the backups directory:

```bash
ssh hetzner-vps "mkdir -p /root/backups"
```

Restore from backup:

```bash
ssh hetzner-vps
gunzip < /root/backups/cse_20260406.sql.gz | psql -U cse_user -h localhost cse_dashboard
```

---

## API Key Authentication

All write/sensitive endpoints require the `X-API-Key` header. Read-only endpoints are public.

```bash
# Protected — requires X-API-Key
curl -X POST http://195.201.33.87/api/atrad/sync \
  -H "X-API-Key: your-api-secret-key"

# Public — no key needed
curl http://195.201.33.87/api/stocks
curl http://195.201.33.87/api/portfolio
curl http://195.201.33.87/api/ai/signals
```

Protected endpoints include: `POST /api/atrad/*`, `POST /api/trade/*`, `POST /api/ai/chat`, `POST /api/notifications/test-*`, `POST /api/financials/backfill-*`, `POST /api/financials/import-csv`.

---

## Health Check

Run from your local machine at any time:

```bash
bash deploy/health-check.sh
```

The script checks:
- PM2 process status for `cse-backend` and `cse-frontend`
- PostgreSQL connectivity
- Redis PONG response
- Nginx active status
- HTTP 200 from backend `:4101/api/health`
- HTTP 200 from frontend `:4100`
- HTTP 200 through Nginx at `http://195.201.33.87/`
- HTTP 200 for `/api/health`, `/api/stocks`, `/api/portfolio`, `/api/ai/brief`, `/api/notifications`
- Firewall verification — confirms ports 4100/4101 are NOT externally reachable
- Disk usage and memory summary

Exit code 0 = all checks pass. Non-zero = number of failures.

---

## Routine Update Workflow

After pushing code changes to `master`:

```bash
bash deploy/02-app-deploy.sh
```

The script does a `git reset --hard origin/master`, rebuilds both apps, and restarts PM2. `.env` files are preserved (excluded from git reset via `--exclude`).

---

## Pre-Deployment Checklist

- [ ] `01-vps-provision.sh` has been run on a fresh VPS
- [ ] `03-set-timezone.sh` has been run (VPS clock shows `Asia/Colombo`)
- [ ] `.env` copied to `/opt/cse-ai-dashboard/.env` on VPS
- [ ] `DATABASE_PORT=5432` in VPS `.env` (not 5433)
- [ ] `API_SECRET_KEY` generated: `openssl rand -hex 32`
- [ ] `NEXT_PUBLIC_API_URL=http://195.201.33.87/api` in VPS `.env`
- [ ] `ANTHROPIC_API_KEY` present in VPS `.env`
- [ ] `ATRAD_USERNAME` / `ATRAD_PASSWORD` present in VPS `.env`
- [ ] TypeScript build succeeded locally: `npx tsc --noEmit` (both `src/backend` and `src/frontend`)
- [ ] PM2 startup hook active: `pm2 startup` + `pm2 save`
- [ ] UFW active and correct: `ufw status verbose`
- [ ] Nginx config valid: `nginx -t`
- [ ] Health check passes: `bash deploy/health-check.sh`
- [ ] Database backup cron configured
- [ ] Log rotation configured at `/etc/logrotate.d/cse-dashboard`
- [ ] `.env` is NOT in git: `git status | grep .env` (should be empty)

---

## Monitoring

```bash
# Live process dashboard
ssh hetzner-vps "pm2 monit"

# Stream all logs
ssh hetzner-vps "pm2 logs"

# Disk usage
ssh hetzner-vps "df -h /opt"

# Check if cron jobs are running (look for scheduled task logs)
ssh hetzner-vps "pm2 logs cse-backend --lines 100 | grep -i cron"
```

Add a free uptime monitor (e.g. UptimeRobot) pointing to:
`http://195.201.33.87/api/health` — 5-minute checks.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Backend won't start | TypeORM can't reach DB | Check `DATABASE_PORT=5432` in `.env` |
| Cron jobs fire at wrong time | Timezone not set | Run `03-set-timezone.sh`, then `pm2 restart all` |
| 502 Bad Gateway | PM2 process down | `ssh hetzner-vps "pm2 restart all"` |
| ATrad sync fails | Playwright missing Chromium | `ssh hetzner-vps "cd /opt/cse-ai-dashboard/src/backend && npx playwright install chromium"` |
| Frontend 500 | Build failed or missing env | Rebuild: `bash deploy/02-app-deploy.sh` |
| Disk full | Log files or PG data | Check `df -h`, rotate logs, purge old backups |
| Tables missing | NODE_ENV=production set | Set `NODE_ENV=development` in `ecosystem.production.js`, restart PM2 |
