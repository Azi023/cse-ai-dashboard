## Updated Beginner Mode: ATrad Portfolio Sync + Dynamic Content

This UPDATES the previous beginner mode prompt. Two key changes:
1. Automate portfolio tracking by reading data directly from ATrad (read-only)
2. Replace ALL static content with dynamic, real-time generated content

Read /docs/cse-dashboard-blueprint-v2.md for project context.
Project at ~/workspace/cse-ai-dashboard

---

### TASK 1: ATrad Portfolio Sync (Read-Only Automation)

Use Playwright to log into the ATrad web platform and READ portfolio data automatically. This does NOT place any orders — it only reads.

#### Setup

```bash
cd src/backend
npm install playwright
npx playwright install chromium
```

#### Credentials in .env (NEVER hardcode, NEVER commit)

Add to `src/backend/.env`:
```
# ATrad Credentials — stored locally only, never committed
ATRAD_USERNAME=
ATRAD_PASSWORD=
ATRAD_URL=https://trade.hnbstockbrokers.lk/atsweb/login
```

Add to `.env.example` (without actual values):
```
ATRAD_USERNAME=your_atrad_username
ATRAD_PASSWORD=your_atrad_password
ATRAD_URL=https://trade.hnbstockbrokers.lk/atsweb/login
```

Make sure `.gitignore` includes `.env` (it should already).

#### Backend: ATrad Sync Module

Create `src/backend/src/modules/atrad-sync/`

Files:
- `atrad-sync.module.ts`
- `atrad-sync.service.ts`
- `atrad-sync.controller.ts`
- `atrad-browser.ts` — the Playwright scraping logic

```typescript
// atrad-browser.ts
// 
// This module:
// 1. Opens a HEADLESS browser (no visible window)
// 2. Navigates to ATrad login page
// 3. Logs in with credentials from .env
// 4. Reads portfolio data (holdings, quantities, buy prices)
// 5. Reads account balance / buying power
// 6. Reads any pending orders
// 7. Closes the browser
// 8. Returns structured data
//
// CRITICAL SAFETY RULES:
// - NEVER clicks Buy, Sell, Confirm, or any order-related button
// - NEVER fills in any order form fields
// - ONLY reads/scrapes visible data from the page
// - If any element looks like an order form, DO NOT interact with it
// - Timeout after 60 seconds if anything goes wrong
// - Log every action for audit trail

import { chromium, Browser, Page } from 'playwright';

interface ATradPortfolio {
  holdings: ATradHolding[];
  buyingPower: number;
  accountValue: number;
  cashBalance: number;
  lastSynced: Date;
  syncSuccess: boolean;
  error?: string;
}

interface ATradHolding {
  symbol: string;
  companyName: string;
  quantity: number;
  avgPrice: number;        // average buy price
  currentPrice: number;
  marketValue: number;
  unrealizedPL: number;
  unrealizedPLPct: number;
}

export async function syncATradPortfolio(): Promise<ATradPortfolio> {
  const username = process.env.ATRAD_USERNAME;
  const password = process.env.ATRAD_PASSWORD;
  const url = process.env.ATRAD_URL || 'https://trade.hnbstockbrokers.lk/atsweb/login';
  
  if (!username || !password) {
    return {
      holdings: [],
      buyingPower: 0,
      accountValue: 0,
      cashBalance: 0,
      lastSynced: new Date(),
      syncSuccess: false,
      error: 'ATrad credentials not configured. Add ATRAD_USERNAME and ATRAD_PASSWORD to .env',
    };
  }
  
  let browser: Browser | null = null;
  
  try {
    console.log('[ATrad Sync] Starting portfolio sync...');
    
    browser = await chromium.launch({ 
      headless: true,     // No visible window
      timeout: 60000,     // 60 second timeout
    });
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });
    
    const page = await context.newPage();
    
    // Step 1: Navigate to login
    console.log('[ATrad Sync] Navigating to login page...');
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    
    // Step 2: Login
    // Based on ATrad web interface screenshots:
    // - Username field
    // - Password field  
    // - Login button
    // NOTE: The exact selectors need to be discovered from the actual page.
    // The explore-atrad.ts script from earlier can help identify these.
    // For now, use common patterns and adjust after testing.
    
    console.log('[ATrad Sync] Attempting login...');
    
    // Try common selector patterns for the login form
    const usernameSelectors = [
      'input[name="username"]', 
      'input[name="userId"]',
      'input[id="username"]',
      'input[type="text"]:first-of-type',
      '#username',
    ];
    
    const passwordSelectors = [
      'input[name="password"]',
      'input[type="password"]',
      '#password',
    ];
    
    const loginButtonSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Login")',
      'input[value="Login"]',
      '#loginButton',
    ];
    
    // Find and fill username
    for (const selector of usernameSelectors) {
      try {
        const el = await page.$(selector);
        if (el) {
          await el.fill(username);
          console.log(`[ATrad Sync] Username filled using selector: ${selector}`);
          break;
        }
      } catch { /* try next selector */ }
    }
    
    // Find and fill password
    for (const selector of passwordSelectors) {
      try {
        const el = await page.$(selector);
        if (el) {
          await el.fill(password);
          console.log(`[ATrad Sync] Password filled`);
          break;
        }
      } catch { /* try next selector */ }
    }
    
    // Click login
    for (const selector of loginButtonSelectors) {
      try {
        const el = await page.$(selector);
        if (el) {
          await el.click();
          console.log(`[ATrad Sync] Login button clicked`);
          break;
        }
      } catch { /* try next selector */ }
    }
    
    // Wait for post-login page
    await page.waitForTimeout(5000);
    console.log(`[ATrad Sync] Post-login URL: ${page.url()}`);
    
    // Step 3: Navigate to portfolio/holdings page
    // ATrad typically has: Watch, Market, Orders, Client, Chart, Analysis, Report menus
    // Portfolio data is usually under "Client" or the main market watch shows it
    // with the Portfolio filter set to the user's account
    
    // Try to find portfolio data on the current page first
    // The ATrad interface shows: Security, Company Name, Bid Qty, Bid Price, Ask Price, 
    // Ask Qty, Last, Last Qty, Change, % Change, High, Low, VWA, Volume, Turnover, Trades
    // And with Portfolio filter: it shows YOUR holdings
    
    // Take a screenshot for debugging (saved locally, never committed)
    await page.screenshot({ 
      path: 'data/atrad-sync/latest-sync-screenshot.png', 
      fullPage: true 
    });
    
    // Try to read the market watch table with portfolio filter
    // This is where we need to scrape the actual holdings
    // The selectors below are estimates — need to be refined after testing
    
    const holdings: ATradHolding[] = [];
    
    // Try to find portfolio/holdings table rows
    // ATrad shows a table with columns: Security, Company Name, etc.
    const rows = await page.$$('table tr, .market-watch-row, [class*="row"]');
    
    for (const row of rows) {
      try {
        const cells = await row.$$('td, [class*="cell"]');
        if (cells.length >= 6) {
          const symbol = await cells[0]?.textContent() || '';
          const companyName = await cells[1]?.textContent() || '';
          const lastPrice = parseFloat(await cells[4]?.textContent() || '0');
          
          // Only include if it looks like a valid stock row
          if (symbol && symbol.includes('.N')) {
            holdings.push({
              symbol: symbol.trim(),
              companyName: companyName.trim(),
              quantity: 0,  // Need to find the right column
              avgPrice: 0,
              currentPrice: lastPrice,
              marketValue: 0,
              unrealizedPL: 0,
              unrealizedPLPct: 0,
            });
          }
        }
      } catch { /* skip malformed rows */ }
    }
    
    // Try to read buying power / cash balance
    // Look for text containing "Buying Power", "Cash", "Balance"
    let buyingPower = 0;
    let cashBalance = 0;
    
    const pageText = await page.textContent('body') || '';
    
    // Extract buying power from page text
    const buyingPowerMatch = pageText.match(/Buying\s*Power\s*:?\s*([\d,]+\.?\d*)/i);
    if (buyingPowerMatch) {
      buyingPower = parseFloat(buyingPowerMatch[1].replace(/,/g, ''));
    }
    
    const cashMatch = pageText.match(/Cash\s*(?:In|Balance)?\s*:?\s*([\d,]+\.?\d*)/i);
    if (cashMatch) {
      cashBalance = parseFloat(cashMatch[1].replace(/,/g, ''));
    }
    
    console.log(`[ATrad Sync] Found ${holdings.length} holdings, Buying Power: ${buyingPower}`);
    
    await browser.close();
    
    return {
      holdings,
      buyingPower,
      accountValue: holdings.reduce((sum, h) => sum + h.marketValue, 0) + cashBalance,
      cashBalance,
      lastSynced: new Date(),
      syncSuccess: true,
    };
    
  } catch (error: any) {
    console.error(`[ATrad Sync] Error: ${error.message}`);
    if (browser) await browser.close();
    
    return {
      holdings: [],
      buyingPower: 0,
      accountValue: 0,
      cashBalance: 0,
      lastSynced: new Date(),
      syncSuccess: false,
      error: error.message,
    };
  }
}
```

#### ATrad Sync Service:

```typescript
// atrad-sync.service.ts
//
// Responsibilities:
// 1. Runs portfolio sync on schedule (every 15 minutes during market hours)
// 2. Compares ATrad data with our portfolio table
// 3. Auto-updates portfolio holdings if differences found
// 4. Tracks deposit changes (if buying power increased, user likely deposited)
// 5. Logs all sync activities

// Cron: Every 15 minutes during market hours (9:30 AM - 2:30 PM SLT, Mon-Fri)
// Also: One sync at 3:00 PM (after market close) for end-of-day snapshot

// Auto-deposit detection:
// If buyingPower today > buyingPower yesterday + any dividends received,
// the difference is likely a new deposit. Auto-record it.
```

#### API Endpoints:
- `POST /api/atrad/sync` — trigger manual sync now
- `GET /api/atrad/status` — last sync time, success/failure, holdings count
- `GET /api/atrad/holdings` — latest synced holdings from ATrad
- `POST /api/atrad/test` — test login without syncing (validates credentials work)

#### Frontend: ATrad Sync Status

Add to Portfolio page and Journey page:
```
🔄 ATrad Sync: Last synced 5 mins ago ✅
   Holdings: 3 stocks | Buying Power: LKR 4,500
   [Sync Now]

   ⚙️ ATrad Connection: Connected
   If not connected: [Configure ATrad Credentials]
```

ATrad Settings Page (`/settings/atrad`):
- Form to enter ATrad username (password stored securely in .env, not via UI)
- "Test Connection" button
- Sync frequency setting
- Last 10 sync logs (time, success/fail, holdings found)
- Instructions: "Your credentials are stored locally in .env and never sent anywhere"

#### Auto Portfolio Sync Logic:

When ATrad sync returns holdings data:
1. Compare with existing portfolio table
2. If ATrad shows a stock we don't have → auto-add to portfolio
3. If ATrad shows different quantity → update portfolio
4. If ATrad doesn't show a stock we have → mark as "sold" (or flag for review)
5. If buying power increased significantly → auto-detect as deposit, record in monthly_deposits

---

### TASK 2: Replace Static Tips with Dynamic AI-Generated Insights

Remove the static "Did You Know?" tips. Replace with dynamic, context-aware insights generated from REAL market data.

#### Dynamic Insight Generator:

```typescript
// Instead of pre-written tips, generate insights from actual data:

function generateDynamicInsight(marketData: any, portfolioData: any): string {
  // Based on what's actually happening:
  
  // If market dropped > 2% today:
  // "The market dropped 3.5% today. Your LKR 10,000 monthly investment now 
  //  buys 3.6% more shares than yesterday. Long-term investors see dips as 
  //  opportunities."
  
  // If portfolio has been growing for 3+ months:
  // "Your portfolio has grown for 3 consecutive months. Since you started,
  //  your total return is +8.2%, while the average savings account earns ~6%/year."
  
  // If a holding has hit a new high:
  // "JKH reached its highest price in 3 months today. Your position is now 
  //  up 12% from your buy price."
  
  // If dividend is approaching:
  // "EXPO.N0000 has an ex-dividend date next week. You'll receive approximately 
  //  LKR 45 in dividends on your 20 shares."
  
  // If portfolio is concentrated:
  // "80% of your portfolio is in one stock. Consider adding a stock from a 
  //  different sector to reduce risk."
  
  // If there's breaking news affecting holdings:
  // "Fuel prices went up Rs.24 tonight. This could affect transport and 
  //  manufacturing stocks in your portfolio."
  
  // Generate the MOST RELEVANT insight based on current conditions
  // Priority: breaking news > portfolio alerts > market insights > education
}
```

#### Implementation:
- Backend: `GET /api/insights/current` — returns the most relevant dynamic insight
- Refresh: generate new insight every time new data arrives (market update or news)
- Show on Journey page AND dashboard
- Each insight includes: text, relevance level (HIGH/MEDIUM), category, timestamp
- NEVER show the same insight twice in a row
- Make insights actionable: "Your portfolio has X happening → here's what this means"

---

### TASK 3: Auto-Updating Goals

Goals should update automatically based on actual portfolio performance:

```typescript
interface InvestmentGoal {
  id: number;
  targetAmount: number;          // e.g., LKR 100,000
  targetDate?: Date;             // optional: "by December 2026"
  
  // Auto-calculated:
  currentProgress: number;       // current portfolio value
  progressPercent: number;       // (currentValue / targetAmount) * 100
  estimatedCompletionDate: Date; // based on current growth rate + monthly deposits
  monthlyDepositNeeded: number;  // to hit target on time, deposit this much
  onTrack: boolean;              // are they on track to meet the goal?
  
  // Milestones (auto-generated):
  // Every 25% milestone gets a celebration
  milestones: {
    percent: number;
    reached: boolean;
    reachedDate?: Date;
  }[];
}
```

- Goal progress updates in REAL TIME as portfolio value changes
- When portfolio value crosses a milestone (25%, 50%, 75%, 100%), show a celebration card
- "Estimated completion" recalculates daily based on actual growth rate
- If falling behind: "To reach your goal by December, you'd need to increase monthly deposits to LKR 12,000"

---

### TASK 4: Dynamic Market Context Explainers

When significant market events happen, auto-generate a plain-language explainer instead of static tips.

#### Backend: Market Context Service

```typescript
// Triggers for auto-generated explainers:
// 1. ASPI moves > 2% in a day
// 2. A portfolio stock moves > 5%
// 3. Breaking news with HIGH impact
// 4. CBSL rate decision days
// 5. Monthly — "Your Month in Review" summary

interface MarketExplainer {
  id: number;
  trigger: string;          // what triggered this explainer
  headline: string;         // "Why is the market down today?"
  explanation: string;      // plain-language, 3-5 sentences
  whatItMeans: string;      // "What this means for you"
  actionSuggestion: string; // "Consider: ..."
  createdAt: Date;
  expiresAt: Date;          // auto-expire after 24-48 hours
}
```

#### Example auto-generated explainer (from real data):

When ASPI drops 3.5% AND news contains "fuel price hike":
```
📢 Why is the market down 3.5% today?

Last night, fuel prices were increased by Rs.24 per litre. 
This means:
• Transport costs go up for every business
• Manufacturing costs increase  
• Consumers have less money to spend
• Companies' profits could be lower → stock prices fell

What this means for your portfolio:
Your portfolio dropped about LKR 350 today. This is a 
NORMAL market reaction to bad news. In the past year, 
the market had 12 days with drops this big — and 
recovered within 2 weeks each time.

What to consider:
Your next monthly LKR 10,000 deposit actually buys 3.5% 
more shares than it would have yesterday. Long-term 
investors often benefit from buying during dips.
```

These are generated dynamically by combining:
- Real market data (ASPI change, sector performance)
- Real news (from news intelligence engine)
- Real portfolio data (your holdings, your P&L impact)

---

### TASK 5: Portfolio Sync UI Updates

Update the Portfolio page and Journey page to show ATrad sync status:

Portfolio page:
```
┌─────────────────────────────────────────────────┐
│  📊 My Portfolio                                 │
│                                                  │
│  🔄 Synced with ATrad: 5 min ago ✅              │
│  Buying Power: LKR 4,500                        │
│  [Sync Now]                                      │
│                                                  │
│  (... existing portfolio table but now           │
│   auto-populated from ATrad data ...)            │
│                                                  │
│  If ATrad not configured:                        │
│  ┌─────────────────────────────────────────┐    │
│  │  Connect your ATrad account to auto-     │    │
│  │  sync your portfolio.                    │    │
│  │                                          │    │
│  │  Your credentials are stored locally     │    │
│  │  on YOUR computer only. They are never   │    │
│  │  sent to any server.                     │    │
│  │                                          │    │
│  │  [Configure ATrad Connection]            │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

Journey page — auto-detect deposits:
```
📅 Deposit History (auto-detected from ATrad)

  Mar 10, 2026 — LKR 10,000 deposited ✅ (auto-detected)
  
  Note: Deposits are detected when your ATrad buying 
  power increases. You can manually adjust if needed.
```

---

### TASK 6: Settings Page

Create `/settings` page:

```
⚙️ Settings

ATrad Connection
  Username: ****29LI0 (configured ✅)
  Status: Connected
  Last sync: 5 min ago
  Auto-sync: Every 15 min during market hours
  [Test Connection] [Sync Now]
  
  Note: Password is stored in .env file on your 
  computer. Edit ~/workspace/cse-ai-dashboard/src/backend/.env
  to change it.

Display Mode
  ○ Simple Mode (recommended for beginners)
  ● Pro Mode (full technical dashboard)

AI Mode
  Current: Mock Mode (API key not configured)
  To enable live AI: Add ANTHROPIC_API_KEY to .env
  
Investment Profile
  Monthly contribution: LKR 10,000 [Edit]
  Investment goal: LKR 100,000 [Edit]
  Risk tolerance: Conservative [Change]
  Shariah filter: Always ON ✅

Notifications
  Market drop alerts: ON (> 3% drop)
  Portfolio stock alerts: ON (> 5% move)
  Announcement alerts: ON (for my stocks)
  Shariah status changes: ON
```

---

### TASK 7: Commit & Push

```bash
git add -A
git commit -m "ATrad portfolio sync, dynamic insights, auto-goals, market explainers, settings page"
git push
```

Make sure .gitignore has:
```
.env
data/atrad-sync/
```

The atrad-sync screenshots should never be committed.

---

### IMPORTANT NOTES

1. ATrad sync is READ-ONLY. The code must NEVER interact with Buy/Sell buttons or order forms.
2. Credentials are in .env ONLY — never in code, never in database, never in frontend.
3. If ATrad login fails (wrong password, site down), the dashboard still works with manually-entered data.
4. The sync is a NICE-TO-HAVE — the dashboard functions fully without it.
5. All dynamic content is generated from REAL data — nothing is hardcoded or static.
6. Add data/atrad-sync/ to .gitignore immediately.
