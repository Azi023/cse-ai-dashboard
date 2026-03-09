# Setting Up the CSE AI Dashboard in Claude Code

## Pre-requisites Checklist

Before opening Claude Code, make sure these are installed on your WSL2 Ubuntu:

```bash
# Check Node.js (need v18+)
node --version

# Check npm
npm --version

# Check PostgreSQL
psql --version

# Check Redis
redis-cli ping

# Check Git
git --version

# If any are missing:
# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PostgreSQL 16
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql

# Redis
sudo apt install redis-server
sudo systemctl start redis-server

# Git (likely already installed)
sudo apt install git
```

## Project Initialization

```bash
# Create workspace
mkdir -p ~/workspace/cse-ai-dashboard
cd ~/workspace/cse-ai-dashboard

# Initialize Git
git init

# Create project structure
mkdir -p src/{backend,frontend,shared}
mkdir -p src/backend/{modules,config,utils}
mkdir -p src/backend/modules/{cse-data,ai-engine,shariah-screening,portfolio,signals}
mkdir -p src/frontend/{components,pages,hooks,utils}
mkdir -p docs
mkdir -p scripts
mkdir -p data/{shariah-lists,cbsl-macro,cse-historical}

# Create initial files
touch .env.example
touch .gitignore
touch README.md
```

## Environment Variables Needed

```bash
# .env.example (DO NOT commit actual .env)

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/cse_dashboard

# Redis  
REDIS_URL=redis://localhost:6379

# Anthropic Claude API
ANTHROPIC_API_KEY=your_key_here

# CSE API (no key needed - public endpoints)
CSE_API_BASE_URL=https://www.cse.lk/api/

# App Config
PORT=3001
NODE_ENV=development
```

## Database Setup

```sql
-- Run in PostgreSQL
CREATE DATABASE cse_dashboard;
CREATE USER cse_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE cse_dashboard TO cse_user;
```

## Anthropic API Key

You'll need a Claude API key from console.anthropic.com.
- Sign up / log in
- Create an API key
- Add credit (pay-as-you-go)
- Sonnet is ~$3/million input tokens — very affordable for this use case
- Store in .env file (never commit this)

## What to Tell Claude Code

When you open Claude Code in the project directory, paste this context prompt
to give it full understanding of what we're building:

---

**PASTE THIS INTO CLAUDE CODE AS YOUR FIRST MESSAGE:**

"I'm building a personal AI-powered CSE (Colombo Stock Exchange) trading
dashboard. I have comprehensive blueprint documents that cover the full
architecture. Let me share the key context:

PROJECT: CSE AI Trading Dashboard
GOAL: Personal trading intelligence platform for Sri Lankan stocks with
Shariah compliance screening

TECH STACK:
- Frontend: Next.js 14 + TypeScript + Tailwind + shadcn/ui
- Backend: NestJS + TypeScript  
- Database: PostgreSQL + Redis
- AI: Anthropic Claude API
- Charts: Lightweight Charts (TradingView) + Recharts

DATA SOURCES:
- CSE reverse-engineered API (22 endpoints, base: https://www.cse.lk/api/)
- CBSL macro data (downloadable Excel files)
- Company financials (PDF annual reports from CSE)

KEY FEATURES:
1. Real-time CSE market data dashboard
2. AI-powered stock analysis using Claude API (12-factor framework)
3. Shariah compliance screening (SEC Sri Lanka methodology)
4. Purification calculator for Islamic investors
5. Portfolio tracking with P&L
6. Trading signal generation with confidence scores
7. AI chat for strategy discussions

PHASE 1 (BUILD FIRST):
- CSE data ingestion service (poll 22 API endpoints)
- Redis caching layer for real-time data
- PostgreSQL schema for historical storage
- Basic Next.js dashboard showing live market data
- Price chart components

I have blueprint documents I'll share. Let's start with Phase 1."

---

Then upload the blueprint v2 markdown file into the Claude Code project.

## Recommended Claude Code Workflow

1. Start with the NestJS backend — get CSE data flowing
2. Test each API endpoint to confirm it works
3. Set up PostgreSQL schema and start storing historical data
4. Build Redis caching for real-time prices
5. Create the Next.js frontend with market overview screen
6. Integrate charts (TradingView Lightweight Charts)
7. Add Claude API integration for AI analysis
8. Build Shariah screening engine
9. Add portfolio tracking
10. Signal generation layer

## Files to Copy Into the Project

Copy these blueprint documents into the /docs folder:
- brainstorm-critical-problems-v1.md
- cse-dashboard-blueprint-v2.md (THE MASTER DOCUMENT)

These serve as your project documentation and context for Claude Code.
