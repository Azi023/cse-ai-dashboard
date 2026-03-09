# CSE AI Trading Dashboard — Blueprint v2 (REFINED)
## Personal Trading System → Module 1 Foundation

**Date:** March 9, 2026
**Version:** 2.0 — Post-Research Refinement
**Status:** Pre-Development, Blueprint FINALIZED

---

## CHANGELOG from v1
- Added CBSL data sources (Excel downloads for monetary/macro data)
- Discovered Almas Equities publishes a daily Whitelist Index with IASSL collaboration
- Found SEC has accredited 6 Shariah scholars and issued formal Whitelist directions
- Expanded factor analysis from 4 to 12 categories
- Added Shariah screening methodology detail (two-tier: business + financial)
- Added prohibited business categories for Shariah (alcohol, tobacco, etc.)
- Refined data source matrix with URLs
- Added competitive intelligence (what Almas is already doing)

---

## PART 1: COMPLETE DATA SOURCE MATRIX

### A. CSE Market Data (Reverse-Engineered API — 22 Endpoints)

Base URL: `https://www.cse.lk/api/` | All POST requests
Source: GH0STH4CKER's documentation (GitHub)

| Category | Endpoint | Data Returned | Poll Frequency |
|----------|----------|---------------|----------------|
| **Prices** | `companyInfoSummery` | Price, change%, MCap, beta | On demand |
| | `tradeSummary` | All traded stocks with prices | 30 sec |
| | `todaySharePrice` | All stock prices today | 30 sec |
| | `chartData` | Historical price data | On demand |
| | `companyChartDataByStock` | Per-stock chart data | On demand |
| **Market** | `marketStatus` | Open/closed status | 60 sec |
| | `marketSummery` | Volume, turnover totals | 60 sec |
| | `aspiData` | All Share Price Index | 60 sec |
| | `snpData` | S&P Sri Lanka 20 | 60 sec |
| | `allSectors` | 20 sector indices | 60 sec |
| **Rankings** | `topGainers` | Top gaining stocks | 60 sec |
| | `topLooses` | Top losing stocks | 60 sec |
| | `mostActiveTrades` | Highest volume stocks | 60 sec |
| **Trades** | `detailedTrades` | Granular trade logs | 30 sec |
| | `dailyMarketSummery` | End-of-day summary | Once at 3 PM |
| **News** | `getFinancialAnnouncement` | Earnings releases | 30 min |
| | `approvedAnnouncement` | Board approvals | 30 min |
| | `circularAnnouncement` | CSE circulars | 30 min |
| | `directiveAnnouncement` | Directives | 30 min |
| | `getNonComplianceAnnouncements` | Non-compliance | 30 min |
| | `getNewListingsRelatedNoticesAnnouncements` | IPOs/new listings | 30 min |
| | `getBuyInBoardAnnouncements` | Buy-in board | 30 min |
| | `getCOVIDAnnouncements` | COVID announcements | Daily |

### B. CBSL Macro Data (Central Bank of Sri Lanka)

Source: `https://www.cbsl.gov.lk/en/statistics/`
Format: Downloadable Excel files (.xlsx) — can be parsed programmatically

| Data Category | Specific Tables | URL/Source | Update Frequency |
|---------------|----------------|------------|------------------|
| **Interest Rates** | Policy rates, T-bill rates, lending rates, deposit rates | Monthly tables (2003-latest) | Monthly |
| **Money Supply** | M1, M2, reserve money, money multiplier | Monthly tables | Monthly |
| **Inflation** | CCPI (Colombo Consumer Price Index) | Monthly/Weekly indicators | Monthly |
| **Exchange Rates** | USD/LKR, major currencies | Daily indicators page | Daily |
| **Foreign Reserves** | Gross official reserves | Monthly indicators | Monthly |
| **GDP** | Real GDP, GDP by sector | Quarterly | Quarterly |
| **Balance of Payments** | Trade balance, current account | External sector tables | Monthly |
| **Remittances** | Workers' remittances inflows | Quarterly bulletin | Quarterly |
| **Banking Sector** | Commercial bank assets/liabilities | Monthly tables | Monthly |
| **Government Debt** | Public debt levels, fiscal deficit | Fiscal sector tables | Monthly |

Additional CBSL Sources:
- **Daily Price Report**: `cbsl.gov.lk/en/statistics/economic-indicators/price-report`
- **Daily Indicators**: `cbsl.gov.lk/en/statistics/economic-indicators/daily-indicators`
- **Weekly Indicators**: `cbsl.gov.lk/en/statistics/economic-indicators/weekly-indicators`
- **Monthly Bulletin**: `cbsl.gov.lk/en/statistics/economic-indicators/monthly-bulletin`
- **Monetary Policy Reviews**: Published 6x/year (latest: No.1 of 2026, Jan 28)
- **PMI Survey**: Purchasing Managers' Index (business confidence)
- **Economic Data Library**: `cbsl.lk/eresearch` (searchable database)

### C. Shariah Compliance Data

| Data Source | What It Provides | Access Method |
|-------------|------------------|---------------|
| **SEC Screening Methodology** | Official 2-tier screening rules (business + financial) | PDF: `sec.gov.lk/wp-content/uploads/2024/09/Standard-Shariah-Compliant-Securities-Screening-Methodology.pdf` |
| **Almas Equities Whitelist** | Daily Whitelist Index, stocks screened against AAOIFI, Meezan, Dow Jones, SC Malaysia, BSE India | Published on CSE/Almas website — can scrape |
| **Lanka Securities (LSL) List** | Shariah-compliant securities list | PDF: `lsl.lk/pdf/research/list.pdf` |
| **Islamicly.com** | Global Shariah screening for 30,000+ stocks incl. Sri Lanka | API/website — check for API access |
| **SEC Accredited Scholars List** | 6 accredited Shariah scholars for CSE | SEC news room (May 2024 directive) |
| **CSE Company Financials** | Annual reports, quarterly statements (needed for debt ratios) | CSE website per-company pages — PDF download |

### D. Global/External Data Sources

| Data Category | Source | Access Method | Why It Matters |
|---------------|--------|---------------|----------------|
| **Oil Prices** | Yahoo Finance, Alpha Vantage | Free API | SL imports 100% oil — direct LKR/inflation impact |
| **Gold Prices** | Yahoo Finance | Free API | Safe haven indicator, SL gold imports |
| **US Market (S&P 500)** | Yahoo Finance, Alpha Vantage | Free API | Global risk sentiment |
| **US Fed Rate** | FRED API (Federal Reserve) | Free API | Capital flow direction to emerging markets |
| **Indian Market (Sensex)** | Yahoo Finance | Free API | Regional peer comparison |
| **Commodity Prices** | Tea, rubber, coconut (SL key exports) | Various APIs | Export revenue → LKR strength → stock prices |
| **Global News** | Reuters, Bloomberg, local (Daily FT) | Web scraping / news APIs | Sentiment analysis |
| **IMF/World Bank** | SL economic outlook, debt sustainability | Public reports | Long-term macro assessment |
| **Credit Ratings** | S&P, Moody's, Fitch | Public announcements | Foreign investor confidence |
| **Tourist Arrivals** | SLTDA monthly data | Web scraping | Hotels/travel sector driver |

---

## PART 2: THE 12 FACTORS THE AI MUST ANALYZE

Research confirms that CSE performance is driven by a broader set of factors than most investors consider. Here's the complete framework:

### FACTOR 1: CBSL Monetary Policy
**What:** Interest rate direction (Standing Deposit Facility Rate, Standing Lending Facility Rate)
**Why:** Research shows interest rates have a significant negative correlation with ASPI — when rates drop, stocks rise as fixed deposits become less attractive, driving money into equities.
**Data Source:** CBSL policy rate announcements (6x/year), interest rate tables
**AI Logic:** Rate cut → BULLISH signal. Rate hike → BEARISH signal. Track the direction, not just the level.

### FACTOR 2: Inflation (CCPI)
**What:** Consumer price inflation trends
**Why:** High inflation erodes purchasing power, increases company costs, and typically leads to rate hikes.
**Data Source:** CBSL monthly CPI data
**AI Logic:** Falling inflation → positive (CBSL likely to cut rates). Rising inflation → negative (rate hike risk).

### FACTOR 3: Exchange Rate (USD/LKR)
**What:** Rupee strength/weakness against the US dollar
**Why:** Academic research confirmed significant positive correlation between exchange rate and ASPI. Weak LKR hurts importers but helps exporters (tea, apparel, rubber).
**Data Source:** CBSL daily FX indicators
**AI Logic:** Per-stock impact varies by sector. Maintain a mapping: Exporters (positive from weak LKR), Importers (negative from weak LKR), Domestic-focused (neutral).

### FACTOR 4: Foreign Investor Flows
**What:** Net foreign buying/selling on the CSE
**Why:** Foreign investors account for significant volume. Net selling creates downward pressure; net buying signals confidence.
**Data Source:** CSE daily market summary (foreign buying/selling data)
**AI Logic:** Sustained net foreign buying → BULLISH. Sustained net selling → BEARISH. Single-day spikes → noise, ignore.

### FACTOR 5: Government Fiscal Position
**What:** Budget deficit, government borrowing, public debt levels
**Why:** High government borrowing competes with private sector for capital (crowding out effect), pushes up yields.
**Data Source:** CBSL fiscal sector tables, Treasury bill auction results
**AI Logic:** Improving fiscal position → positive for equities. Rising debt/deficit → cautionary.

### FACTOR 6: Geopolitical Events
**What:** Global conflicts (Iran/US-Israel, Russia-Ukraine), trade wars, sanctions
**Why:** Sri Lanka is highly exposed through oil imports, remittance flows from Middle East (~25%), tourism from Europe/Asia, and tea exports to Middle East/Russia.
**Data Source:** News APIs, web scraping global news
**AI Logic:** Map each geopolitical event to SL impact channels:
- Oil price impact → Energy sector, transport, manufacturing costs
- Remittance risk → Consumer spending, banking sector deposits
- Tourism impact → Hotels, travel, leisure sectors
- Trade route disruption → Export sectors
- Safe haven flows → Gold, US dollar strength → LKR weakness

### FACTOR 7: Commodity Prices (Tea, Rubber, Coconut, Oil)
**What:** Prices of Sri Lanka's key exports and imports
**Why:** Tea is SL's #1 export. Oil is #1 import. These directly affect trade balance, LKR, and company revenues.
**Data Source:** Commodity price APIs
**AI Logic:** Rising tea prices → positive for plantation stocks. Rising oil → negative for most sectors.

### FACTOR 8: Political Stability & Policy
**What:** Government changes, policy shifts, elections
**Why:** CSE is extremely sensitive to political events. The 2024 post-election rally took ASPI to record highs after political stability expectations improved.
**Data Source:** News analysis, government policy announcements
**AI Logic:** Political stability/reform → BULLISH. Uncertainty/crisis → BEARISH.

### FACTOR 9: Corporate Earnings & Fundamentals
**What:** Quarterly earnings reports, annual results, dividend announcements
**Why:** This is the micro-level driver of individual stock prices.
**Data Source:** CSE financial announcements API endpoint, company annual reports
**AI Logic:** Earnings beat expectations → positive. Earnings miss → negative. Track earnings surprise (actual vs estimated).

### FACTOR 10: Market Technical Indicators
**What:** Price trends, moving averages, volume patterns, RSI
**Why:** Even fundamental investors benefit from timing entry/exit points.
**Data Source:** Calculated from CSE historical price/volume data
**AI Logic:** Calculate 20-day, 50-day, 200-day moving averages. Track RSI. Volume confirmation of price moves. Support/resistance levels.

### FACTOR 11: Sector Rotation
**What:** Capital flowing between CSE sectors
**Why:** Smart money moves from overvalued to undervalued sectors. Tracking this gives early signals.
**Data Source:** `allSectors` API endpoint — all 20 sector indices
**AI Logic:** Compare sector performance vs ASPI. Identify sectors gaining/losing relative strength. Cross-reference with macro factors (e.g., rate cuts → banking sector usually benefits first).

### FACTOR 12: Liquidity & Market Breadth
**What:** Overall market turnover, number of stocks advancing vs declining, breadth indicators
**Why:** A rally driven by few stocks is fragile. Broad-based rallies are healthier.
**Data Source:** CSE market summary, detailed trades
**AI Logic:** Rising ASPI with high volume + broad participation → strong rally. Rising ASPI with low volume + narrow leadership → fragile, caution.

---

## PART 3: SHARIAH SCREENING ENGINE — DETAILED SPECIFICATION

### The Problem You're Solving (Avoiding Alcohol, Tobacco, etc.)

The SEC's standardized methodology uses a **two-tier screening** approach:

#### Tier 1: Business Activity Screen (QUALITATIVE)
The following business activities are **AUTOMATICALLY NON-COMPLIANT** — the AI must flag and EXCLUDE these:

| Haram Category | Examples on CSE |
|---------------|-----------------|
| **Alcohol** | Distilleries Company (DIST), Ceylon Beverage Holdings, Lanka Milk Foods (if alcohol segment) |
| **Tobacco** | Ceylon Tobacco Company (CTC) |
| **Pork / Non-Halal Food** | Any company with pork processing |
| **Conventional Finance** | All banks (HNB, COMB, SAMP, etc.) — unless Islamic window |
| **Insurance** | All conventional insurance companies |
| **Gambling/Casinos** | Any entertainment with gambling |
| **Pornography/Adult Entertainment** | N/A on CSE currently |
| **Weapons/Arms Manufacturing** | N/A on CSE currently |

**IMPORTANT FOR YOU**: Ceylon Tobacco (CTC) and Distilleries Company (DIST) are two of the most popular CSE stocks. Your system MUST automatically exclude these from your Shariah-compliant view. This is exactly the protection you asked for — no accidental alcohol stock purchases.

#### Tier 2: Financial Ratio Screen (QUANTITATIVE)
For companies that pass Tier 1, these financial ratios must ALL be satisfied:

| Ratio | Threshold | Formula | What It Catches |
|-------|-----------|---------|-----------------|
| **Interest Income Ratio** | < 5% | (Interest income + non-compliant income) / Total Revenue | Companies earning too much from riba |
| **Debt Ratio** | < 30% | Interest-bearing debt / Market Capitalization | Excessive reliance on conventional borrowing |
| **Interest-Earning Deposits** | < 30% | Interest-bearing deposits / Market Capitalization | Cash in riba accounts |
| **Receivables Ratio** | < 50% | (Receivables + Prepayments + Cash) / Total Assets | Illiquid/financial-heavy companies |

**Data Required:** These ratios need company financial statements (balance sheet, income statement). Source: CSE annual reports + quarterly filings.

**Purification Calculation:**
For compliant stocks, investors must purify impermissible income:
- **Dividend Purification** = (Total Dividend Received / Shares Owned) × Percentage of non-compliant income to total income
- **Capital Gain Purification** = consult broker (varies by methodology)

### Existing Whitelist Sources to Cross-Reference

**Almas Equities Whitelist** is the most comprehensive existing resource:
- Screens against 5 global standards simultaneously: AAOIFI, Meezan (Pakistan), Dow Jones, Securities Commission Malaysia, BSE/NIFTY India
- Published daily as the Almas Whitelist Index
- Prepared in collaboration with IASSL (Institute of Applied Statistics)
- Available on CSE website and Almas Equities

**Lanka Securities (LSL) Whitelist:**
- Screens based on AAOIFI standards
- Published as a PDF list
- Coverage: all companies listed on CSE

**Your Competitive Advantage:**
Almas and LSL publish LISTS. You're building an INTELLIGENCE LAYER on top:
1. Real-time compliance monitoring (their lists update periodically; yours updates continuously)
2. Purification calculator (they list stocks; you calculate purification amounts based on holdings)
3. AI analysis of only compliant stocks (they list; you analyze and explain)
4. Compliance CHANGE alerts (they publish snapshots; you alert when a stock's status changes)

---

## PART 4: DASHBOARD ARCHITECTURE (Same as v1 — 6 screens)

*[No changes from v1 — refer to previous document]*

---

## PART 5: TECHNICAL ARCHITECTURE (REFINED)

### Data Ingestion Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    DATA SOURCES                          │
│                                                          │
│  CSE API ──────┐                                        │
│  (22 endpoints)│                                        │
│                ▼                                        │
│  ┌──────────────────────┐    ┌──────────────────┐       │
│  │ CSE Data Ingester    │    │ CBSL Data Loader │       │
│  │ - Polls every 30s    │    │ - Downloads .xlsx│       │
│  │ - Handles failures   │    │ - Parses to JSON │       │
│  │ - Rate limiting      │    │ - Weekly refresh │       │
│  └─────────┬────────────┘    └────────┬─────────┘       │
│            │                          │                  │
│            ▼                          ▼                  │
│  ┌──────────────────────────────────────────────┐       │
│  │              REDIS CACHE                      │       │
│  │  - Real-time prices (hot data)                │       │
│  │  - Current ASPI/S&P SL20                      │       │
│  │  - Today's gainers/losers                     │       │
│  │  - Market status                              │       │
│  └─────────────────┬────────────────────────────┘       │
│                    │                                     │
│                    ▼                                     │
│  ┌──────────────────────────────────────────────┐       │
│  │           POSTGRESQL                          │       │
│  │  Tables:                                      │       │
│  │  - stocks (symbol, name, sector, shariah_status)     │
│  │  - prices_daily (date, open, high, low, close, vol)  │
│  │  - financials (quarterly P&L, BS, CF statements)     │
│  │  - shariah_screening (ratios, compliance status)     │
│  │  - announcements (type, date, content)               │
│  │  - macro_data (indicator, date, value)               │
│  │  - portfolio (holdings, buy_price, qty)              │
│  │  - signals (date, stock, direction, confidence)      │
│  │  - signal_outcomes (actual result after N days)      │
│  └─────────────────┬────────────────────────────┘       │
│                    │                                     │
│                    ▼                                     │
│  ┌──────────────────────────────────────────────┐       │
│  │         AI ANALYSIS ENGINE                    │       │
│  │                                               │       │
│  │  Claude API (Sonnet for speed, Opus for depth)│       │
│  │                                               │       │
│  │  Inputs per analysis request:                 │       │
│  │  - Stock data (price, volume, fundamentals)   │       │
│  │  - Sector performance context                 │       │
│  │  - Macro environment (12 factors)             │       │
│  │  - Shariah compliance status                  │       │
│  │  - Recent announcements                       │       │
│  │  - Portfolio context (what you already hold)   │       │
│  │                                               │       │
│  │  Outputs:                                     │       │
│  │  - Daily Market Brief (8:30 AM)               │       │
│  │  - Per-Stock Intelligence Report              │       │
│  │  - Portfolio Health Check                     │       │
│  │  - Trading Signals with confidence scores     │       │
│  │  - Strategy chat responses                    │       │
│  └──────────────────────────────────────────────┘       │
│                                                          │
│  ┌──────────────────────────────────────────────┐       │
│  │       SHARIAH SCREENING ENGINE                │       │
│  │                                               │       │
│  │  1. Business Activity Filter (Tier 1)         │       │
│  │     - Hard-coded haram category list          │       │
│  │     - Maps CSE sectors to compliance          │       │
│  │                                               │       │
│  │  2. Financial Ratio Calculator (Tier 2)       │       │
│  │     - Ingests quarterly financials            │       │
│  │     - Calculates 4 ratio screens              │       │
│  │     - Tracks ratio changes over time          │       │
│  │                                               │       │
│  │  3. Purification Calculator                   │       │
│  │     - Per-holding purification amount         │       │
│  │     - Quarterly purification report           │       │
│  │                                               │       │
│  │  4. Cross-Reference Engine                    │       │
│  │     - Compare our results vs Almas Whitelist  │       │
│  │     - Compare vs LSL Shariah list             │       │
│  │     - Flag discrepancies for manual review    │       │
│  └──────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────┘
```

### Tech Stack (FINALIZED)

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Frontend** | Next.js 14+ / TypeScript | SSR, React, PWA capability |
| **UI** | Tailwind CSS + shadcn/ui | Professional, fast dev |
| **Charts** | Lightweight Charts (TradingView) + Recharts | TradingView-style financial charts |
| **Backend** | NestJS + TypeScript | Microservices, TypeScript end-to-end |
| **Database** | PostgreSQL 16 | ACID, financial data integrity |
| **Cache** | Redis 7 | Real-time price data |
| **AI** | Anthropic Claude API | Best financial reasoning |
| **Scheduler** | Bull (Redis-based job queue) | Cron jobs for data polling |
| **Excel Parsing** | SheetJS (xlsx) | Parse CBSL Excel files |
| **PDF Parsing** | pdf-parse / pdfplumber | Extract company financials from annual reports |
| **Hosting** | Vercel (FE) + Railway (BE) | Low cost, SG region |
| **Version Control** | GitHub (private repo) | Standard |
| **Dev Environment** | WSL2 Ubuntu | Your existing setup |

---

## PART 6: SHARIAH BLACKLIST — HARD-CODED CSE STOCKS TO EXCLUDE

These CSE-listed companies are in AUTOMATICALLY HARAM categories. The system must NEVER include them in Shariah-compliant analysis:

### Alcohol & Beverages
- **DIST.N0000** — Distilleries Company of Sri Lanka PLC (largest spirits producer)
- **LION.N0000** — Lion Brewery (Ceylon) PLC (beer)
- **BREW.N0000** — Ceylon Beverage Holdings PLC (beer/spirits)

### Tobacco
- **CTC.N0000** — Ceylon Tobacco Company PLC

### Conventional Finance (Banks — unless Islamic window)
- **COMB.N0000** — Commercial Bank of Ceylon
- **HNB.N0000** — Hatton National Bank (your broker!)
- **SAMP.N0000** — Sampath Bank
- **SEYB.N0000** — Seylan Bank
- **NDB.N0000** — National Development Bank
- **DFCC.N0000** — DFCC Bank
- **PABC.N0000** — Pan Asia Banking Corporation
- *Note: Amana Bank is Islamic — would need separate assessment*

### Conventional Insurance
- **ALIC.N0000** — Sri Lanka Insurance Corporation
- **JINS.N0000** — Janashakthi Insurance
- **CINS.N0000** — Ceylinco Insurance
- **CTHR.N0000** — CT Holdings (if insurance dominant)
- *And other insurance companies*

### Finance Companies
- **LOLC.N0000** — LOLC Finance (conventional lending — the parent LOLC Holdings requires deep analysis)
- **CDB.N0000** — Citizens Development Business
- **CFIN.N0000** — Central Finance Company
- *And other NBFIs*

**NOTE:** Some conglomerates (like JKH, Hayleys, LOLC Holdings) have mixed businesses. These require Tier 2 financial ratio analysis — they're not automatically excluded but may fail on debt/interest income thresholds.

---

## PART 7: PHASED BUILD PLAN (Same as v1 — 5 phases)

*[No changes from v1]*

---

## PART 8: RISK MANAGEMENT RULES (Same as v1)

*[No changes from v1]*

---

## PART 9: PERFORMANCE TRACKING (Same as v1)

*[No changes from v1]*

---

## PART 10: COMPETITIVE LANDSCAPE

### Who Else Is Doing What on the CSE?

| Product | What They Do | What They DON'T Do |
|---------|-------------|-------------------|
| **Stockflow.lk** | Retrospective portfolio P&L tracking | No AI, no forward analysis, no Shariah |
| **Almas Equities** | Daily Whitelist Index, Shariah screening (5 standards) | No AI analysis, no purification calc, no public platform |
| **Lanka Securities** | Static Shariah-compliant list (PDF) | No real-time, no AI, no automation |
| **Genie (Dialog)** | Mobile stock trading | No AI intelligence, no Shariah |
| **CAL Online** | Online trading platform | No AI, no Shariah screening |
| **TVA (Medium project)** | Google Sheets CSE tracker with Gemini AI | Spreadsheet-based, no real-time, no Shariah |
| **Your Platform** | AI intelligence + real-time Shariah screening + purification calc + portfolio tracking + signal generation | Everything above, combined |

### Your Unique Moat (The Compounding Stack)
1. **Data pipeline** (CSE API + CBSL + global) — engineering effort
2. **12-factor AI analysis** — domain expertise + AI
3. **Shariah screening engine** (SEC methodology + cross-reference) — religious/ethical domain
4. **Purification calculator** — unique utility
5. **Multilingual architecture** — accessibility moat
6. **Signal generation + performance tracking** — compounding data asset

No single competitor has more than 2 of these. You'll have all 6.

---

## APPENDIX A: CBSL DATA DOWNLOAD URLs

All Excel files, directly parseable:

```
# Monetary Sector
Interest Rates (Monthly): https://www.cbsl.gov.lk/sites/default/files/cbslweb_documents/statistics/sheets/table4.04_20260305.xlsx
Money Supply (Monthly): https://www.cbsl.gov.lk/sites/default/files/cbslweb_documents/statistics/sheets/table4.02_20260219.xlsx
Reserve Money: https://www.cbsl.gov.lk/sites/default/files/cbslweb_documents/statistics/sheets/table4.11_20260126.xlsx
CBSL Balance Sheet: https://www.cbsl.gov.lk/sites/default/files/cbslweb_documents/statistics/sheets/table4.06_20260126.xlsx
Commercial Bank Assets: https://www.cbsl.gov.lk/sites/default/files/cbslweb_documents/statistics/sheets/table4.08_20260126.xlsx

# Additional sector tables available at:
# Real Sector: cbsl.gov.lk/en/statistics/statistical-tables/real-sector
# External Sector: cbsl.gov.lk/en/statistics/statistical-tables/external-sector
# Fiscal Sector: cbsl.gov.lk/en/statistics/statistical-tables/fiscal-sector
# Financial Sector: cbsl.gov.lk/en/statistics/statistical-tables/financial-sector
```

---

## APPENDIX B: SEC SHARIAH INFRASTRUCTURE

**Accredited Shariah Scholars (6 scholars approved by SEC in May 2024):**
- These scholars are recognized as Supplementary Service Providers under the SEC Act
- Any Whitelist Index must be approved by at least 3 of these 6 scholars
- The SEC issued formal directives on Whitelist Index construction and publication

**Standard Shariah Compliant Securities Screening Methodology:**
- Developed by the 6 accredited scholars
- Approved by SEC Commission
- Published: September 2024
- Draws from AAOIFI, FTSE Shariah, S&P 500 Shariah Index, and Dow Jones standards
- Adapted for Sri Lankan market conditions

**SEC is actively accepting applications for Shariah Scholar accreditation** (visible on SEC homepage as of March 2026) — the ecosystem is growing.

---

*This document is the DEFINITIVE blueprint. Version 2 incorporates all research findings. Ready for development.*
