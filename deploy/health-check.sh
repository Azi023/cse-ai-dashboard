#!/usr/bin/env bash
# =============================================================================
# CSE AI Dashboard — Health Check Script
# Run from your LOCAL machine to verify the VPS deployment.
# Usage: bash deploy/health-check.sh
# =============================================================================
set -uo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

VPS_ALIAS="hetzner-vps"
VPS_IP="195.201.33.87"

pass() { echo -e "${GREEN}  ✓${NC}  $*"; }
fail() { echo -e "${RED}  ✗${NC}  $*"; FAILURES=$((FAILURES + 1)); }
info() { echo -e "${CYAN}  ·${NC}  $*"; }

FAILURES=0

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  CSE AI Dashboard — Health Check · $(date '+%Y-%m-%d %H:%M:%S %Z')${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# =============================================================================
# Remote checks (via SSH)
# =============================================================================
echo -e "${YELLOW}── Process Health ─────────────────────────────────────────────${NC}"

SSH_RESULT=$(ssh -q "${VPS_ALIAS}" bash -s <<'REMOTE_CHECK'
set -uo pipefail

results=""

# PM2 processes
BACKEND_STATUS=$(pm2 jlist 2>/dev/null | python3 -c "
import sys, json
procs = json.load(sys.stdin)
p = next((x for x in procs if x.get('name') == 'cse-backend'), None)
print(p['pm2_env']['status'] if p else 'missing')
" 2>/dev/null || echo "error")

FRONTEND_STATUS=$(pm2 jlist 2>/dev/null | python3 -c "
import sys, json
procs = json.load(sys.stdin)
p = next((x for x in procs if x.get('name') == 'cse-frontend'), None)
print(p['pm2_env']['status'] if p else 'missing')
" 2>/dev/null || echo "error")

echo "PM2_BACKEND=${BACKEND_STATUS}"
echo "PM2_FRONTEND=${FRONTEND_STATUS}"

# PostgreSQL
PG_STATUS=$(pg_isready -U cse_user -d cse_dashboard -q 2>/dev/null && echo "ok" || echo "fail")
echo "POSTGRES=${PG_STATUS}"

# Redis
REDIS_STATUS=$(redis-cli ping 2>/dev/null | grep -q PONG && echo "ok" || echo "fail")
echo "REDIS=${REDIS_STATUS}"

# Nginx
NGINX_STATUS=$(systemctl is-active nginx 2>/dev/null)
echo "NGINX=${NGINX_STATUS}"

# Backend app HTTP
BACKEND_HTTP=$(curl -sf --max-time 5 http://localhost:4101/api/health -o /dev/null && echo "ok" || echo "fail")
echo "BACKEND_HTTP=${BACKEND_HTTP}"

# Frontend app HTTP
FRONTEND_HTTP=$(curl -sf --max-time 5 http://localhost:4100 -o /dev/null && echo "ok" || echo "fail")
echo "FRONTEND_HTTP=${FRONTEND_HTTP}"

# Disk usage
DISK=$(df -h /opt 2>/dev/null | awk 'NR==2{print $5}')
echo "DISK_USAGE=${DISK}"

# Memory
MEM=$(free -m | awk 'NR==2{printf "%.0f%%", $3/$2*100}')
echo "MEMORY=${MEM}"

# System uptime
UPTIME=$(uptime -p 2>/dev/null | sed 's/up //')
echo "UPTIME=${UPTIME}"
REMOTE_CHECK
)

# Parse results
get_val() { echo "$SSH_RESULT" | grep "^$1=" | cut -d= -f2; }

PM2_BACKEND=$(get_val PM2_BACKEND)
PM2_FRONTEND=$(get_val PM2_FRONTEND)
POSTGRES=$(get_val POSTGRES)
REDIS=$(get_val REDIS)
NGINX=$(get_val NGINX)
BACKEND_HTTP=$(get_val BACKEND_HTTP)
FRONTEND_HTTP=$(get_val FRONTEND_HTTP)
DISK_USAGE=$(get_val DISK_USAGE)
MEMORY=$(get_val MEMORY)
UPTIME=$(get_val UPTIME)

# Display results
[[ "$PM2_BACKEND" == "online" ]]  && pass "PM2 cse-backend: online"   || fail "PM2 cse-backend: ${PM2_BACKEND}"
[[ "$PM2_FRONTEND" == "online" ]] && pass "PM2 cse-frontend: online"  || fail "PM2 cse-frontend: ${PM2_FRONTEND}"
[[ "$POSTGRES" == "ok" ]]         && pass "PostgreSQL: accepting connections" || fail "PostgreSQL: ${POSTGRES}"
[[ "$REDIS" == "ok" ]]            && pass "Redis: PONG"               || fail "Redis: ${REDIS}"
[[ "$NGINX" == "active" ]]        && pass "Nginx: active"             || fail "Nginx: ${NGINX}"

echo ""
echo -e "${YELLOW}── Application Endpoints ──────────────────────────────────────${NC}"

[[ "$BACKEND_HTTP" == "ok" ]]  && pass "Backend  http://localhost:4101/api/health" || fail "Backend unreachable at :4101"
[[ "$FRONTEND_HTTP" == "ok" ]] && pass "Frontend http://localhost:4100"             || fail "Frontend unreachable at :4100"

echo ""
echo -e "${YELLOW}── Public Endpoints (via Nginx) ───────────────────────────────${NC}"

# Check public endpoints from local machine
HTTP_FRONT=$(curl -sf --max-time 8 "http://${VPS_IP}/" -o /dev/null -w "%{http_code}" 2>/dev/null || echo "000")
HTTP_API=$(curl -sf --max-time 8 "http://${VPS_IP}/api/health" -o /dev/null -w "%{http_code}" 2>/dev/null || echo "000")
HTTP_NGINX=$(curl -sf --max-time 5 "http://${VPS_IP}/nginx-health" 2>/dev/null | tr -d '\n' || echo "fail")

[[ "$HTTP_FRONT" =~ ^(200|304|301|302)$ ]] && pass "http://${VPS_IP}/  → HTTP ${HTTP_FRONT}" || fail "http://${VPS_IP}/  → HTTP ${HTTP_FRONT} (expected 2xx/3xx)"
[[ "$HTTP_API" =~ ^(200|201)$ ]]           && pass "http://${VPS_IP}/api/health → HTTP ${HTTP_API}" || fail "http://${VPS_IP}/api/health → HTTP ${HTTP_API}"
[[ "$HTTP_NGINX" == "OK" ]]                && pass "Nginx health: OK" || fail "Nginx health: ${HTTP_NGINX}"

echo ""
echo -e "${YELLOW}── Firewall Verification ──────────────────────────────────────${NC}"

# Check that 4100/4101 are NOT accessible externally
PORT_4100=$(timeout 3 bash -c "echo > /dev/tcp/${VPS_IP}/4100" 2>/dev/null && echo "OPEN" || echo "blocked")
PORT_4101=$(timeout 3 bash -c "echo > /dev/tcp/${VPS_IP}/4101" 2>/dev/null && echo "OPEN" || echo "blocked")

[[ "$PORT_4100" == "blocked" ]] && pass "Port 4100 not exposed externally (correct)" || fail "Port 4100 is externally accessible — check UFW"
[[ "$PORT_4101" == "blocked" ]] && pass "Port 4101 not exposed externally (correct)" || fail "Port 4101 is externally accessible — check UFW"

echo ""
echo -e "${YELLOW}── System Resources ───────────────────────────────────────────${NC}"
info "Disk usage (opt):  ${DISK_USAGE}"
info "Memory used:       ${MEMORY}"
info "System uptime:     ${UPTIME}"

echo ""
echo -e "${YELLOW}── Key Backend API Spot-checks ────────────────────────────────${NC}"

check_endpoint() {
    local label="$1" url="$2"
    local code
    code=$(curl -sf --max-time 8 "${url}" -o /dev/null -w "%{http_code}" 2>/dev/null || echo "000")
    [[ "$code" =~ ^(200|201)$ ]] && pass "${label} → ${code}" || fail "${label} → ${code}"
}

check_endpoint "GET /api/health"                       "http://${VPS_IP}/api/health"
check_endpoint "GET /api/stocks"                       "http://${VPS_IP}/api/stocks"
check_endpoint "GET /api/portfolio"                    "http://${VPS_IP}/api/portfolio"
check_endpoint "GET /api/ai/status"                    "http://${VPS_IP}/api/ai/status"
check_endpoint "GET /api/notifications/daily-digest"   "http://${VPS_IP}/api/notifications/daily-digest"

# =============================================================================
# Summary
# =============================================================================
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
if [[ $FAILURES -eq 0 ]]; then
    echo -e "${GREEN}  ALL CHECKS PASSED — Dashboard is healthy                       ${NC}"
    echo -e "${GREEN}  http://${VPS_IP}                                             ${NC}"
else
    echo -e "${RED}  ${FAILURES} CHECK(S) FAILED — Review output above               ${NC}"
    echo ""
    echo "  Useful commands:"
    echo "    ssh hetzner-vps 'pm2 logs --lines 50'"
    echo "    ssh hetzner-vps 'pm2 list'"
    echo "    ssh hetzner-vps 'journalctl -u nginx --no-pager -n 30'"
    echo "    ssh hetzner-vps 'systemctl status postgresql'"
fi
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

exit $FAILURES
