#!/usr/bin/env bash
# =============================================================================
# CSE AI Dashboard — App Deployment Script
# Run from YOUR LOCAL machine. Deploys the app to the Hetzner VPS via SSH.
#
# Prerequisites:
#   - 01-vps-provision.sh has been run on the VPS
#   - SSH alias 'hetzner-vps' is configured in ~/.ssh/config
#   - GitHub repo is accessible from VPS (public repo)
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
die()     { echo -e "${RED}[FAIL]${NC} $*" >&2; exit 1; }

VPS_ALIAS="hetzner-vps"
GITHUB_REPO="https://github.com/Azi023/cse-ai-dashboard.git"
APP_DIR="/opt/cse-ai-dashboard"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# =============================================================================
# Verify SSH access
# =============================================================================
echo ""
echo -e "${YELLOW}┌─────────────────────────────────────────────────────────────┐${NC}"
echo -e "${YELLOW}│  CSE AI Dashboard — App Deployment                          │${NC}"
echo -e "${YELLOW}│  Deploying to: ${VPS_ALIAS}                                    │${NC}"
echo -e "${YELLOW}└─────────────────────────────────────────────────────────────┘${NC}"
echo ""

info "Testing SSH connection to ${VPS_ALIAS}..."
ssh -q -o BatchMode=yes -o ConnectTimeout=10 "${VPS_ALIAS}" exit \
    || die "Cannot connect to ${VPS_ALIAS}. Check ~/.ssh/config and key."
success "SSH connection OK."

# =============================================================================
# Step 1: Clone or update repo on VPS
# =============================================================================
info "Cloning / updating repository on VPS..."
ssh "${VPS_ALIAS}" bash -s <<REMOTE_EOF
set -euo pipefail

if [ -d "${APP_DIR}/.git" ]; then
    echo "Repo exists — pulling latest..."
    cd "${APP_DIR}"
    git fetch origin
    git reset --hard origin/master
    git clean -fd --exclude='.env' --exclude='src/backend/.env'
else
    echo "Fresh clone..."
    git clone "${GITHUB_REPO}" "${APP_DIR}"
fi

echo "Repo at: \$(git -C ${APP_DIR} log --oneline -1)"
REMOTE_EOF
success "Repository updated."

# =============================================================================
# Step 2: Ensure .env is on the VPS (never automated — manual SCP required)
# =============================================================================
if ssh "${VPS_ALIAS}" "[[ -f '${APP_DIR}/.env' ]]" 2>/dev/null; then
    success ".env already present on VPS — skipping manual transfer step."
else
    echo ""
    echo -e "${YELLOW}══════════════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}  MANUAL STEP REQUIRED — .env file not found on VPS           ${NC}"
    echo -e "${YELLOW}══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "  Copy your .env file to the VPS in a new terminal:"
    echo ""
    echo -e "  ${CYAN}scp ${PROJECT_ROOT}/.env ${VPS_ALIAS}:${APP_DIR}/.env${NC}"
    echo ""
    echo -e "${YELLOW}  IMPORTANT: Change DATABASE_PORT=5432 in the VPS .env         ${NC}"
    echo -e "${YELLOW}             (VPS runs native PostgreSQL on 5432, not 5433)     ${NC}"
    echo ""
    read -p "  Press ENTER once the .env file is on the VPS... "
    echo ""

    ssh "${VPS_ALIAS}" "[[ -f '${APP_DIR}/.env' ]]" \
        || die ".env not found at ${APP_DIR}/.env on VPS. Please copy it and retry."
    success ".env detected on VPS."
fi

# =============================================================================
# Step 3: Copy production PM2 ecosystem file
# PM2 only auto-detects config files with the .config.js suffix,
# so deploy it as ecosystem.config.js on the VPS regardless of local name.
# =============================================================================
info "Copying production PM2 ecosystem file..."
scp "${SCRIPT_DIR}/ecosystem.production.js" "${VPS_ALIAS}:${APP_DIR}/ecosystem.config.js"
success "ecosystem.config.js deployed to VPS."

# =============================================================================
# Step 4: Install backend dependencies + build
# =============================================================================
info "Installing backend dependencies..."
ssh "${VPS_ALIAS}" bash -s <<REMOTE_EOF
set -euo pipefail
cd "${APP_DIR}/src/backend"
npm ci --silent
echo "Backend deps installed."
REMOTE_EOF
success "Backend dependencies installed."

info "Building backend (NestJS)..."
ssh "${VPS_ALIAS}" bash -s <<REMOTE_EOF
set -euo pipefail
cd "${APP_DIR}/src/backend"
npm run build
echo "Backend build complete."
REMOTE_EOF
success "Backend built."

# =============================================================================
# Step 5: Install frontend dependencies + build
# =============================================================================
info "Installing frontend dependencies..."
ssh "${VPS_ALIAS}" bash -s <<REMOTE_EOF
set -euo pipefail
cd "${APP_DIR}/src/frontend"
npm ci --silent
echo "Frontend deps installed."
REMOTE_EOF
success "Frontend dependencies installed."

info "Building frontend (Next.js)... (this may take 2-3 minutes)"
ssh "${VPS_ALIAS}" bash -s <<REMOTE_EOF
set -euo pipefail
cd "${APP_DIR}/src/frontend"

# Extract ONLY NEXT_PUBLIC_* vars from .env for build-time injection.
# NEVER source the whole .env — it contains NODE_ENV=development which
# breaks the Next.js build (next build requires NODE_ENV=production).
while IFS='=' read -r key val; do
    [[ "\$key" =~ ^NEXT_PUBLIC_ ]] || continue
    val="\${val%\"}"  ; val="\${val#\"}"   # strip double quotes
    val="\${val%\'}"  ; val="\${val#\'}"   # strip single quotes
    export "\$key"="\$val"
done < <(grep -E '^NEXT_PUBLIC_' "${APP_DIR}/.env" 2>/dev/null || true)

NODE_ENV=production npm run build
echo "Frontend build complete."
REMOTE_EOF
success "Frontend built."

# =============================================================================
# Step 6: Install Playwright Chromium (for ATrad automation)
# =============================================================================
info "Installing Playwright Chromium browser..."
ssh "${VPS_ALIAS}" bash -s <<REMOTE_EOF
set -euo pipefail
cd "${APP_DIR}/src/backend"
# Install Chromium to the Playwright cache
npx playwright install chromium
echo "Playwright Chromium installed."
REMOTE_EOF
success "Playwright Chromium installed."

# =============================================================================
# Step 7: Start/restart services via PM2
# =============================================================================
info "Starting services via PM2..."
ssh "${VPS_ALIAS}" bash -s <<REMOTE_EOF
set -euo pipefail
cd "${APP_DIR}"

# Stop existing apps cleanly if running
pm2 stop ecosystem.config.js 2>/dev/null || true
pm2 delete ecosystem.config.js 2>/dev/null || true
# Also clean up the wrongly-named process from any previous run
pm2 stop ecosystem.production 2>/dev/null || true
pm2 delete ecosystem.production 2>/dev/null || true

# Start fresh from the .config.js file (PM2 requires this suffix for config detection)
pm2 start ecosystem.config.js

# Save PM2 process list for auto-recovery on reboot
pm2 save

echo "PM2 processes:"
pm2 list
REMOTE_EOF
success "PM2 started."

# =============================================================================
# Step 8: Verify services are up
# =============================================================================
info "Waiting 15 seconds for services to start..."
sleep 15

info "Running health checks..."
ssh "${VPS_ALIAS}" bash -s <<REMOTE_EOF
set -euo pipefail

echo "── PM2 status ──"
pm2 list

echo ""
echo "── Backend health ──"
curl -sf http://localhost:4101/api/health && echo " OK" || echo " FAILED"

echo ""
echo "── Frontend health ──"
curl -sf http://localhost:4100 -o /dev/null && echo " OK" || echo " FAILED"

echo ""
echo "── Nginx health ──"
curl -sf http://localhost/nginx-health && echo ""

echo ""
echo "── PostgreSQL ──"
pg_isready -U cse_user -d cse_dashboard && echo " OK" || echo " FAILED"

echo ""
echo "── Redis ──"
redis-cli ping | grep -q PONG && echo " PONG (OK)" || echo " FAILED"
REMOTE_EOF

# =============================================================================
# Done
# =============================================================================
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Deployment COMPLETE                                            ${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Dashboard: http://195.201.33.87"
echo "  API:       http://195.201.33.87/api"
echo ""
echo "  To run a full health check any time:"
echo "    bash deploy/health-check.sh"
echo ""
echo "  To view live logs:"
echo "    ssh hetzner-vps 'pm2 logs'"
echo ""
echo "  To update the app after a git push:"
echo "    bash deploy/02-app-deploy.sh"
echo ""
