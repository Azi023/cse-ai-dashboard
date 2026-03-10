## Beginner Mode: Simple Dashboard + Monthly KPIs + Plain Language

The current dashboard is built for experienced traders. We need a "Simple Mode" 
that makes everything understandable for a complete beginner who is investing 
LKR 10,000/month as a long-term strategy.

This is a NEW session — the previous context may not be available. 
Read /docs/cse-dashboard-blueprint-v2.md and /docs/remaining-work-tracker.md 
for project context.

The project is at ~/workspace/cse-ai-dashboard with NestJS backend and Next.js frontend.

---

### TASK 1: Monthly Investment Tracker & KPIs

Create a "My Journey" page at `/journey` — this is the beginner's HOME page.

#### Backend: Investment Journey Module

Create `src/backend/src/modules/journey/`

Database entity: `monthly_deposits`
```typescript
{
  id: number;
  month: string;              // '2026-03' 
  depositAmount: number;      // LKR deposited this month (e.g., 10000)
  depositDate: Date;
  portfolioValueAtDeposit: number;  // snapshot of portfolio when deposit was made
  cumulativeDeposited: number;      // total deposited so far across all months
  notes: string;
  createdAt: Date;
}
```

API Endpoints:
- `POST /api/journey/deposit` — record a monthly deposit
- `GET /api/journey` — get full investment journey data
- `GET /api/journey/kpis` — calculated KPIs

#### KPIs to Calculate and Display:

```typescript
interface InvestmentKPIs {
  // The Big Numbers (what beginners care about most)
  totalDeposited: number;           // "You've invested LKR 30,000 so far"
  currentPortfolioValue: number;    // "Your portfolio is now worth LKR 32,450"
  totalProfitLoss: number;          // "You've made LKR 2,450"
  totalProfitLossPct: number;       // "That's +8.17% return"
  
  // Monthly Progress
  thisMonthReturn: number;          // "This month: +LKR 800 (+2.5%)"
  bestMonth: { month: string; returnPct: number };   // "Best month: April +5.2%"
  worstMonth: { month: string; returnPct: number };  // "Worst month: March -1.8%"
  
  // Streak & Consistency
  monthsInvested: number;           // "You've been investing for 3 months"
  positiveMonths: number;           // "2 out of 3 months were profitable"
  consecutiveDeposits: number;      // "You've deposited 3 months in a row!"
  
  // vs Benchmark
  portfolioReturnPct: number;       // Your total return %
  aspiReturnSamePeriod: number;     // ASPI return over same period
  beatingMarket: boolean;           // Are you outperforming?
  
  // Goals
  goalAmount: number;               // User-set goal (e.g., LKR 100,000)
  progressToGoal: number;           // Percentage towards goal
  estimatedMonthsToGoal: number;    // At current rate, when will you reach it?
  
  // Shariah Health
  shariahCompliantPct: number;      // "95% of your portfolio is Shariah compliant"
  totalPurificationDue: number;     // "LKR 45 purification due this quarter"
  
  // Dividend Income
  totalDividendsReceived: number;   // "You've earned LKR 350 in dividends"
}
```

#### Frontend: My Journey Page (`/journey`)

Design this as the FIRST page a beginner sees. No jargon. No candlesticks. Just clear, motivating numbers.

```
┌─────────────────────────────────────────────────────┐
│  🌟 Your Investment Journey                          │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │  You've invested for 3 months               │    │
│  │                                              │    │
│  │  Total Deposited    LKR 30,000              │    │
│  │  Portfolio Value    LKR 32,450  ✨           │    │
│  │  Your Profit        +LKR 2,450 (+8.17%)     │    │
│  │                                              │    │
│  │  ██████████████████░░░░░  32% to your goal  │    │
│  │  Goal: LKR 100,000                          │    │
│  │  At this rate: ~8 more months               │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  📅 Monthly Progress                                 │
│  ┌────────┬──────────┬──────────┬──────────┐        │
│  │ Month  │ Deposited│ Value    │ Return   │        │
│  ├────────┼──────────┼──────────┼──────────┤        │
│  │ Mar 26 │ 10,000   │ 10,250   │ +2.5% 🟢│        │
│  │ Apr 26 │ 10,000   │ 21,300   │ +4.8% 🟢│        │
│  │ May 26 │ 10,000   │ 32,450   │ +3.2% 🟢│        │
│  └────────┴──────────┴──────────┴──────────┘        │
│                                                      │
│  📊 You vs The Market                                │
│  Your return: +8.17%                                 │
│  Market (ASPI) return: +5.3%                        │
│  You're beating the market by 2.87%! 🎉             │
│                                                      │
│  🕌 Shariah Health                                   │
│  95% of your portfolio is Shariah compliant ✅       │
│  Purification due: LKR 45 (donate to charity)       │
│                                                      │
│  💡 Tip of the Month                                 │
│  "Markets dropped 3.5% yesterday. This is normal!   │
│   In the last 10 years, the CSE has dropped 3%+     │
│   in a single day 47 times — and recovered every    │
│   time. Stay patient, keep investing monthly."       │
│                                                      │
│  [Record This Month's Deposit] [Set a New Goal]     │
└─────────────────────────────────────────────────────┘
```

**Goal Setting Feature:**
- User can set a target: "I want to reach LKR 100,000"
- System calculates estimated months to reach it
- Progress bar shows how close they are
- Milestone celebrations: "You've passed LKR 25,000! 🎉"

**Monthly Deposit Recording:**
- Simple form: "I deposited LKR [amount] on [date]"
- Can adjust amount (some months might be more/less)
- Track deposit streak (gamification: "3 months in a row!")

---

### TASK 2: Plain Language Mode for Entire Dashboard

Add a toggle in the header: "Simple Mode" / "Pro Mode"

When Simple Mode is ON, replace ALL technical jargon with plain language:

#### Replacements Map:

```typescript
const SIMPLE_LANGUAGE = {
  // Market Terms
  'ASPI': 'Market Index (overall market health)',
  'S&P SL20': 'Top 20 Companies Index',
  'Market Cap': 'Company Size',
  'Volume': 'Number of shares traded today',
  'Turnover': 'Total money traded today',
  'P/E Ratio': 'Price vs Earnings (lower = cheaper)',
  'Beta': 'How much this stock moves vs the market',
  'RSI': 'Is it overbought or oversold?',
  'SMA': 'Average price over time',
  'Bollinger Bands': 'Price range (normal vs extreme)',
  'MACD': 'Momentum indicator (trending up or down?)',
  
  // Price Action
  'Bullish': '📈 Trending Up',
  'Bearish': '📉 Trending Down',  
  'Neutral': '➡️ Moving Sideways',
  'Support level': 'Price floor (tends to stop falling here)',
  'Resistance level': 'Price ceiling (tends to stop rising here)',
  'Overbought': 'Price might be too high — could drop back',
  'Oversold': 'Price might be too low — could bounce back',
  'Breakout': 'Price broke through a ceiling — could keep going up',
  'Breakdown': 'Price fell through a floor — could keep going down',
  
  // Shariah
  'Shariah Compliant': '✅ Halal to invest',
  'Non-Compliant': '❌ Not halal (interest/alcohol/tobacco etc.)',
  'Pending Review': '⏳ Waiting for financial data to verify',
  'Purification': 'Small charity donation to cleanse minor non-halal income',
  
  // Portfolio
  'Unrealized P&L': 'Profit/loss if you sold today',
  'Realized P&L': 'Actual profit/loss from completed sales',
  'Allocation': 'How much of your money is in this stock',
  'Diversification': 'Spreading money across different companies (safer)',
  'Dividend': 'Cash payment the company gives you for holding their shares',
  'Dividend Yield': 'How much cash you get per year as % of price',
  
  // Signals
  'HIGH Confidence': '🟢 Strong evidence — worth considering',
  'MEDIUM Confidence': '🟡 Mixed signals — research more',
  'LOW Confidence': '🔴 Weak evidence — be cautious',
};
```

#### Implementation:
- Store preference in localStorage: `simpleMode: true/false`
- Default: Simple Mode ON for new users
- Toggle in header (switch/button)
- When Simple Mode is ON:
  - Replace technical terms with plain language in tables, cards, analysis
  - Hide advanced chart indicators (RSI panel, Bollinger Bands) — show only price line chart
  - Show tooltips on every metric: hover/tap to see "What does this mean?"
  - AI chat responses should use simpler language (add to system prompt context)

#### Tooltips on Every Number:
When Simple Mode is ON, every metric should have a "?" icon that shows a tooltip:

```
Portfolio Value: LKR 32,450 ⓘ
  ↳ "This is what your shares are worth right now.
     If you sold everything today, you'd get roughly
     this amount (minus LKR ~364 in broker fees)."

Change: -3.5% ⓘ  
  ↳ "The market dropped 3.5% today. This means if
     your portfolio was worth LKR 10,000 yesterday,
     it's about LKR 9,650 today. This is NORMAL —
     markets go up and down daily. What matters is
     the long-term trend over months."
```

---

### TASK 3: Beginner Education Widgets

Add small educational cards throughout the dashboard:

#### "Did You Know?" Widget (rotates daily):
```
💡 Did You Know?
"If you invested LKR 10,000 in the CSE market index 
10 years ago, it would be worth approximately 
LKR 35,000 today — a 250% return. Patience pays."

[Next Tip →]
```

Tips database (store in a JSON file, rotate one per day):
```json
[
  "The CSE has ~300 listed companies. You don't need to know all of them — focus on understanding 10-15 well.",
  "Warren Buffett's #1 rule: Never lose money. His #2 rule: Never forget rule #1. This is why we use stop-losses.",
  "Diversification means not putting all eggs in one basket. Even LKR 10,000 can be split across 2-3 stocks.",
  "A stock going down 3% in a day is normal. Going down 3% every day for weeks is a warning sign.",
  "Dividends are like rent from your stocks — the company pays you just for holding shares.",
  "The best time to buy is when everyone else is scared. Yesterday's -3.5% drop might be tomorrow's opportunity.",
  "Shariah-compliant investing isn't just for Muslims — it avoids high-debt, speculative companies that are risky for everyone.",
  "Transaction costs on CSE are 1.12% per trade. That means your stock needs to go up 2.24% before you break even.",
  "You don't need to check stock prices every hour. Professional investors review weekly or monthly.",
  "Rupee Cost Averaging means buying the same amount each month. When prices drop, you get MORE shares for the same money.",
  "The CSE market is open only 5 hours a day (9:30 AM - 2:30 PM). No need to wake up at dawn.",
  "A P/E ratio of 10 means you're paying 10 years of earnings for the stock. Lower is generally cheaper.",
  "Blue chip stocks (like JKH, COMB) are large, stable companies — good for beginners.",
  "Never invest money you might need in the next 6 months. Stocks are for money you can leave alone.",
  "If a stock tip sounds too good to be true, it probably is. Always do your own research."
]
```

#### Market Status Explainer:
When the market has a significant move (>2% either direction), show a brief explainer:

```
📢 Market Alert — Why is the market down today?

The ASPI dropped 3.5% today. Here's what's happening in 
simple terms:

• Fuel prices went up Rs.24/litre last night
• This means everything that moves by truck gets more expensive  
• Companies' costs go up → profits go down → stock prices fall
• This is a SHORT-TERM reaction. The market usually 
  adjusts within days/weeks.

What should you do? 
→ Don't panic sell
→ This might actually be a good time to buy (cheaper prices)
→ Your monthly LKR 10,000 buys MORE shares when prices are low

[Read Full AI Analysis →]
```

---

### TASK 4: Portfolio Health Score (Beginner-Friendly)

Instead of showing P/E ratios and beta values, give the portfolio a simple HEALTH SCORE.

```typescript
interface PortfolioHealthScore {
  overallScore: number;           // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  
  // Component scores (each 0-100)
  diversification: {
    score: number;
    label: string;  // "Good — you have stocks in 3 different sectors"
                    // "Needs work — 80% of your money is in one stock"
  };
  
  shariahCompliance: {
    score: number;
    label: string;  // "Excellent — 100% Shariah compliant"
  };
  
  riskLevel: {
    score: number;
    label: string;  // "Moderate — mix of safe and growth stocks"
  };
  
  costEfficiency: {
    score: number;
    label: string;  // "Good — your position sizes are big enough to minimize fees"
                    // "Warning — small positions are losing money to broker fees"
  };
  
  consistency: {
    score: number;
    label: string;  // "Great — you've invested 3 months in a row!"
  };
}
```

Display as a simple dashboard card:

```
🏥 Portfolio Health: B+ (78/100)

  Diversification    ████████░░  Good (3 sectors)
  Shariah Compliance █████████░  95% halal
  Risk Level         ██████░░░░  Moderate  
  Cost Efficiency    ███████░░░  OK (watch small positions)
  Consistency        ██████████  3-month deposit streak! 

💡 To improve: Add one more stock from the Manufacturing 
   or Healthcare sector to boost your diversification score.
```

---

### TASK 5: Simplified Stock Cards

When Simple Mode is ON, replace the complex stock detail page with a simpler card:

```
┌─────────────────────────────────────────────┐
│  John Keells Holdings (JKH)                  │
│  LKR 205.50  📉 Down 4.3% today             │
│                                              │
│  ✅ Halal to invest                          │
│  🏢 Diversified conglomerate (hotels,        │
│     transport, food, property)               │
│                                              │
│  Is it expensive? Fairly priced              │
│  Is it risky? Medium risk                    │
│  Does it pay dividends? Yes, ~3% per year    │
│  How easy to sell? Very easy (high trading)   │
│                                              │
│  📊 Simple Price Chart (line, not candles)    │
│  [1 Month] [3 Months] [1 Year]              │
│  ════════════╗                               │
│              ╚══════════                     │
│                                              │
│  AI Says: "JKH is Sri Lanka's largest        │
│  conglomerate. Today's drop is part of a     │
│  broad market selloff, not specific to JKH.  │
│  It's been a reliable long-term performer."  │
│                                              │
│  [Add to Watchlist] [Add to Portfolio]       │
└─────────────────────────────────────────────┘
```

---

### TASK 6: Make Journey the Default Landing Page

- When Simple Mode is ON: `/journey` is the default page (redirect from `/`)
- When Pro Mode is ON: `/` shows the full market dashboard as before
- Add "Switch to Pro Mode" link on Journey page
- Add "Switch to Simple Mode" link on Dashboard page
- Remember preference in localStorage

### TASK 7: Navigation Update + Commit

Add to navigation:
- "My Journey" link (prominent, first position in Simple Mode)
- Simple/Pro Mode toggle in header

```bash
git add -A
git commit -m "Beginner Mode: Journey page, KPIs, Simple Mode toggle, plain language, health score, education widgets"
git push
```

---

### CODING STANDARDS
- All Simple Mode text should be in a separate constants file (easy to update/translate later)
- Tooltips should work on both hover (desktop) and tap (mobile)
- Journey page should be the most visually appealing page — it's motivational
- Use emojis appropriately (they make the Simple Mode feel friendly)
- Progress bars and milestone celebrations add gamification
- Keep all Pro Mode functionality intact — Simple Mode is an ADDITION, not a replacement
