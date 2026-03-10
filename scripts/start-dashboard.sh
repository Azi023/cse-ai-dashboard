#!/bin/bash
LOG_DIR="$HOME/workspace/cse-ai-dashboard/logs"
mkdir -p $LOG_DIR

echo "[$(date)] Starting CSE Dashboard..." >> $LOG_DIR/cron.log

# Start backend
cd $HOME/workspace/cse-ai-dashboard/src/backend
npm run start:dev >> $LOG_DIR/backend.log 2>&1 &
echo $! > /tmp/cse-backend.pid

sleep 8

# Start frontend
cd $HOME/workspace/cse-ai-dashboard/src/frontend
npm run dev >> $LOG_DIR/frontend.log 2>&1 &
echo $! > /tmp/cse-frontend.pid

echo "[$(date)] CSE Dashboard started. Backend PID: $(cat /tmp/cse-backend.pid), Frontend PID: $(cat /tmp/cse-frontend.pid)" >> $LOG_DIR/cron.log
