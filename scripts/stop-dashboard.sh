#!/bin/bash
LOG_DIR="$HOME/workspace/cse-ai-dashboard/logs"
echo "[$(date)] Stopping CSE Dashboard..." >> $LOG_DIR/cron.log

# Kill by PID files
if [ -f /tmp/cse-backend.pid ]; then
  kill $(cat /tmp/cse-backend.pid) 2>/dev/null
  rm /tmp/cse-backend.pid
fi

if [ -f /tmp/cse-frontend.pid ]; then
  kill $(cat /tmp/cse-frontend.pid) 2>/dev/null
  rm /tmp/cse-frontend.pid
fi

# Kill any lingering node processes on those ports
fuser -k 3001/tcp 2>/dev/null  # backend
fuser -k 3000/tcp 2>/dev/null  # frontend

echo "[$(date)] CSE Dashboard stopped." >> $LOG_DIR/cron.log
