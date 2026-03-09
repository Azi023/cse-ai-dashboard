#!/bin/bash
# CSE AI Dashboard — Quick Start Script
# Starts Redis, PostgreSQL, backend (NestJS), and frontend (Next.js)

echo "🚀 Starting CSE AI Dashboard..."
echo ""

# Navigate to project root
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

# Start Redis if not running
if redis-cli ping > /dev/null 2>&1; then
  echo "✓ Redis already running"
else
  echo "Starting Redis..."
  sudo redis-server --daemonize yes
  echo "✓ Redis started"
fi

# Start PostgreSQL if not running
if pg_isready -q 2>/dev/null; then
  echo "✓ PostgreSQL already running"
else
  echo "Starting PostgreSQL..."
  sudo service postgresql start 2>/dev/null
  echo "✓ PostgreSQL started"
fi

echo ""

# Start backend
echo "Starting backend on port 3001..."
cd "$PROJECT_DIR/src/backend" && npm run start:dev &
BACKEND_PID=$!

# Wait for backend to be ready
echo "Waiting for backend..."
sleep 5

# Start frontend
echo "Starting frontend on port 3000..."
cd "$PROJECT_DIR/src/frontend" && npm run dev &
FRONTEND_PID=$!

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Dashboard ready at http://localhost:3000"
echo "   Backend API at http://localhost:3001/api"
echo "   Backend PID: $BACKEND_PID"
echo "   Frontend PID: $FRONTEND_PID"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Market opens at 9:30 AM SLT"
echo "🤖 Run AI analysis after 10:00 AM:"
echo "   npx tsx scripts/generate-ai-content.ts"
echo ""
echo "Press Ctrl+C to stop all services"

# Trap Ctrl+C to kill both processes
trap "echo ''; echo 'Stopping services...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Done.'; exit 0" SIGINT SIGTERM

wait
