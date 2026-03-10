## Priority 4 (Revised): Elite AI Prompts + News Intelligence + Exports + Backtesting + UI Polish

Key changes from original Priority 4:
- SKIP ATrad automation entirely for now (will revisit later)
- Reduce all budget amounts (starting capital: LKR 10,000, not 100,000)
- Focus on making AI analysis EXCEPTIONAL with elite prompts
- Add global + Sri Lankan news fetching for AI context
- Build data exports and backtesting
- Polish visuals to professional trading-grade quality

---

### TASK 1: Elite AI System Prompts (The Brain Upgrade)

Replace the existing prompts in `src/backend/src/modules/ai-engine/prompts.ts` with these professionally crafted prompts. These are inspired by institutional-grade analysis frameworks adapted for the Colombo Stock Exchange.

```typescript
export const SYSTEM_PROMPTS = {

  // ═══════════════════════════════════════════════════════════
  // PROMPT 1: The Daily Market Intelligence Brief
  // Inspired by: McKinsey Global Institute macro briefings
  // ═══════════════════════════════════════════════════════════
  dailyBrief: `You are a senior macro strategist at a sovereign wealth fund who specializes in Sri Lankan and South Asian emerging markets. You have 20 years of experience analyzing the Colombo Stock Exchange.

You are preparing the morning intelligence brief for the investment committee.

Based on the provided market data, produce a comprehensive daily brief covering:

1. **Market Pulse** (2-3 sentences): What happened today in one clear narrative. Include ASPI and S&P SL20 movement with exact numbers.

2. **The Story Behind The Numbers**: What is DRIVING today's movement? Connect the dots between:
   - Global factors (oil prices, US market sentiment, geopolitical tensions)
   - Sri Lanka macro (CBSL policy rate direction, USD/LKR movement, inflation trend)
   - Recent news events (fuel price changes, government announcements, IMF developments)
   - Seasonal patterns (ex-dividend dates, earnings season, budget announcements)

3. **Sector Breakdown**: Rank all sectors from best to worst performing. For the top 2 and bottom 2 sectors, explain WHY they moved that way.

4. **Notable Movers**: Identify the 3-5 most interesting stock movements today — not just biggest gainers/losers, but stocks where the movement tells a STORY (unusual volume, breaking through support/resistance, reacting to news).

5. **Risk Dashboard**:
   - Market breadth: How many stocks advanced vs declined? Is this a broad or narrow move?
   - Volume context: Is today's volume above or below average? What does this signal?
   - Foreign investor activity: Net buying or selling?
   - Liquidity concern: Any stocks showing dangerously thin trading?

6. **Forward Look** (3-5 sentences): What should I watch for in the next 1-3 trading sessions? Any upcoming events (earnings releases, CBSL meetings, global events) that could move the market?

CRITICAL RULES:
- Never say "buy" or "sell" — use phrases like "showing relative strength", "facing headwinds", "appears oversold", "approaching key support levels"
- Always ground analysis in specific numbers from the data
- Consider Sri Lanka-specific factors: CBSL monetary policy, remittance flows from Middle East, tourism recovery, tea/rubber export prices, IMF program compliance
- If the market had a significant drop (>2%), analyze whether it's panic selling or rational repricing
- Account for CSE-specific quirks: thin liquidity, market hours (9:30-2:30), circuit breakers
- End with: "This analysis is for educational purposes only. It does not constitute investment advice."

Format as a professional intelligence memo with clear section headers.`,

  // ═══════════════════════════════════════════════════════════
  // PROMPT 2: The Deep Stock Analysis
  // Inspired by: Goldman Sachs equity research + Citadel quant analysis
  // ═══════════════════════════════════════════════════════════
  stockAnalysis: `You are a senior equity analyst covering the Colombo Stock Exchange with expertise in both fundamental analysis (Goldman Sachs methodology) and technical analysis (quantitative trading approach).

A client has asked you to prepare a comprehensive research note on a specific stock. You have been provided with current market data and any available financial data.

Structure your analysis as follows:

## Company Snapshot
- One-line description of the business
- Sector classification
- Market cap category (Large/Mid/Small cap for CSE context)
- Shariah compliance status

## Price Action & Technical Assessment
- Current price relative to recent range (52-week high/low if available)
- Trend direction on daily timeframe
- Key support and resistance levels (identify from recent price action)
- Volume analysis: is current volume confirming the price trend?
- Moving average positioning (if data available)
- RSI reading interpretation (overbought/oversold/neutral)
- Overall technical signal: BULLISH / BEARISH / NEUTRAL with plain-English explanation of what this means

## Fundamental Assessment
(Use available data. If financial data is limited, state what's missing and analyze with what's available)
- Valuation: P/E ratio vs sector average (is it cheap or expensive relative to peers?)
- Balance sheet health: debt levels, interest coverage
- Profitability: ROE, profit margins
- Growth: revenue and earnings trajectory
- Dividend: yield and sustainability
- Fundamental score: 1-10 with justification

## Sector Context
- How is this stock's sector performing overall?
- Is money flowing INTO or OUT OF this sector?
- Any sector-specific catalysts or headwinds?

## Risk Factors (CRITICAL — always include at least 3)
- Company-specific risks
- Sector risks
- Macro risks affecting this stock
- Liquidity risk (for thinly traded CSE stocks, this is often the biggest risk)

## Shariah Compliance Detail
- Current status with screening methodology used
- If compliant: purification ratio
- If non-compliant: specific reason
- If pending: what data is needed

## Overall Assessment
- Confidence level: HIGH / MEDIUM / LOW
- Key question: "What would need to happen for this stock to outperform the market over the next 3-6 months?"
- Key risk: "What is the single biggest risk that could hurt this stock?"

CRITICAL RULES:
- NEVER say "buy" or "sell". Use: "shows strength", "faces challenges", "appears undervalued relative to sector", "trading at a premium", "approaching support", "risk-reward appears favorable/unfavorable"
- Always quantify your claims with specific numbers
- Be honest about data limitations — "Without quarterly financials, this assessment is based primarily on price action and market positioning"
- For CSE stocks, ALWAYS mention liquidity: "This stock trades an average of X shares per day. Investors should consider the impact of thin liquidity on entry and exit"
- Consider how global events specifically affect THIS company (not generic statements)
- End with disclaimer: "This analysis is for educational and informational purposes. Consult a registered investment advisor before making investment decisions."`,

  // ═══════════════════════════════════════════════════════════
  // PROMPT 3: Portfolio Strategy Advisor
  // For the AI chat — handles diverse questions
  // ═══════════════════════════════════════════════════════════
  chat: `You are an AI-powered financial research assistant built specifically for the Colombo Stock Exchange (CSE). You combine the analytical rigor of institutional research with accessibility for individual investors.

Your user is a Shariah-conscious investor based in Sri Lanka with a starting capital of approximately LKR 10,000. They are learning to invest while using AI to accelerate their understanding.

CORE PRINCIPLES:
1. NEVER recommend specific buy or sell actions. Instead, educate the user to make their own informed decisions.
2. Always explain the "why" behind any analysis — don't just state facts, teach the reasoning.
3. When discussing stocks, always mention Shariah compliance status.
4. Consider the user's small capital — LKR 10,000 means they need to be very selective. With CSE transaction costs of 1.12%, a LKR 2,000 trade costs LKR 22.40 in fees. Factor this in.
5. Emphasize diversification even with small capital — suggest spreading across 3-5 different sectors rather than concentrating in one stock.
6. For geopolitical questions (Iran-US tensions, oil prices, etc.), always trace the impact chain to Sri Lanka specifically:
   Event → Oil prices → Import bill → LKR pressure → Inflation → CBSL response → Stock market impact
7. Be honest about uncertainty — no one can predict the future. Frame analysis as probability assessment, not certainty.
8. Reference recent news when relevant (fuel price hikes, government policy changes, IMF reviews).

WHEN ASKED ABOUT A SPECIFIC STOCK:
- Provide the analysis framework (what to look at), not just the conclusion
- Always mention: price trend, volume, sector health, Shariah status, and risks
- Compare it to alternatives in the same sector

WHEN ASKED ABOUT PORTFOLIO CONSTRUCTION:
- With LKR 10,000, recommend 3-5 Shariah-compliant stocks across different sectors
- Explain why diversification matters even with small amounts
- Account for CSE minimum lot sizes and transaction costs
- Suggest a "core and explore" approach: 60% in stable blue-chips, 40% in growth opportunities

WHEN ASKED ABOUT MARKET EVENTS:
- Explain the event in simple terms first
- Then trace the impact chain to Sri Lankan stocks
- Identify which sectors are most affected (positively AND negatively)
- Give historical context if similar events happened before

WHEN ASKED ABOUT ISLAMIC FINANCE:
- Stock investing in Shariah-compliant companies is halal
- Explain the screening methodology simply
- Discuss purification and how to calculate it
- Reference SEC Sri Lanka's accredited Shariah scholars and methodology
- Making informed investment decisions based on analysis is encouraged (ijtihad/due diligence)
- What's prohibited: maysir (gambling), gharar (excessive speculation), riba (interest)

TONE: Professional but accessible. Imagine explaining to a smart friend who is new to investing. Use analogies from everyday Sri Lankan life when helpful.

Always end substantive analyses with: "This is educational analysis, not investment advice. Please do your own research and consider consulting a registered investment advisor."`,

  // ═══════════════════════════════════════════════════════════
  // PROMPT 4: Signal Generator
  // Conservative, Shariah-first, small-capital aware
  // ═══════════════════════════════════════════════════════════
  signalGenerator: `You are a quantitative analyst generating trading signals for a Shariah-conscious investor with limited capital (LKR 10,000).

Given the provided market data (stock prices, volumes, sector performance, macro indicators, and news), generate 5-10 trading signals.

SIGNAL CRITERIA:
1. ONLY Shariah-compliant stocks (COMPLIANT status only, never PENDING or NON_COMPLIANT)
2. Must have adequate liquidity (average daily volume > 5,000 shares)
3. Stock price must be affordable (consider the investor can only buy a few shares)
4. Diversified across at least 3 different sectors
5. Each signal must have clear, data-backed reasoning

FOR EACH SIGNAL, PROVIDE:
- Symbol and company name
- Direction: BUY_CONSIDERATION / HOLD / CAUTION (never use "BUY" or "SELL" directly)
- Current price and recent trend
- Reasoning: 2-3 sentences explaining WHY based on specific data points
- Risk level: LOW / MEDIUM / HIGH
- Confidence: percentage (0-100%)
- Key risk: the single biggest thing that could go wrong
- Suggested allocation: what percentage of a LKR 10,000 portfolio might be appropriate

SIGNAL TYPES TO LOOK FOR:
- Oversold bounce: stocks that dropped significantly but fundamentals are intact
- Momentum continuation: stocks in uptrend with increasing volume
- Value opportunity: stocks trading below sector average P/E with good fundamentals
- Dividend play: stocks approaching ex-dividend date with attractive yield
- Sector rotation: sectors gaining strength as money rotates from weaker sectors

IMPORTANT:
- Frame all signals as "considerations" and "analysis points", never as recommendations
- Always include at least 2 CAUTION signals (stocks to be careful about)
- Consider transaction costs: 1.12% per trade means small trades lose more to fees
- With LKR 10,000, the investor can realistically hold 3-5 positions
- Rank signals by confidence level

End with: "These signals are generated from quantitative analysis for educational purposes. They are not investment recommendations. Always verify with your own research."`,

  // ═══════════════════════════════════════════════════════════
  // PROMPT 5: News Impact Analyzer  
  // Connects news events to stock market implications
  // ═══════════════════════════════════════════════════════════
  newsAnalysis: `You are a news-to-market impact analyst specializing in how current events affect the Colombo Stock Exchange.

Given a set of recent news headlines and summaries, analyze each for its potential impact on Sri Lankan stocks.

FOR EACH NEWS ITEM:
1. **Event Summary**: What happened in 1-2 sentences
2. **Impact Chain**: Trace the logical chain from this event to CSE stocks
   Example: "Fuel price hike of Rs.24/litre → Higher transport costs → Increased CCPI inflation → CBSL may pause rate cuts → Banking stocks face headwinds, transport/logistics costs rise, consumer spending may decline"
3. **Sectors Affected**:
   - POSITIVE impact on: [list sectors with brief explanation]
   - NEGATIVE impact on: [list sectors with brief explanation]
   - NEUTRAL: [sectors unlikely to be affected]
4. **Magnitude**: Minor / Moderate / Significant / Major
5. **Timeframe**: Immediate (today-this week) / Short-term (1-4 weeks) / Medium-term (1-6 months)
6. **Specific Stocks to Watch**: Name 2-3 stocks most directly affected (Shariah-compliant preferred)

COMMON SRI LANKA NEWS-TO-MARKET CHAINS:
- Fuel price hike → inflation → rate expectations → bank/finance stocks
- LKR depreciation → import costs up → export revenue up in LKR terms
- IMF review positive → sovereign credit improvement → foreign investment inflows
- Tourism numbers up → hotel/leisure sector → consumer spending
- Tea auction prices up → plantation stocks
- Middle East tension → remittance risk + oil prices → broad market pressure
- Government policy change → sector-specific impact
- CBSL rate decision → immediate banking sector impact → broader market

Always consider BOTH positive and negative angles — every event creates winners and losers.`
};
```

Also update the mock-generator.ts to use these prompts when generating template responses, incorporating the same analytical framework.

---

### TASK 2: News Intelligence Engine

Build a comprehensive news fetching and analysis system.

#### Backend: News Module

Create `src/backend/src/modules/news-intelligence/`

```typescript
// news-intelligence.service.ts
//
// Fetches news from multiple sources and stores for AI analysis

// SOURCE 1: RSS Feeds (free, no API key needed)
// Sri Lankan News:
// - Daily FT: https://www.ft.lk/rss/1 (business/financial news)
// - Colombo Page: https://www.colombopage.com/archive_26A/rss.xml
// - Economy Next: https://economynext.com/feed/
// - Lanka Business Online: https://www.lankabusinessonline.com/feed/
//
// Global Financial News:
// - Reuters Business: https://feeds.reuters.com/reuters/businessNews
// - CNBC: https://www.cnbc.com/id/100003114/device/rss/rss.html
// - Bloomberg (via Google News): use Google News RSS for "Sri Lanka economy" and "oil prices"
//
// Install RSS parser: npm install rss-parser

// SOURCE 2: Google News Search (no API key needed)
// Search queries:
// - "Sri Lanka stock market"
// - "Colombo Stock Exchange"  
// - "CBSL interest rate"
// - "Sri Lanka economy"
// - "oil prices Asia"
// - "Iran Israel conflict" (or current geopolitical topics)
// Use: https://news.google.com/rss/search?q=QUERY&hl=en-LK&gl=LK&ceid=LK:en
```

Database entity: `news_items`
```typescript
{
  id: number;
  title: string;
  summary: string;              // first 500 chars of content
  source: string;               // 'DAILY_FT' | 'ECONOMY_NEXT' | 'REUTERS' | 'CNBC' | 'GOOGLE_NEWS'
  category: string;             // 'SRI_LANKA_MARKET' | 'SRI_LANKA_ECONOMY' | 'GLOBAL_MARKETS' | 'GEOPOLITICAL' | 'COMMODITIES'
  url: string;
  publishedAt: Date;
  
  // AI Analysis (populated when AI processes the news)
  impactAssessment: string;     // AI-generated impact analysis
  affectedSectors: string[];    // sectors affected
  impactMagnitude: string;      // 'MINOR' | 'MODERATE' | 'SIGNIFICANT' | 'MAJOR'
  sentiment: string;            // 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' for SL market
  
  isProcessed: boolean;         // has AI analyzed this?
  createdAt: Date;
}
```

#### Cron Schedule:
- Fetch Sri Lankan news: every 30 minutes during market hours, every 2 hours off-market
- Fetch global news: every hour
- AI news analysis: runs after each fetch batch (in mock mode, use template analysis)

#### API Endpoints:
- `GET /api/news` — latest news with filters (source, category, date)
- `GET /api/news/market-relevant` — news flagged as market-relevant
- `GET /api/news/for-stock/:symbol` — news relevant to a specific stock/sector
- `GET /api/news/impact-summary` — today's news with impact assessments

#### Frontend: News Intelligence Section

Add to dashboard (prominent placement):
```
┌──────────────────────────────────────────────────────┐
│  📰 Market-Moving News                               │
│                                                       │
│  🔴 MAJOR | 11:04 PM — Fuel Price Hike: Petrol      │
│  Up Rs.24, Diesel Rs.22 from Midnight                │
│  Impact: Transport ▼, Manufacturing ▼, Consumer ▼   │
│  Sectors: Energy ▲ (if power generation stocks)      │
│                                                       │
│  🟡 MODERATE | 9:00 AM — Iran Ready for Long War,   │
│  Senior Official Warns                                │
│  Impact: Oil ▲ → Import costs ▲ → LKR pressure     │
│  Sectors: All sectors face headwinds                  │
│                                                       │
│  🟢 MINOR | Yesterday — CBSL Holds Rates Steady     │
│  Impact: Banking sector neutral, rate cut hopes      │
│  delayed                                              │
│                                                       │
│  [View All News →]                                    │
└──────────────────────────────────────────────────────┘
```

Also create `/news` page:
- Full news feed with all sources
- Filter by: category, source, impact level, date
- Click to expand: AI impact analysis
- "How does this affect my portfolio?" link that goes to AI chat pre-filled with the news headline
- Search functionality

---

### TASK 3: Adjusted Safety Parameters & Portfolio Strategy

Update the safety rails for a LKR 10,000 starting capital:

```typescript
// Update safety-rails.ts (or wherever budget limits are defined)

export const INVESTOR_PROFILE = {
  startingCapital: 10000,              // LKR 10,000
  maxSingleOrderLKR: 3000,            // Max LKR 3,000 per order (30% of capital)
  maxDailyBuyLKR: 5000,               // Max LKR 5,000 buying per day
  targetPositions: 4,                   // Aim for 3-5 positions
  maxAllocationPerStock: 30,           // Max 30% in any one stock
  minCashReserve: 20,                  // Keep 20% cash
  transactionCostPct: 1.12,           // CSE fixed transaction cost
  
  // Diversification targets
  minSectors: 3,                       // Spread across at least 3 sectors
  maxSameScector: 2,                   // Max 2 stocks from same sector
  
  // With LKR 10,000 and 1.12% fees:
  // - A LKR 2,000 trade costs LKR 22.40 in fees (1.12%)
  // - A LKR 3,000 trade costs LKR 33.60 in fees
  // - Need stock to rise 2.24% just to break even (buy + sell fees)
  // - This means: prefer fewer, slightly larger positions over many tiny ones
};
```

Update the AI signal generator to consider these constraints. When generating signals, the AI should:
- Calculate how many shares the user can actually afford
- Factor in the 1.12% transaction cost (need 2.24% gain to break even on a round trip)
- Suggest position sizes that make sense for LKR 10,000
- Prioritize quality over quantity — better 3 well-researched positions than 5 random ones

---

### TASK 4: Data Export & Reporting

#### Backend:
1. `GET /api/portfolio/export/csv` — portfolio as CSV
2. `GET /api/portfolio/export/json` — portfolio as JSON
3. `GET /api/shariah/report` — Shariah compliance report with purification amounts
4. `GET /api/orders/export/csv` — trade history as CSV (when orders exist)

#### Frontend:
- "Export CSV" button on Portfolio page
- "Download Shariah Report" button on Shariah page
- Both buttons should trigger file download

---

### TASK 5: Backtesting Framework

Build the backtesting system as described in the original prompt (keeping that spec as-is since it was good):

Backend: `src/backend/src/modules/backtesting/`

```typescript
interface BacktestConfig {
  strategy: 'RSI_OVERSOLD' | 'SMA_CROSSOVER' | 'VALUE_SCREEN' | 'CUSTOM';
  startDate: string;
  endDate: string;
  startingCapital: number;        // default: 10000
  shariahOnly: boolean;           // default: true
  transactionCostPct: number;     // default: 1.12
  
  rsiOversoldThreshold?: number;
  rsiOverboughtThreshold?: number;
  smaPeriodShort?: number;
  smaPeriodLong?: number;
}

interface BacktestResult {
  totalReturn: number;
  totalReturnPct: number;
  aspiReturnPct: number;
  alpha: number;
  trades: BacktestTrade[];
  winRate: number;
  maxDrawdown: number;
  sharpeRatio: number;
  totalFeesPaid: number;          // important for small portfolios
}
```

Frontend: `/backtest` page with strategy selector, parameters, results chart, and trade list.

---

### TASK 6: Dashboard Visual Polish — Professional Trading Grade

Make the dashboard look like a Bloomberg terminal meets modern fintech:

1. **Dashboard Layout Restructure:**
   ```
   ┌─────────────────────────────────────────────────┐
   │ HEADER: ASPI ticker | S&P SL20 | Market Status  │
   ├─────────────────────────────────────────────────┤
   │ ROW 1: Market Index Cards (ASPI + S&P SL20)     │
   │        with mini sparkline + key stats           │
   ├─────────────────────────────────────────────────┤
   │ ROW 2: AI Daily Brief (collapsible)              │
   ├─────────────────────────────────────────────────┤
   │ ROW 3: News Intelligence (top 3 market-moving)   │
   ├──────────────────────┬──────────────────────────┤
   │ ROW 4a: My Watchlist  │ ROW 4b: My Portfolio     │
   │ (quick glance)        │ Summary (P&L, value)     │
   ├──────────────────────┴──────────────────────────┤
   │ ROW 5: Macro Indicators (SL + Global in one row) │
   ├─────────────────────────────────────────────────┤
   │ ROW 6: Gainers | Losers | Most Active (tabs)    │
   ├─────────────────────────────────────────────────┤
   │ ROW 7: Sector Heatmap                            │
   └─────────────────────────────────────────────────┘
   ```

2. **Color System (consistent throughout):**
   - Positive/Gain: `#22c55e` (green-500)
   - Negative/Loss: `#ef4444` (red-500)
   - Neutral: `#6b7280` (gray-500)
   - Shariah Compliant: `#22c55e` (green)
   - Non-Compliant: `#ef4444` (red)
   - Pending Review: `#eab308` (yellow-500)
   - AI Mock Mode: `#eab308` (yellow badge)
   - AI Live Mode: `#22c55e` (green badge)

3. **Stock Detail Page — Make it the best page:**
   - Hero section: Stock name, price, change (large, bold)
   - Full-width TradingView chart with all indicators
   - Side panel: Key metrics grid (P/E, MCap, Beta, Volume, Shariah)
   - AI Analysis section with professional formatting
   - Related news for this stock
   - Sector peers comparison (mini table)
   - "Add to Watchlist" and "Add to Portfolio" buttons

4. **Loading States:**
   - Skeleton loaders that match the card shapes
   - Pulsing animation on loading elements
   - "Market is closed — showing last available data" banner when outside trading hours

5. **Data Freshness Indicators:**
   - Show "Last updated: X seconds ago" on real-time data
   - Green dot = live data flowing
   - Yellow dot = data is cached (market closed)
   - Red dot = data fetch error

---

### TASK 7: Navigation Final + Commit

```
Navigation (final structure):

TOP NAV (always visible):
  Dashboard (/)
  Stocks (/stocks)
  Portfolio (/portfolio)
  Signals (/signals)

ANALYSIS (dropdown):
  Sectors (/sectors)
  Compare (/compare)  
  Shariah (/shariah)
  Backtest (/backtest)
  Performance (/performance)

INTELLIGENCE (dropdown):
  Strategy Chat (/chat)
  News (/news)
  Announcements (/announcements)
  Dividends (/dividends)

TOOLS (dropdown):
  Alerts (/alerts)
  Admin (/admin/financials)

Right side: Alert bell | Market status | ASPI ticker
```

Final commit and push:
```bash
git add -A
git commit -m "Priority 4 (revised): Elite AI prompts, news intelligence, exports, backtesting, visual polish"
git push
```

---

### CODING STANDARDS
- Install rss-parser: `npm install rss-parser` (in backend)
- All external news fetches: try/catch with graceful fallback
- Rate limit RSS fetches (max 1 request per source per 30 min)
- News items should be deduplicated by URL
- All new pages need loading states and error handling
- Keep dark theme consistent
- Mobile responsive
- Commit after each major task
