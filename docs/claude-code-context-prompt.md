I'm building a personal AI-powered trading dashboard for the Colombo Stock Exchange (CSE) in Sri Lanka. I have comprehensive blueprint documents in my /docs folder that cover the full architecture — please read them before starting.

## PROJECT OVERVIEW
- **Name:** CSE AI Trading Dashboard
- **Goal:** Personal trading intelligence platform with Shariah compliance screening
- **Current Phase:** Phase 1 — Data Pipeline + Basic Dashboard

## TECH STACK
- Frontend: Next.js 14 + TypeScript + Tailwind CSS + shadcn/ui
- Backend: NestJS + TypeScript
- Database: PostgreSQL 16 (installed, but database NOT yet created)
- Cache: Redis 7 (installed and running)
- Charts: TradingView Lightweight Charts + Recharts
- AI: Anthropic Claude API (NOT available yet — skip AI features for now, build Phase 1 without it)

## ENVIRONMENT
- WSL2 Ubuntu 24.04
- Node.js v24.13.0, npm 11.6.2
- PostgreSQL 16.13 installed (needs database creation)
- Redis running (redis-cli ping returns PONG)
- Git initialized
- Project root: ~/workspace/cse-ai-dashboard

## WHAT'S ALREADY DONE
- Project directory structure created
- Blueprint documents in /docs (READ THESE FIRST):
  - cse-dashboard-blueprint-v2.md (MASTER DOCUMENT — has full architecture, API endpoints, data sources, Shariah screening spec)
  - brainstorm-critical-problems-v1.md (research on 5 critical problems)
  - claude-code-setup-guide.md (setup instructions)
- .env.example created
- .gitignore needs to be populated

## WHAT I NEED YOU TO DO FIRST

1. **Read the blueprint documents** in /docs — especially cse-dashboard-blueprint-v2.md. This has the complete CSE API endpoint list (22 endpoints), database schema requirements, Shariah screening rules, and tech architecture.

2. **Set up PostgreSQL database** — Create the database and user. Run:
   ```
   sudo -u postgres psql -c "CREATE DATABASE cse_dashboard;"
   sudo -u postgres psql -c "CREATE USER cse_user WITH PASSWORD 'cse_secure_2026';"
   sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE cse_dashboard TO cse_user;"
   ```

3. **Initialize the NestJS backend** in src/backend with:
   - CSE data ingestion module (poll the 22 CSE API endpoints)
   - Redis caching layer
   - PostgreSQL connection with TypeORM or Prisma
   - Database schema for: stocks, daily_prices, announcements, macro_data, portfolio, shariah_screening

4. **Initialize the Next.js frontend** in src/frontend with:
   - Tailwind CSS + shadcn/ui setup
   - Market overview page (ASPI, S&P SL20, gainers, losers, most active)
   - Basic stock detail page with price chart

5. **Populate .gitignore** with Node.js, .env, node_modules, dist, .next, etc.

## DATA SOURCE — CSE API
Base URL: `https://www.cse.lk/api/`
All endpoints use POST requests with `application/x-www-form-urlencoded` data.
Key endpoints (full list in blueprint):
- `tradeSummary` — all traded stocks
- `marketSummery` — market totals
- `aspiData` — ASPI index
- `snpData` — S&P SL20
- `companyInfoSummery` — per-stock details (param: symbol)
- `topGainers`, `topLooses`, `mostActiveTrades`
- `allSectors` — 20 sector indices
- `detailedTrades` — granular trade data

## IMPORTANT NOTES
- The Anthropic API key is NOT available yet (payment issue being resolved). Skip all AI/Claude API integration for now. We'll add it in Phase 2.
- Focus purely on: data ingestion → caching → storage → display
- The CSE market is open Mon-Fri 9:30 AM - 2:30 PM Sri Lanka time (UTC+5:30)
- Remove any Zone.Identifier files in /docs (Windows artifact from WSL file transfer)

## CODING STANDARDS
- TypeScript strict mode everywhere
- ESLint + Prettier
- Meaningful commit messages
- Error handling on all API calls (CSE endpoints may fail or change)
- Environment variables for all config (never hardcode URLs, passwords, etc.)

Please start by reading the blueprint documents, then proceed with setup and Phase 1 implementation.
