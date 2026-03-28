# VPS Deployment Security Guide — CSE AI Dashboard

> Last updated: 2026-03-29
> Target: Ubuntu 22.04 LTS VPS with public IP

---

## Required Environment Variables

Create `/home/deploy/cse-ai-dashboard/.env` on the VPS. Never commit this file.

```bash
# Application
NODE_ENV=production
PORT=4101
FRONTEND_PORT=4100

# PostgreSQL
DATABASE_HOST=localhost
DATABASE_PORT=5433
DATABASE_USER=cse_user
DATABASE_PASSWORD=<strong-unique-password>
DATABASE_NAME=cse_dashboard

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=<strong-redis-password>

# Claude AI
ANTHROPIC_API_KEY=<your-anthropic-key>

# ATrad broker credentials (READ-ONLY scraping only)
ATRAD_USERNAME=<your-atrad-login>
ATRAD_PASSWORD=<your-atrad-password>

# CSE Platinum (fundamentals scraping)
CSE_USERNAME=<your-cse-platinum-login>
CSE_PASSWORD=<your-cse-platinum-password>

# API authentication — all sensitive endpoints require X-API-Key: <this value>
# Generate: openssl rand -hex 32
API_SECRET_KEY=<generate-with-openssl-rand-hex-32>
```

---

## Firewall Rules (UFW)

Only expose ports 80 (HTTP → HTTPS redirect) and 443 (HTTPS). Database and app ports must never be public.

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
# NEVER open 4100, 4101, 5432, 5433, 6379 to the internet
ufw enable
```

---

## Nginx Reverse Proxy

Install: `apt install nginx`

Config at `/etc/nginx/sites-available/cse-dashboard`:

```nginx
# HTTP — redirect everything to HTTPS
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;
}

# HTTPS — serve frontend, proxy API
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Frontend (Next.js)
    location / {
        proxy_pass http://127.0.0.1:4100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:4101;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Limit request body size (protect against large uploads beyond app-level limit)
        client_max_body_size 6M;
    }
}
```

Enable: `ln -s /etc/nginx/sites-available/cse-dashboard /etc/nginx/sites-enabled/`

---

## SSL/TLS (Let's Encrypt)

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com
# Auto-renewal is configured by certbot — verify with:
systemctl status certbot.timer
```

---

## Update CORS for Production

In `src/backend/src/main.ts`, update the CORS origin when deploying:

```typescript
app.enableCors({
  origin: ['https://yourdomain.com'],  // Replace localhost:4100
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
});
```

---

## Process Management (PM2)

```bash
npm install -g pm2

# Start services
cd /home/deploy/cse-ai-dashboard
pm2 start ecosystem.config.js

# Configure PM2 to start on boot
pm2 startup
pm2 save
```

`ecosystem.config.js` settings:
```javascript
module.exports = {
  apps: [
    {
      name: 'cse-backend',
      cwd: './src/backend',
      script: 'npm',
      args: 'run start:prod',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '512M',
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
    },
    {
      name: 'cse-frontend',
      cwd: './src/frontend',
      script: 'npm',
      args: 'start',
      env: { NODE_ENV: 'production', PORT: '4100' },
      max_memory_restart: '256M',
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
    },
  ],
};
```

---

## Database Security

```bash
# In docker-compose.yml or PostgreSQL config: bind to localhost only
# postgres should listen only on 127.0.0.1, NOT 0.0.0.0

# Confirm postgres is NOT exposed publicly:
ss -tlnp | grep 5433   # Should show 127.0.0.1:5433, not 0.0.0.0:5433
```

Set a strong password in the `DATABASE_PASSWORD` env var. Remove any default fallback in app.module.ts (already done in this commit).

---

## Redis Security

```bash
# In redis.conf:
requirepass <REDIS_PASSWORD>
bind 127.0.0.1

# Reload:
redis-cli -a <password> PING
```

Update `src/backend/src/modules/cse-data/redis.service.ts` to pass `REDIS_PASSWORD` from env.

---

## Log Rotation

```bash
# Install logrotate config at /etc/logrotate.d/cse-dashboard
cat > /etc/logrotate.d/cse-dashboard << 'EOF'
/home/deploy/cse-ai-dashboard/logs/*.log {
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
# Daily backup via cron
crontab -e
# Add:
0 3 * * * pg_dump -U cse_user -h localhost -p 5433 cse_dashboard | gzip > /home/deploy/backups/cse_$(date +\%Y\%m\%d).sql.gz

# Cleanup backups older than 30 days
0 4 * * * find /home/deploy/backups/ -name "*.sql.gz" -mtime +30 -delete
```

---

## API Authentication Usage

All sensitive endpoints now require the `X-API-Key` header:

```bash
# Example: trigger ATrad sync
curl -X POST https://yourdomain.com/api/atrad/sync \
  -H "X-API-Key: your-api-secret-key"

# Public endpoints (no key needed):
curl https://yourdomain.com/api/stocks
curl https://yourdomain.com/api/ai/signals
curl https://yourdomain.com/api/portfolio
```

**Protected endpoints:**
- `POST /api/trade/*` — trade queue + execution
- `POST /api/atrad/sync` — broker sync
- `POST /api/atrad/test` — broker credential test
- `POST /api/ai/chat` — Claude API chat (billable)
- `POST /api/ai/signals/generate-eod` — EOD signal generation
- `POST /api/financials/test-login` — CSE login test
- `POST /api/financials/probe-mycse` — CSE navigation probe
- `POST /api/financials/backfill-history` — bulk historical data pull
- `POST /api/financials/import-csv` — file upload
- `POST /api/notifications/test-digest` — triggers AI call
- `POST /api/notifications/test-brief` — triggers AI call

---

## Monitoring

Recommended uptime checks (free tier available):
- **UptimeRobot**: Monitor `https://yourdomain.com/api/app/health` every 5 minutes
- **PM2 monitoring**: `pm2 monit` for local dashboard
- **Disk space**: Add cron alert if disk > 80% (`df -h | awk '$5 > 80'`)

---

## Pre-Deployment Checklist

- [ ] `NODE_ENV=production` in `.env`
- [ ] `API_SECRET_KEY` set (generated with `openssl rand -hex 32`)
- [ ] `DATABASE_PASSWORD` is strong and unique (not the dev default)
- [ ] `REDIS_PASSWORD` set in both `.env` and `redis.conf`
- [ ] UFW firewall rules active (only 22/80/443 open)
- [ ] Nginx config tested (`nginx -t`) and reloaded
- [ ] SSL certificate installed and auto-renewal verified
- [ ] PM2 startup hook configured (`pm2 startup && pm2 save`)
- [ ] Database backup cron running
- [ ] `scripts/*.html` and `scripts/*.png` NOT in git
- [ ] `.env` NOT in git
- [ ] TypeScript build succeeds (`npx tsc --noEmit`)
- [ ] Backend health check returns 200: `curl https://yourdomain.com/api/app/health`
