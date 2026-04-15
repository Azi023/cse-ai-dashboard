#!/usr/bin/env bash
# =============================================================================
# CSE AI Dashboard — VPS Provisioning Script
# Run this ONCE on a fresh Hetzner CPX22 (Ubuntu 24.04) as root.
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
die()     { echo -e "${RED}[FAIL]${NC} $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run as root: sudo bash 01-vps-provision.sh"

# Prevent apt/dpkg from asking interactive questions over SSH
export DEBIAN_FRONTEND=noninteractive

APP_DIR="/opt/cse-ai-dashboard"
LOG_DIR="/var/log/cse-dashboard"
NODE_MAJOR=20
DB_NAME="cse_dashboard"
DB_USER="cse_user"
ENV_FILE="${APP_DIR}/.env"

# =============================================================================
# 1. Read DATABASE_PASSWORD from the .env already on the VPS
#    Never echoed, never logged — used only in psql commands below.
# =============================================================================
echo ""
echo -e "${YELLOW}┌─────────────────────────────────────────────────────────────┐${NC}"
echo -e "${YELLOW}│  CSE AI Dashboard — VPS Provisioning                        │${NC}"
echo -e "${YELLOW}│  Hetzner CPX22 · Ubuntu 24.04                               │${NC}"
echo -e "${YELLOW}└─────────────────────────────────────────────────────────────┘${NC}"
echo ""

[[ -f "$ENV_FILE" ]] || die ".env not found at $ENV_FILE — copy it to the VPS first."

# Extract value: handles bare, single-quoted, and double-quoted forms.
# Example lines all work: DATABASE_PASSWORD=pass  |  DATABASE_PASSWORD="pass"  |  DATABASE_PASSWORD='pass'
DB_PASS=$(grep -E '^DATABASE_PASSWORD=' "$ENV_FILE" \
    | cut -d= -f2- \
    | tr -d '"' \
    | tr -d "'" \
    | xargs)

[[ -n "$DB_PASS" ]] || die "DATABASE_PASSWORD not set or empty in $ENV_FILE"
info "DATABASE_PASSWORD read from .env (not logged)."

# =============================================================================
# 2. System update
# =============================================================================
info "Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq \
    -o Dpkg::Options::="--force-confdef" \
    -o Dpkg::Options::="--force-confold"
apt-get install -y -qq curl wget gnupg2 lsb-release ca-certificates \
    software-properties-common git build-essential ufw nginx
success "System packages updated."

# =============================================================================
# 3. Node.js 20 LTS via NodeSource
# =============================================================================
if ! command -v node &>/dev/null || [[ "$(node -e 'process.stdout.write(process.version.split(\".\")[0].slice(1))')" -lt "$NODE_MAJOR" ]]; then
    info "Installing Node.js ${NODE_MAJOR} LTS..."
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
    apt-get install -y -qq nodejs
    success "Node.js $(node --version) installed."
else
    success "Node.js $(node --version) already installed."
fi

# =============================================================================
# 4. PostgreSQL 16
# =============================================================================
if ! command -v psql &>/dev/null; then
    info "Installing PostgreSQL 16..."
    apt-get install -y -qq postgresql postgresql-contrib
    systemctl enable postgresql
    systemctl start postgresql
    success "PostgreSQL installed."
else
    success "PostgreSQL already installed."
fi

info "Creating database user and database..."
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 \
    || sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 \
    || sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"
# Allow schema privileges (needed for TypeORM table creation)
sudo -u postgres psql -d "${DB_NAME}" -c "GRANT ALL ON SCHEMA public TO ${DB_USER};"
success "Database '${DB_NAME}' and user '${DB_USER}' ready."

# =============================================================================
# 5. Redis 7
# =============================================================================
if ! command -v redis-server &>/dev/null; then
    info "Installing Redis..."
    apt-get install -y -qq redis-server
    # Bind Redis to localhost only (security hardening)
    sed -i 's/^bind .*/bind 127.0.0.1/' /etc/redis/redis.conf
    systemctl enable redis-server
    systemctl restart redis-server
    success "Redis installed and bound to localhost."
else
    success "Redis already installed."
fi

# =============================================================================
# 6. PM2 (global)
# =============================================================================
if ! command -v pm2 &>/dev/null; then
    info "Installing PM2..."
    npm install -g pm2 --silent
    success "PM2 $(pm2 --version) installed."
else
    success "PM2 already installed."
fi

# =============================================================================
# 7. Playwright Chromium system dependencies
#    (ATrad browser automation requires a headless Chromium environment)
# =============================================================================
info "Installing Playwright Chromium system dependencies..."
npx --yes playwright install-deps chromium 2>/dev/null || \
    apt-get install -y -qq \
        libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
        libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
        libxrandr2 libgbm1 libasound2t64 libpango-1.0-0 libcairo2
success "Playwright dependencies installed."

# =============================================================================
# 8. UFW Firewall
# =============================================================================
info "Configuring UFW firewall..."
ufw --force reset >/dev/null
ufw default deny incoming  >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp comment 'SSH'     >/dev/null
ufw allow 80/tcp comment 'HTTP'    >/dev/null
ufw allow 443/tcp comment 'HTTPS'  >/dev/null
# Ports 4100/4101 are NOT opened externally — Nginx proxies them internally
ufw --force enable >/dev/null
success "Firewall configured (22, 80, 443 only). Ports 4100/4101 are internal only."

# =============================================================================
# 9. Nginx configuration
# =============================================================================
info "Configuring Nginx..."
cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.bak 2>/dev/null || true
cat > /etc/nginx/sites-available/cse-dashboard <<'NGINX_EOF'
# ── CSE AI Dashboard · Nginx Reverse Proxy ───────────────────────────────────
# Frontend (Next.js)  → localhost:4100
# Backend  (NestJS)   → localhost:4101

upstream cse_frontend { server 127.0.0.1:4100; }
upstream cse_backend  { server 127.0.0.1:4101; }

server {
    listen 80 default_server;
    server_name _;

    # ── Security headers ──────────────────────────────────────────────────
    add_header X-Content-Type-Options  "nosniff"         always;
    add_header X-Frame-Options         "SAMEORIGIN"      always;
    add_header X-XSS-Protection        "1; mode=block"   always;
    add_header Referrer-Policy         "strict-origin"   always;

    # ── Upload limit (for Excel imports) ─────────────────────────────────
    client_max_body_size 50M;

    # ── API backend (/api/*) ──────────────────────────────────────────────
    location /api {
        proxy_pass         http://cse_backend;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        'upgrade';
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Long timeout for AI inference requests (Sonnet can be slow)
        proxy_read_timeout    300s;
        proxy_connect_timeout  10s;
        proxy_send_timeout    300s;
    }

    # ── Frontend (Next.js) ────────────────────────────────────────────────
    location / {
        proxy_pass         http://cse_frontend;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        'upgrade';
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 120s;
    }

    # ── Health check endpoint (no auth) ──────────────────────────────────
    location /nginx-health {
        access_log off;
        return 200 "OK\n";
        add_header Content-Type text/plain;
    }
}
NGINX_EOF

# Enable site, disable default
ln -sf /etc/nginx/sites-available/cse-dashboard /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

nginx -t >/dev/null 2>&1 && systemctl reload nginx
systemctl enable nginx
success "Nginx configured and reloaded."

# =============================================================================
# 10. App and log directories
# =============================================================================
info "Creating app and log directories..."
mkdir -p "${APP_DIR}" "${LOG_DIR}"
chmod 755 "${APP_DIR}" "${LOG_DIR}"
success "Directories: ${APP_DIR}, ${LOG_DIR}"

# =============================================================================
# 11. PM2 startup (auto-start on reboot)
# =============================================================================
info "Configuring PM2 startup..."
pm2 startup systemd -u root --hp /root 2>/dev/null | tail -1 | bash >/dev/null 2>&1 || true
success "PM2 startup configured."

# =============================================================================
# Done
# =============================================================================
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  VPS Provisioning COMPLETE                                      ${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Next steps:"
echo "  1. Run 02-app-deploy.sh from your LOCAL machine:"
echo "     bash deploy/02-app-deploy.sh"
echo ""
echo "  2. When prompted, SCP your .env files:"
echo "     scp .env hetzner-vps:/opt/cse-ai-dashboard/"
echo "     scp src/backend/.env hetzner-vps:/opt/cse-ai-dashboard/src/backend/ (if separate)"
echo ""
echo -e "${YELLOW}  IMPORTANT: Update DATABASE_PORT=5432 in your .env (VPS uses native PG)${NC}"
echo ""
