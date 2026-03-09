## Phase 2: AI Intelligence Layer (Mock Mode) + Dashboard UI Polish

We're building the full AI analysis architecture but using mock/simulated responses until the Anthropic API key is available. When the key is added to .env, everything switches to real AI — zero code changes needed beyond the config.

Please read /docs/cse-dashboard-blueprint-v2.md for the full 12-factor analysis framework and dashboard wireframes.

---

### TASK 1: AI Service Architecture (Backend)

Create a modular AI service that can switch between mock and real mode.

#### File: `src/backend/src/modules/ai-engine/ai-engine.service.ts`

```typescript
// Core AI service
// - If ANTHROPIC_API_KEY exists in env → use real Claude API
// - If not → use mock responses (realistic simulated analysis)
// 
// Install: npm install @anthropic-ai/sdk
// (install the package even if key isn't set yet)

interface StockAnalysis {
  symbol: string;
  name: string;
  currentPrice: number;
  fundamentalScore: number;       // 1-10
  technicalSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  shariahStatus: string;
  analysis: string;               // 2-3 paragraph AI analysis
  riskFactors: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  generatedAt: Date;
}

interface DailyBrief {
  date: Date;
  marketSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'CAUTIOUS';
  summary: string;                // 3-4 paragraph market overview
  topOpportunities: string[];
  keyRisks: string[];
  sectorOutlook: { sector: string; outlook: string }[];
  generatedAt: Date;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}
```

The mock responses should be REALISTIC — use actual CSE data from the database to generate plausible analysis. For example, if ASPI is down 3%, the mock daily brief should mention the downturn with realistic commentary about Sri Lankan market conditions.

#### Mock Response Generator Logic:
- Pull real market data (ASPI value, change%, top gainers/losers, sector performance) from Redis/PostgreSQL
- Generate template-based responses that incorporate this real data
- Make it feel like a real analysis, not obviously fake
- Include actual stock symbols, real prices, real percentage changes

Example mock daily brief template:
```
"Market Update — {date}

The Colombo Stock Exchange saw {positive/negative} movement today with the 
ASPI {rising/falling} {change}% to {value} points. Trading volume reached 
{volume} shares with a turnover of LKR {turnover}.

{If negative: The broad-based selling pressure was evident across sectors, 
with {worst_sector} leading declines at {sector_change}%. Only {gainer_count} 
stocks advanced against {loser_count} decliners, indicating weak market breadth.}

{If positive: Buying interest was broad-based with {best_sector} leading 
gains at {sector_change}%. {gainer_count} stocks advanced against 
{loser_count} decliners, suggesting healthy market participation.}

Top performers today included {top_gainer_1} (+{change}%) and 
{top_gainer_2} (+{change}%), while {top_loser_1} ({change}%) and 
{top_loser_2} ({change}%) faced selling pressure.

Key factors to watch: CBSL monetary policy direction, USD/LKR exchange 
rate movement, and foreign investor flow trends."
```

#### AI Engine Endpoints:
- `GET /api/ai/daily-brief` — Today's market brief (mock or real)
- `GET /api/ai/analyze/:symbol` — AI analysis for a specific stock
- `POST /api/ai/chat` — Send a message, get AI response (with conversation history)
- `GET /api/ai/signals` — Current trading signals with confidence levels
- `GET /api/ai/status` — Whether AI is in mock mode or live mode

#### AI Module Files:
- `ai-engine.module.ts`
- `ai-engine.service.ts` (main service with mock/real switching)
- `ai-engine.controller.ts` (REST endpoints)
- `mock-generator.ts` (realistic mock response generator using real market data)
- `prompts.ts` (system prompts for when real Claude API is used)

#### System Prompts File (`prompts.ts`):
Store these for when the real API is connected:

```typescript
export const SYSTEM_PROMPTS = {
  dailyBrief: `You are an expert financial analyst specializing in the Colombo Stock Exchange (CSE) and Sri Lankan capital markets. Generate a daily market brief based on the provided market data.

Your analysis should cover:
1. Market overview (ASPI, S&P SL20 performance)
2. Sector analysis (which sectors led/lagged)
3. Notable stock movements with possible explanations
4. Macro factors affecting the market (interest rates, USD/LKR, inflation)
5. Key risks and opportunities for the coming sessions

Important rules:
- Never recommend specific buy/sell actions
- Present analysis as educational/informational
- Reference specific data points (prices, percentages)
- Consider Sri Lanka-specific factors (CBSL policy, remittances, tourism, tea exports)
- Be concise but thorough — aim for 300-400 words
- If Shariah-compliant stocks are particularly affected, note this`,

  stockAnalysis: `You are an expert equity analyst covering the Colombo Stock Exchange. Analyze the given stock based on the provided data.

Structure your response as:
1. Company Overview (1 sentence)
2. Price Action & Technical Assessment  
3. Fundamental Assessment (P/E, debt levels, profitability)
4. Sector Context (how the sector is performing)
5. Shariah Compliance Status (if applicable)
6. Risk Factors (2-3 specific risks)
7. Overall Assessment with confidence level

Important rules:
- Never say "buy" or "sell" — use terms like "shows strength", "faces headwinds", "appears undervalued relative to peers"
- Always include disclaimers that this is analysis, not advice
- Reference specific numbers from the data provided
- Consider CSE-specific factors (low liquidity, thin trading)
- Confidence: HIGH (strong conviction), MEDIUM (mixed signals), LOW (insufficient data)`,

  chat: `You are an AI financial research assistant specializing in the Colombo Stock Exchange (CSE) and Sri Lankan markets. You help investors understand market dynamics, analyze stocks, and make informed decisions.

Key rules:
- Never recommend buying or selling specific stocks
- Always frame responses as educational/informational
- Reference real market data when available
- Consider Sri Lanka-specific factors: CBSL monetary policy, USD/LKR rate, inflation, remittances, tourism, tea/rubber exports, political stability
- For Shariah compliance questions, reference SEC Sri Lanka's screening methodology
- Be honest about limitations — CSE has ~300 stocks with varying liquidity
- If asked about geopolitical impacts, trace the chain: event → oil prices/remittances/tourism → LKR → company earnings → stock prices
- Keep responses conversational but substantive`
};
```

---

### TASK 2: AI Chat Interface (Frontend)

Create a beautiful chat interface at `/chat` (or `/strategy`):

```
Design specs:
- Full-height chat area with message bubbles
- User messages: right-aligned, primary color background
- AI messages: left-aligned, muted background, with markdown rendering
- Input bar at bottom: text input + send button
- "AI Mode: Mock" or "AI Mode: Live" indicator badge at top
- Suggested prompts shown when chat is empty:
  - "What's driving today's market movement?"
  - "Analyze JKH.N0000 for me"
  - "How do Iran-US tensions affect Sri Lankan stocks?"
  - "Which Shariah-compliant sectors look strongest?"
  - "Explain what P/E ratio means for a beginner"
- Message history persists during session (useState array)
- Loading indicator while waiting for response
- Auto-scroll to latest message
```

---

### TASK 3: Daily Brief Component (Frontend)

Add an AI Daily Brief card to the main dashboard page:

```
Design specs:
- Prominent card at the top of the dashboard (below ASPI/S&P SL20 cards)
- Title: "AI Market Brief — {today's date}"
- Badge: "Mock Mode" (yellow) or "Live AI" (green)  
- Content: The daily brief text with proper formatting
- Market sentiment indicator: colored badge (green=bullish, red=bearish, yellow=neutral)
- "Key Risks" and "Opportunities" as bullet points below the main text
- Refresh button to regenerate
- Collapsible/expandable (default: collapsed on mobile, expanded on desktop)
```

---

### TASK 4: Stock Detail Page Enhancement

Upgrade the existing stock detail page (`/stocks/[symbol]`) with:

```
Improvements:
1. Better chart:
   - TradingView Lightweight Charts with candlestick view
   - Volume bars below the price chart
   - Time period selector: 1D, 1W, 1M, 3M, 6M, 1Y
   - Moving average overlays (20-day, 50-day) if we have enough data
   
2. AI Analysis section:
   - "AI Intelligence Report" card below the chart
   - Shows the structured analysis (fundamentalScore, technicalSignal, etc.)
   - "Ask AI about this stock" button that opens the chat pre-filled with the stock symbol
   - Badge showing mock/live mode
   
3. Key metrics grid:
   - Price, Change, Change%, Volume, Turnover
   - Market Cap, Beta, 52W High, 52W Low (if available from API)
   - P/E Ratio placeholder (to be populated when financials are loaded)
   
4. Shariah compliance card:
   - Status badge (compliant/non-compliant/pending)
   - If non-compliant: reason displayed prominently
   - If compliant: purification ratio shown
   - If pending: "Awaiting financial data for Tier 2 screening"

5. Recent announcements for this stock:
   - Filter announcements by company name/symbol
   - Show date, type, description
```

---

### TASK 5: Dashboard UI Polish

Make the overall dashboard look professional and trading-grade:

```
1. Market Overview Cards (ASPI, S&P SL20):
   - Add mini sparkline charts inside the cards (last few hours of data)
   - Larger font for the index values
   - Red/green gradient backgrounds based on positive/negative
   - Add "52W High: X | 52W Low: X" below the index values if available

2. Gainers/Losers/Active tables:
   - Add company name column (not just symbol)
   - Add volume column
   - Clickable rows that navigate to /stocks/[symbol]
   - Row hover effect
   - Add Shariah compliance mini-badge (small green dot) next to compliant stocks

3. Sector Indices grid:
   - Color-code the entire card background (green gradient for positive, red for negative)
   - Sort by performance (worst to best or best to worst)
   - Make cards clickable (future: sector detail page)
   - Add a "heatmap" view toggle (grid of colored blocks, size by market cap)

4. Overall layout:
   - Max-width container (1400px) centered
   - Consistent spacing between sections
   - Section headers with subtle borders
   - Smooth transitions/animations on data refresh
   - Loading skeletons while data loads (not empty states)

5. Watchlist feature:
   - Add a "Watchlist" section on the dashboard (below AI brief, above gainers)
   - Star icon on any stock to add/remove from watchlist
   - Watchlist stored in localStorage (simple for now)
   - Shows: Symbol, Name, Price, Change%, Shariah badge
   - Quick-add: search box in the watchlist section
```

---

### TASK 6: Trading Signals Page (Frontend)

Create a `/signals` page showing AI-generated trading signals:

```
Design:
- Summary: "X Active Signals | AI Mode: Mock/Live"
- Signal cards, each showing:
  - Direction icon: 🟢 BUY / 🟡 HOLD / 🔴 SELL
  - Stock symbol and name
  - Current price
  - Signal reasoning (2-3 sentences)
  - Confidence: HIGH/MEDIUM/LOW with color
  - Shariah status badge
  - Generated timestamp
- Filter by: Direction (Buy/Hold/Sell), Confidence (High/Medium/Low), Shariah Only toggle
- Sort by: Confidence, Change%, Alphabetical

Mock signals: Generate 5-10 realistic signals based on actual market data
(e.g., stocks with biggest drops might show as "potential buy on dip" signals)
```

---

### TASK 7: Navigation Update

Add new pages to the navigation:

```
Navigation links (in order):
1. Dashboard (/)
2. Stocks (/stocks) 
3. Shariah (/shariah)
4. Portfolio (/portfolio)
5. Signals (/signals) — NEW
6. Strategy (/chat) — NEW (AI Chat)

Mobile menu: same order, with icons
```

---

### CODING STANDARDS
- TypeScript strict mode
- All new API endpoints need error handling
- Loading states + error states on all pages
- Responsive design (mobile-first)
- Keep dark theme consistent
- Use existing shadcn/ui components
- Install @anthropic-ai/sdk even though key isn't set yet (prepares for Phase 2 live mode)
- Commit after each task is working

### IMPORTANT
- The mock AI responses should use REAL market data from the database/Redis — not hardcoded text
- When ANTHROPIC_API_KEY is added to .env later, the service should automatically switch to live mode
- Show "Mock Mode" / "Live AI" badges throughout the UI so I know which mode I'm in
