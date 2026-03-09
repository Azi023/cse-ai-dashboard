# CSE AI Dashboard — Remaining Work Tracker
## Everything That Still Needs to Be Built

**Last Updated:** March 9, 2026
**GitHub:** https://github.com/Azi023/cse-ai-dashboard.git
**Status:** ~70% complete

---

## PRIORITY 1: Critical for Daily Use (Build Next)

### 1A. CBSL Macro Data Integration
**Status:** DONE (backend module, ingestion script, frontend component)
**Why it matters:** The AI's 12-factor analysis framework depends on macro data. Without it, the AI is analyzing stocks in a vacuum.

What to build:
- Script to download CBSL Excel files (interest rates, inflation, exchange rates, money supply)
- Parser to extract data from .xlsx into PostgreSQL macro_data table
- Scheduled job to refresh CBSL data weekly
- Display macro indicators on the dashboard (interest rate trend, inflation, USD/LKR)
- Feed macro context into AI analysis prompts

Data sources (from blueprint):
- Interest rates: cbsl.gov.lk monthly tables
- USD/LKR rate: cbsl.gov.lk daily indicators
- Inflation (CCPI): cbsl.gov.lk monthly
- T-bill yields: cbsl.gov.lk government securities
- Money supply (M2): cbsl.gov.lk monetary survey

### 1B. Company Financial Statements Ingestion
**Status:** DONE (manual entry system, admin UI, entity/service/controller)
**Why it matters:** Shariah Tier 2 screening is currently marking all non-blacklisted stocks as "PENDING_REVIEW" because we don't have financial data to calculate the 4 ratio screens.

What to build:
- Scraper/parser for CSE company annual reports (PDFs)
- Extract key financials: total revenue, interest income, interest-bearing debt, deposits, receivables, total assets
- Store in a company_financials table
- Run Tier 2 Shariah screening against real data
- Move stocks from PENDING_REVIEW to COMPLIANT or NON_COMPLIANT
- Initially: manually enter financials for top 50 most-traded stocks
- Later: automate PDF parsing

### 1C. Historical Data Accumulation System
**Status:** DONE (daily cron + mid-day snapshot, CSV import utility, backfill script)
**Why it matters:** Charts need history. AI needs trends. Technical indicators need data points.

What to build:
- Backfill script to fetch historical price data from CSE chartData endpoint
- Store OHLCV data going back as far as the API provides
- Calculate and store moving averages (20-day, 50-day, 200-day)
- Calculate RSI, volume trends, and other technical indicators
- Make sure the daily cron job reliably stores each day's data

### 1D. Live AI Mode (Needs API Key)
**Status:** ARCHITECTURE DONE, waiting for API key
**Why it matters:** Mock analysis is template-based. Real Claude analysis is genuinely intelligent.

What to do:
- Resolve card payment issue (or use Wise/alternative card)
- Add ANTHROPIC_API_KEY to .env
- Test all 5 AI endpoints with real Claude responses
- Fine-tune system prompts based on quality of responses
- Enable prompt caching to reduce costs
- Add model routing: Haiku for simple queries, Sonnet for analysis

---

## PRIORITY 2: Important for Quality (Build This Week)

### 2A. Global Market Data Integration
**Status:** NOT STARTED
**Why it matters:** Factor 6 (geopolitical) and Factor 7 (commodities) need external data.

What to build:
- Oil price feed (Brent crude — affects SL import costs)
- Gold price feed (safe haven indicator)
- Tea auction price feed (SL's #1 export)
- USD/LKR exchange rate (from CBSL or free FX API)
- S&P 500 / US market indicator (global sentiment)
- Store in macro_data table with source tags
- Display on dashboard as "Global Indicators" section

### 2B. News & Announcements Enhancement
**Status:** BASIC (pulling CSE announcements only)
**Why it matters:** Company news drives stock prices. Regulatory news affects entire sectors.

What to build:
- Better announcement parsing (extract company symbol, announcement type)
- Announcement detail view (click to read full content)
- Filter announcements by: company, type (earnings/dividends/AGM/etc.), date range
- Notification system for announcements on stocks in your portfolio or watchlist
- Sri Lankan financial news scraping (Daily FT, Sunday Times Business, LBO)
- News sentiment indicator per stock (positive/negative/neutral based on recent news)

### 2C. Dividend Tracking
**Status:** NOT STARTED
**Why it matters:** Dividends are a major return component on CSE. Also needed for purification calculations.

What to build:
- Track dividend announcements from CSE API
- Store dividend history per stock (declaration date, ex-date, payment date, amount)
- Calculate dividend yield for each stock
- Portfolio dividend income tracking (actual dividends received)
- Dividend calendar: upcoming ex-dividend dates
- Purification calculator update: use actual dividend data instead of estimates

### 2D. Alert/Notification System
**Status:** NOT STARTED
**Why it matters:** You shouldn't have to stare at the dashboard all day.

What to build:
- Price alerts: notify when a stock crosses a price threshold
- Volume alerts: notify on unusual trading volume (e.g., 3x average)
- Shariah status change alerts: notify if a stock's compliance changes
- Portfolio P&L alerts: notify if portfolio drops more than X% in a day
- Announcement alerts: notify on news for portfolio/watchlist stocks
- Delivery method: browser notifications (Push API) for now, email later

---

## PRIORITY 3: Enhancement Features (Build This Month)

### 3A. Advanced Charts
**Status:** BASIC (TradingView lightweight charts, limited history)
**What to improve:**
- Candlestick charts with proper OHLCV data
- Moving average overlays (20/50/200 day)
- Volume profile
- RSI indicator panel
- Support/resistance level detection
- Comparison chart (stock vs ASPI, stock vs sector)
- Multi-timeframe view (1D, 1W, 1M, 3M, 6M, 1Y, ALL)

### 3B. Sector Analysis Page
**Status:** Sector indices shown on dashboard, but no dedicated page
**What to build:**
- /sectors page with detailed sector analysis
- Per-sector: performance chart, constituent stocks, PE ratio, market cap
- Sector comparison charts
- Sector rotation indicator (money flow between sectors)
- AI sector outlook (when AI is live)

### 3C. Stock Comparison Tool
**Status:** NOT STARTED
**What to build:**
- Compare 2-4 stocks side by side
- Price performance comparison chart
- Key metrics comparison table (P/E, P/B, ROE, D/E, yield)
- Shariah compliance comparison
- AI comparison analysis (when AI is live)

### 3D. Performance Analytics
**Status:** NOT STARTED (signal tracking schema exists but unused)
**What to build:**
- Track every AI signal: date, stock, direction, confidence, price at signal time
- Track outcome: price after 7 days, 14 days, 30 days
- Calculate: signal accuracy rate, average return, win rate, Sharpe ratio
- Dashboard showing AI performance metrics over time
- Compare: AI signals vs random vs buy-and-hold ASPI
- This data proves whether the AI is worth using

### 3E. Data Export & Reporting
**Status:** NOT STARTED
**What to build:**
- Export portfolio to CSV/Excel
- Generate monthly portfolio report (PDF)
- Export Shariah compliance report
- Purification summary report (quarterly)
- Tax-relevant P&L report (for Sri Lankan tax purposes)

---

## PRIORITY 4: Future Features (Build Later)

### 4A. ATrad Browser Automation (Trade Execution)
**Status:** NOT STARTED — research phase
**What to investigate:**
- Can Playwright/Puppeteer automate the ATrad web interface?
- Login flow automation
- Order placement automation
- Safety rails: max position, daily loss limit, kill switch
- Semi-auto mode: AI suggests, you approve via dashboard, system executes on ATrad
- Full-auto mode: AI decides and executes within parameters

### 4B. Mobile App / PWA
**Status:** NOT STARTED
**What to build:**
- Convert Next.js app to Progressive Web App (PWA)
- Offline capability for cached data
- Push notifications on mobile
- Responsive design optimization for small screens
- Home screen icon

### 4C. Multilingual Support (Sinhala/Tamil)
**Status:** NOT STARTED (architecture supports it but no translations)
**What to build:**
- i18n framework setup (next-intl or similar)
- English → Sinhala translation for all UI text
- English → Tamil translation for all UI text
- Financial glossary in all three languages
- AI responses in Sinhala/Tamil (when API is live)

### 4D. User Authentication & Multi-User
**Status:** NOT STARTED (currently single-user, no auth)
**What to build:** (Only needed if making this a public product)
- NextAuth.js or Clerk integration
- User registration/login
- Per-user portfolios, watchlists, preferences
- Role-based access (free vs premium features)
- This transforms the personal tool into Module 1 public product

### 4E. Backtesting Engine
**Status:** NOT STARTED
**What to build:**
- Define a trading strategy (e.g., "buy when RSI < 30 and Shariah compliant")
- Run it against historical data
- Calculate hypothetical returns
- Compare strategy vs buy-and-hold ASPI
- Optimize parameters
- This requires substantial historical data first

---

## TECHNICAL DEBT & IMPROVEMENTS

### Code Quality
- [ ] Add unit tests for Shariah screening logic
- [ ] Add unit tests for portfolio calculations
- [ ] Add integration tests for CSE API endpoints
- [ ] Error boundary components on all pages
- [ ] Proper logging (Winston or Pino)
- [ ] API rate limiting (don't hammer CSE endpoints)
- [ ] Database migrations (TypeORM or Prisma migrate)
- [ ] Environment-specific configs (dev/staging/prod)

### Performance
- [ ] Optimize Redis cache TTLs based on market hours
- [ ] Database query optimization (indexes on frequently queried columns)
- [ ] Frontend code splitting / lazy loading for pages
- [ ] Image optimization for company logos
- [ ] WebSocket connection for real-time updates (instead of polling)

### DevOps
- [ ] Push to GitHub (private repo)
- [ ] Set up CI/CD pipeline (GitHub Actions)
- [ ] Docker compose for local development
- [ ] Deployment to cloud (Vercel + Railway)
- [ ] Database backups schedule
- [ ] Monitoring / uptime checks

---

## ESTIMATED COMPLETION TIMELINE

| Phase | Features | Time Estimate | Status |
|-------|----------|---------------|--------|
| Phase 1 | Data pipeline + basic dashboard | 2-3 weeks | ✅ DONE |
| Phase 1.5 | Shariah + portfolio + purification | 1-2 weeks | ✅ DONE |
| Phase 2 | AI layer + UI polish | 1-2 weeks | ✅ DONE (mock mode) |
| Priority 1 | CBSL data, financials, history, live AI | 2-3 weeks | ⬜ NEXT |
| Priority 2 | Global data, news, dividends, alerts | 2-3 weeks | ⬜ |
| Priority 3 | Advanced charts, sectors, comparison, analytics | 3-4 weeks | ⬜ |
| Priority 4 | Automation, mobile, multilingual, auth, backtesting | 4-8 weeks | ⬜ |
| Tech debt | Tests, performance, DevOps | Ongoing | ⬜ |

**Total estimated remaining: 12-20 weeks of development**
(But you have a USABLE product right now — everything above makes it better)

---

## WHAT TO BUILD NEXT (RECOMMENDED ORDER)

1. Push current code to GitHub ← DO THIS TODAY
2. Historical data backfill (makes charts useful)
3. CBSL macro data integration (makes AI analysis smarter)
4. Company financials for top 50 stocks (makes Shariah screening real)
5. Live AI mode (when API key is sorted)
6. Alert system (saves you from watching the dashboard all day)
7. Advanced charts with technical indicators
8. Everything else in priority order
