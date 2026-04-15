#!/bin/bash
# Friday Pipeline Monitor — Watch all Friday-specific crons
# Usage: ssh hetzner-vps "bash /opt/cse-ai-dashboard/scripts/friday-monitor.sh"

echo "═══════════════════════════════════════════════════════"
echo "  FRIDAY PIPELINE MONITOR — $(date '+%Y-%m-%d %H:%M SLT')"
echo "═══════════════════════════════════════════════════════"

echo ""
echo "Watching PM2 logs for Friday crons..."
echo "Expected sequence:"
echo "  2:40 PM — Daily snapshots saved"
echo "  2:42 PM — Stock scoring run"
echo "  2:50 PM — Weekly metrics calculation"
echo "  2:55 PM — AI recommendation (Sonnet)"
echo "  3:00 PM — Weekly brief + Daily market summary"
echo "  3:15 PM — Daily integrity check"
echo "  3:30 PM — Signal outcome tracking"
echo ""

# Show last 0 lines to drain the buffer, then follow live
pm2 logs cse-backend --nostream --lines 0 2>/dev/null
echo "Now following live logs (Ctrl+C to stop)..."
echo ""

pm2 logs cse-backend --raw 2>/dev/null | grep --line-buffered -iE \
  'weekly|recommendation|brief|metrics|scoring|regime|digest|integrity|signal.*outcome|friday|error|warn'
