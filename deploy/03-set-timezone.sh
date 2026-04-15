#!/usr/bin/env bash
# =============================================================================
# CSE AI Dashboard — VPS Timezone Setup
# Run ONCE after provisioning. Sets VPS clock to Asia/Colombo (SLT, UTC+5:30)
# so that all 18 NestJS cron jobs fire at the correct Sri Lanka times.
#
# Usage: ssh hetzner-vps "bash -s" < deploy/03-set-timezone.sh
# =============================================================================
set -euo pipefail

GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}  $*"; }

info "Setting timezone to Asia/Colombo (UTC+5:30)..."
timedatectl set-timezone Asia/Colombo

info "Enabling NTP time sync..."
timedatectl set-ntp true

echo ""
timedatectl status

success "Timezone set. Current SLT time: $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo ""
echo "All NestJS @Cron jobs will now fire at the correct Sri Lanka times:"
echo "  9:25 AM SLT → preMarketWarmup"
echo "  9:30–2:30 PM SLT → market polling"
echo "  2:45 PM SLT → daily digest"
echo "  3:00 PM SLT (Fri) → weekly brief"
echo ""
echo "Restart PM2 after timezone change:"
echo "  pm2 restart all"
echo ""
