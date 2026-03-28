#!/bin/bash
# CSE Dashboard Monday Pre-Market Check
# Run before 9:30 AM SLT to verify all systems are green

echo "=== CSE Dashboard Monday Pre-Market Check ==="
echo "Time: $(TZ='Asia/Colombo' date)"
echo ""

echo "--- PM2 Status ---"
pm2 list
echo ""

echo "--- Backend Health ---"
curl -s http://localhost:4101/api/health | python3 -m json.tool
echo ""

echo "--- Strategy Engine Status ---"
curl -s http://localhost:4101/api/strategy-engine/status | python3 -m json.tool
echo ""

echo "--- Shariah Stats ---"
curl -s http://localhost:4101/api/shariah/stats | python3 -m json.tool
echo ""

echo "--- Token Usage (March 2026) ---"
echo "Tokens used: $(redis-cli get 'ai:tokens:2026-03')"
echo ""

echo "--- ATrad Sync Status ---"
curl -s http://localhost:4101/api/atrad/sync-status | python3 -m json.tool
echo ""

echo "--- Trade Queue (Pending) ---"
curl -s http://localhost:4101/api/trade/queue/pending | python3 -m json.tool
echo ""

echo "--- Safety Rails Status ---"
curl -s http://localhost:4101/api/trade/safety-status | python3 -m json.tool
echo ""

echo "=== Monday Afternoon Monitoring Plan ==="
echo "2:35 PM: curl http://localhost:4101/api/market/snapshot"
echo "2:41 PM: curl http://localhost:4101/api/strategy-engine/status"
echo "2:43 PM: curl http://localhost:4101/api/strategy-engine/signals"
echo "2:45 PM: curl http://localhost:4101/api/notifications/daily-digest"
echo "2:48 PM: curl http://localhost:4101/api/trade/queue/pending"
echo "3:00 PM: Check /signals page in browser"
echo "3:00 PM: Check /orders page for any pending approvals"
echo ""
echo "=== Ready for market open at 9:30 AM SLT ==="
