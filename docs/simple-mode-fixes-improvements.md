# CSE Dashboard — Simple Mode Redesign, AI Brief Fix, Data Freshness & Color Audit

⚠️ CRITICAL: `.env` must NEVER be touched, modified, read, or deleted under ANY circumstances. ⚠️
⚠️ SAFETY: Do NOT delete any database tables or production data. ⚠️

Read `CLAUDE.md` first for full project context.

---

## TASK 1: Fix AI Market Brief Table Rendering (15 min)

### Problem
The AI Market Brief on the dashboard renders markdown tables as pipe-separated text instead of proper HTML tables. The macro dashboard section shows:
```
| Indicator | Level | Signal | |---|---|---| | SLFR / SDFR | 9.25% / 8.25% | Stable...
```
This should render as a formatted table.

### Fix

1. Find where the AI Market Brief is rendered on the dashboard:
```bash
grep -rn "brief\|market.*brief\|ai.*brief\|dailyBrief" src/frontend/src/app/ --include="*.tsx" | grep -v node_modules
```

2. The brief content comes from the AI and contains markdown with tables. Ensure ReactMarkdown is used with proper table support:

```tsx
import ReactMarkdown from 'react-markdown';

// In the brief rendering section:
<ReactMarkdown
  components={{
    table: ({ children }) => (
      <div className="overflow-x-auto my-4">
        <table className="w-full text-sm border-collapse">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="bg-muted/50 border-b">{children}</thead>
    ),
    th: ({ children }) => (
      <th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs">{children}</th>
    ),
    td: ({ children }) => (
      <td className="px-3 py-2 border-b border-border/50 text-foreground">{children}</td>
    ),
    tr: ({ children }) => (
      <tr className="hover:bg-muted/30">{children}</tr>
    ),
    // Also handle bold, headings, lists properly
    strong: ({ children }) => (
      <strong className="font-semibold text-foreground">{children}</strong>
    ),
    h1: ({ children }) => (
      <h2 className="text-lg font-semibold mt-4 mb-2">{children}</h2>
    ),
    h2: ({ children }) => (
      <h3 className="text-base font-semibold mt-3 mb-1.5">{children}</h3>
    ),
    h3: ({ children }) => (
      <h4 className="text-sm font-semibold mt-2 mb-1">{children}</h4>
    ),
    p: ({ children }) => (
      <p className="mb-2 leading-relaxed">{children}</p>
    ),
    ul: ({ children }) => (
      <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>
    ),
  }}
>
  {briefContent}
</ReactMarkdown>
```

3. Apply the same treatment to:
   - Daily digest content on the alerts page
   - Weekly brief content on the alerts page
   - AI stock analysis content on stock detail pages
   - Any other place where AI-generated markdown is displayed

4. Create a reusable component: `src/frontend/src/components/markdown-renderer.tsx`
   so all AI content uses the same styled renderer.

---

## TASK 2: Fix Global Market Indicators Staleness (20 min)

### Problem
Global Market Indicators shows "Updated Mar 10, 2026" — 12 days stale. Oil, Gold, USD/LKR, S&P 500 data is not refreshing.

### Fix

1. Find the global market data fetcher:
```bash
grep -rn "yahoo\|global.*market\|oil\|gold\|brent\|exchange.*rate\|forex" src/backend/src/ --include="*.ts" | grep -v node_modules
```

2. Check if there's a cron job for global data:
```bash
grep -rn "@Cron.*global\|fetchGlobal\|updateGlobal\|fetchExternalMarket" src/backend/src/ --include="*.ts"
```

3. If the fetcher exists but is broken:
   - Check what API it uses (Yahoo Finance? ExchangeRate API?)
   - Test the API manually with curl
   - Fix any parsing errors
   - Ensure the cron runs daily (not just on market days — global markets trade different hours)

4. If no cron exists, create one that runs twice daily (9:00 AM and 6:00 PM SLT):
   - Brent Crude Oil price
   - Gold (XAU/USD)
   - USD/LKR exchange rate
   - S&P 500

5. Free API options that work:
   - ExchangeRate API: `https://api.exchangerate-api.com/v4/latest/USD` (free, no key)
   - For oil/gold/S&P: check if any free endpoint works, or use the CSE's own global data if available

6. Update the "Updated" timestamp to show the actual last fetch time, not a hardcoded date.

---

## TASK 3: Integrate ForexFactory Economic Calendar (20 min)

### Source
https://www.forexfactory.com/calendar — provides real-time economic event data.

### Implementation

1. Check if ForexFactory has an RSS feed or API:
```bash
curl -s "https://www.forexfactory.com/calendar/rss" -H "User-Agent: Mozilla/5.0" | head -c 1000
```

2. If RSS works, add it to the existing news/RSS service:
```bash
grep -rn "rss\|feed\|news.*source\|fetchNews" src/backend/src/ --include="*.ts" | head -10
```

Add ForexFactory as a new feed source alongside EconomyNext and Google News CSE.

3. If no RSS, try scraping the calendar page for upcoming high-impact events:
   - Filter for USD, LKR, and global events (Fed decisions, IMF reviews)
   - Store in a new `economic_events` table or reuse the announcements table with a 'FOREX_FACTORY' source tag
   - Show on the dashboard in the "Upcoming Events" card

4. Alternative if ForexFactory blocks scraping:
   Use `https://nfs.faireconomy.media/ff_calendar_thisweek.json` — this is a known public JSON endpoint that ForexFactory data is available from.
```bash
curl -s "https://nfs.faireconomy.media/ff_calendar_thisweek.json" | python3 -m json.tool | head -50
```

5. Display upcoming high-impact events on the dashboard, filtered for:
   - Sri Lanka specific events (CBSL decisions)
   - USD events (Fed rate, NFP — affects LKR)
   - Global risk events (IMF, World Bank)

---

## TASK 4: Simple Mode Complete Redesign (45 min)

### Problem
Currently Simple Mode just hides some nav items (Signals, Analysis) — it's the same dashboard with less features. This is NOT simple. A zero-knowledge user still sees ASPI, P/E ratios, RSI, and financial jargon everywhere.

### Vision
Simple Mode should feel like a friendly investment guide, not a trading terminal. Think of it as the difference between a Bloomberg terminal and a Robinhood app.

### Implementation

1. Find the Simple/Pro toggle logic:
```bash
grep -rn "simple\|pro.*mode\|displayMode\|isSimple\|isPro" src/frontend/src/ --include="*.tsx" --include="*.ts" | head -20
```

2. When Simple Mode is active, the Dashboard page should show a COMPLETELY different layout:

**Simple Dashboard Layout:**

```
┌──────────────────────────────────────────────────────────────────┐
│ Good afternoon, Atheeque!                              ☀️ / 🌙  │
│ Here's your investment update for today.                         │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ 📊 Market Today                                                  │
│                                                                  │
│ The Sri Lankan stock market went UP today by 2.05%.              │
│ This means most stock prices increased — good for your           │
│ existing investments.                                            │
│                                                                  │
│ The market index (ASPI) closed at 20,688.                        │
│ Think of ASPI as a "health score" for the entire stock market — │
│ when it goes up, most stocks are doing well.                     │
│                                                    Learn more →  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ 💰 Your Portfolio                                                │
│                                                                  │
│ You've invested: LKR 20,000                                      │
│ Current value:   LKR 13,440                                      │
│ Change:          -LKR 6,560 (down 32.8%)                         │
│                                                                  │
│ Don't worry — stock investing is a long-term journey.            │
│ Short-term drops are normal, especially in the first few months. │
│ Your strategy (Rupee Cost Averaging) works best over 2-5 years.  │
│                                                                  │
│ You hold 1 stock: AEL (Access Engineering)                       │
│ This is a Shariah-compliant construction company that benefits    │
│ from Sri Lanka's infrastructure rebuilding.                      │
│                                                  View details →  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ 🤖 What the AI Thinks                                           │
│                                                                  │
│ "The market dropped sharply earlier this week but is recovering.  │
│ For your conservative, Shariah-compliant strategy, the best       │
│ action is to continue your monthly LKR 10,000 investment plan.   │
│ Consider buying TJL (Teejay Lanka) next month — it's a textile   │
│ exporter that earns in US dollars, which protects against         │
│ rupee depreciation."                                             │
│                                                                  │
│ ⚠️ This is educational, not financial advice.                    │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ 📅 What to Do This Week                                         │
│                                                                  │
│ ✅ Mar 25 — CBSL Rate Decision (this affects loan and deposit    │
│    rates. If they cut rates, it's usually good for stocks.)      │
│                                                                  │
│ 📌 Your next investment date: April 1                            │
│    Planned: LKR 10,000 into TJL.N0000                            │
│                                                                  │
│ 🕌 All your investments are Shariah-compliant ✓                  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ 📰 News That Matters to You                                     │
│                                                                  │
│ • IMF team in Sri Lanka for reform reviews (affects market       │
│   confidence — positive for your stocks)                         │
│ • SriLankan Airlines debt restructuring (good for country's      │
│   credit rating — indirectly helps stock market)                 │
│                                                    More news →   │
└──────────────────────────────────────────────────────────────────┘
```

3. **Key principles for Simple Mode:**
   - Every number gets a plain-English explanation
   - ASPI → "market health score"
   - P/E → never shown
   - RSI, MACD, SMA → never shown
   - Red/green → explained ("down" / "up")
   - AI content rephrased as friendly advice with disclaimers
   - No tables, no charts, no technical indicators
   - Action-oriented: "What to do this week"
   - Reassuring tone for losses: "This is normal for long-term investing"
   - Shariah status shown as simple checkmark, not technical badges

4. **Simple Mode Navigation:**
   Only show these nav items:
   - My Journey (home in simple mode)
   - My Portfolio (simplified view)
   - What to Buy (simplified signals — "The AI suggests considering...")
   - News (plain language summaries)
   - Settings

   Hide: Stocks, Signals, Orders, Analysis, Intelligence, Demo, Tools

5. **Implementation approach:**
   - Create `src/frontend/src/app/simple-dashboard.tsx` as a separate component
   - In the main dashboard page, check the display mode and render either SimpleDashboard or ProDashboard
   - The simple components can fetch the same API data but present it differently
   - AI brief content can be piped through a "simplify" prompt that strips jargon (or just show a curated excerpt)

---

## TASK 5: Hardcoded Dark Color Audit (20 min)

### Problem
Some pages still have hardcoded Tailwind dark-mode colors like `bg-gray-900`, `bg-slate-800`, `text-white`, `text-gray-400` instead of theme-aware CSS variables.

### Fix

1. Search for hardcoded dark colors:
```bash
cd ~/workspace/cse-ai-dashboard/src/frontend
grep -rn "bg-gray-900\|bg-gray-800\|bg-slate-900\|bg-slate-800\|bg-zinc-900\|bg-neutral-900" src/ --include="*.tsx" | grep -v node_modules
grep -rn "text-white\b" src/ --include="*.tsx" | grep -v node_modules | grep -v "dark:text-white"
grep -rn "text-gray-400\|text-gray-500\|text-slate-400" src/ --include="*.tsx" | grep -v node_modules | grep -v "dark:"
grep -rn "border-gray-700\|border-gray-800\|border-slate-700" src/ --include="*.tsx" | grep -v node_modules | grep -v "dark:"
```

2. For each match, replace with theme-aware alternatives:
   - `bg-gray-900` → `bg-background`
   - `bg-gray-800` / `bg-slate-800` → `bg-card` or `bg-muted`
   - `text-white` → `text-foreground` (unless inside a `dark:` prefix)
   - `text-gray-400` → `text-muted-foreground`
   - `border-gray-700` → `border-border`

3. Special cases:
   - Inside `dark:` prefixes are FINE — leave those
   - Button variants with explicit colors (e.g., green approve button) are fine
   - Chart/badge colors that should be the same in both themes are fine

4. After all replacements:
   - Toggle to LIGHT mode and check every page loads correctly
   - Toggle to DARK mode and check nothing broke
   - Specifically check: Dashboard, Portfolio, Demo, Orders, Signals, Stocks, Alerts, Journey, Settings

---

## TASK 6: Recent Alerts Box Cleanup (10 min)

### Problem
The "Recent Alerts" box on the dashboard bottom-right looks out of place — misaligned and doesn't fit the layout well.

### Fix

1. Find the Recent Alerts section on the dashboard:
```bash
grep -rn "recent.*alert\|Recent.*Alert" src/frontend/src/app/ --include="*.tsx" | head -10
```

2. Options:
   - **Option A (preferred):** Move it to a cleaner position — as a card in the main content flow, not a floating sidebar element. Place it after the AI Market Brief or after the Upcoming Events card.
   - **Option B:** Keep it on the right but make it a proper card with consistent styling (same shadow, border-radius, padding as other cards)
   - **Option C:** Remove it from the dashboard entirely — alerts are already accessible via the bell icon in the header and the dedicated /alerts page

3. Whatever option you choose, ensure it looks clean in BOTH light and dark mode.

---

## Verification

```bash
# TypeScript
cd ~/workspace/cse-ai-dashboard/src/backend && npx tsc --noEmit
cd ~/workspace/cse-ai-dashboard/src/frontend && npx tsc --noEmit

# Test markdown rendering
echo "Manual: Open dashboard, check AI Market Brief has proper tables"
echo "Manual: Check alerts page — weekly brief renders with proper headings"

# Test Simple mode
echo "Manual: Go to Settings, switch to Simple Mode"
echo "Manual: Dashboard should show plain-language cards, not technical data"
echo "Manual: Toggle back to Pro Mode — verify nothing broke"

# Test theme
echo "Manual: Toggle light/dark in both Simple and Pro modes"
echo "Manual: Check no white-on-white or black-on-black text anywhere"

# Test global data freshness
echo "Check: Global Market Indicators should show today's date or recent"
```

Commit: `feat: simple mode redesign, AI brief table rendering, global data fix, Forex Factory, color audit`
Git push.

⚠️ CRITICAL: `.env` must NEVER be touched, modified, read, or deleted under ANY circumstances. ⚠️
