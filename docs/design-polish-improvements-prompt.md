# CSE Dashboard — Design Polish + Feature Improvements

⚠️ CRITICAL: `.env` must NEVER be touched, modified, read, or deleted under ANY circumstances. ⚠️
⚠️ SAFETY: Do NOT delete any database tables or production data. ⚠️

Read `CLAUDE.md` first for full project context.

---

## Mission: Make this product CFO-presentation ready

The goal: a C-suite executive should look at this dashboard and immediately 
understand that (a) the methodology is sound, (b) the data is real, 
(c) the AI reasoning is transparent, and (d) Shariah compliance is rigorous.

Light theme is the PRIMARY design target. Dark theme should still work, 
but optimize for light — that's what gets shown in meetings.

---

## TASK 1: Light Theme Design Audit & Polish (45 min)

The light theme exists but needs polish. Go through EVERY page and fix:

### Global Design Tokens (update globals.css)

Ensure these work in BOTH themes but look exceptional in light:

```css
/* Light theme refinements */
:root {
  /* Card shadows — light theme needs subtle elevation */
  --card-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06);
  --card-shadow-hover: 0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04);
  
  /* Refined spacing scale */
  --space-section: 2rem;     /* between page sections */
  --space-card-gap: 1rem;    /* between cards in a grid */
  --space-card-padding: 1.25rem; /* inside cards */
}

.dark {
  --card-shadow: 0 1px 3px rgba(0,0,0,0.3);
  --card-shadow-hover: 0 4px 12px rgba(0,0,0,0.4);
}
```

### Per-Page Audit

For EACH of these pages, open in light mode and fix issues:

**Dashboard (/):**
- Summary cards: add subtle shadow, consistent padding, aligned baselines
- ASPI ticker: ensure the +1.75% green is visible on white background
- AI Brief card: subtle left border accent (blue) to distinguish AI content
- Gainers/Losers tables: zebra striping should be barely visible (#F8FAFC / #FFFFFF alternate)
- News cards: clean card borders, consistent image/icon sizing
- Remove any hardcoded dark colors (bg-gray-900, text-white, etc.)

**Portfolio (/portfolio):**
- Holdings table: align numbers right, use tabular-nums
- P&L values: ensure green/red contrast is WCAG AA in light mode
- Add Holding form: clean input borders, proper focus states

**Demo Portfolio (/demo):**
- Summary cards: Portfolio Value should be the most visually prominent
- "VIRTUAL" label: subtle gray, not distracting
- Holdings table: same right-alignment for numbers
- Quick Trade panel: clean card with clear visual hierarchy

**Demo Performance (/demo/performance):**
- Benchmark chart placeholder: style it nicely even when empty
- Metric cards: consistent height, aligned text
- Trade log: expandable rows should have smooth animation
- Shariah compliance card: 50% in red is correct but jarring — use amber/warning instead since it's fixable (pending data, not actual non-compliance)

**Orders (/orders):**
- Already in light theme (good!) — verify Approve button green is accessible
- Suggested orders cards: add subtle left border (green for TP, red for SL)

**Signals (/signals):**
- Signal cards: clear BUY/SELL/HOLD indicator with icon
- Confidence meter: ensure the visual bar reads well in light mode

**Stocks (/stocks):**
- Grid/table view: if both exist, ensure toggle works
- Shariah badge: green checkmark should be small and subtle, not dominant
- Search: clean focus state, debounced filtering

**Journey (/journey):**
- AI Advisor section: distinguish from regular content with subtle background
- Insights cards: the colored dots (gold, green) are good — ensure they work in light mode
- Score bars (placeholder "50"): gray them out clearly with "placeholder" label

**Admin Financials (/admin/financials):**
- Fetch All button: prominent primary blue
- CSV import section: clean file drop zone
- Data table: show coverage status clearly (green = complete, red = missing)

**Alerts (/alerts):**
- Notification cards: unread indicator (blue dot) should be visible
- Weekly brief: format the markdown content nicely (it currently shows raw markdown)
- Risk alerts: amber background tint for warning alerts

### Typography Consistency Check

```
Every page should follow this hierarchy:
- Page title: 24px, font-weight 600, text-foreground
- Section headers: 18px, font-weight 600
- Card headers: 16px, font-weight 500
- Body text: 14px, font-weight 400
- Labels/captions: 12px, font-weight 400, text-muted-foreground
- Numbers/prices: JetBrains Mono (.num class), tabular-nums
```

Verify with: `grep -rn "text-2xl\|text-3xl\|text-4xl\|font-bold" src/frontend/ --include="*.tsx" | head -30`
Ensure nothing uses arbitrary font sizes outside the scale.

---

## TASK 2: Weekly Brief & Daily Digest Formatting (20 min)

The alerts page shows raw markdown for the weekly brief. This needs proper rendering.

1. Check if the alerts/notifications page renders markdown:
```bash
grep -rn "markdown\|ReactMarkdown\|remark\|rehype" src/frontend/ --include="*.tsx"
```

2. If no markdown renderer exists:
```bash
cd ~/workspace/cse-ai-dashboard/src/frontend
npm install react-markdown
```

3. In the alerts/notifications component, wrap digest and brief content in:
```tsx
import ReactMarkdown from 'react-markdown';

<ReactMarkdown className="prose prose-sm dark:prose-invert max-w-none">
  {notification.content}
</ReactMarkdown>
```

4. Style the prose with Tailwind typography:
```bash
cd ~/workspace/cse-ai-dashboard/src/frontend
npm install @tailwindcss/typography
```
Add to tailwind.config: `plugins: [require('@tailwindcss/typography')]`

5. The weekly brief should render with:
- Proper headings (# Week in Review → styled h1)
- Bold text (** **) rendered as bold
- Lists rendered as proper bullet lists
- Numbers and percentages in monospace

---

## TASK 3: Dashboard Landing Page Improvements (30 min)

The dashboard is the first thing the CFO sees. Make it exceptional.

### Add these sections if missing:

**A. Portfolio Quick Summary (top of dashboard)**
If the user has real holdings, show a compact summary:
```
┌────────────────────────────────────────────────────────┐
│ My Portfolio                           View Details →   │
│ LKR 13,440  ↓ -32.80%  │  1 holding  │  100% Shariah │
└────────────────────────────────────────────────────────┘
```
This is a single-line card that links to /portfolio.

**B. Market Sentiment Indicator**
A simple visual showing market condition:
```
Today's Market: 🟢 Recovering (+1.75%)
Volume: LKR 3.95Bn (below 30-day avg)  |  Breadth: 120 up / 85 down
```

**C. Upcoming Events Card**
```
┌──────────────────────────────────────────┐
│ Upcoming Events                           │
│ 📅 Mar 25 — CBSL Rate Decision            │
│ 📅 Mar 31 — Q4 Earnings Season Begins     │
│ 📅 Apr 1  — Next RCA Purchase Window      │
└──────────────────────────────────────────┘
```
This can be hardcoded initially or pulled from announcements.

**D. AI Insights Preview**
Show 1-2 key insights from the latest AI analysis:
```
┌──────────────────────────────────────────────────────────┐
│ 🤖 AI Insight                                            │
│ "ASPI has recovered 1.75% after Monday's 3.05% selloff.  │
│ Institutional selling pressure appears to be easing.      │
│ Infrastructure stocks (AEL, TKYO) showing relative        │
│ strength vs market."                                      │
│                                              Read more →  │
└──────────────────────────────────────────────────────────┘
```

---

## TASK 4: Data Density Improvements (20 min)

Financial professionals want MORE data, not less. Add:

**Stock detail page** — when you click a stock in the table, show:
- Current price, change, volume (hero section)
- Key metrics grid: P/E, Market Cap, 52w High/Low, Dividend Yield, Beta
- Shariah status badge with screening details
- Mini price chart (if data exists)
- Related sector stocks
- Any recent announcements for this stock

Check if `/stocks/[symbol]` page exists. If not, create a basic detail page.

**Portfolio page** — add:
- Allocation pie chart (what % of portfolio is each stock)
- Total invested vs current value comparison
- Cost basis vs market price per holding

---

## TASK 5: Error States & Empty States (15 min)

Every section that can be empty needs a friendly empty state, not just blank space.

Check and add empty states for:
- "Equity curve will appear after 2 trading days of data" ← this exists, good
- "No trades yet" → add: "Use Quick Trade or Let AI Trade to get started"
- "Benchmark comparison will appear after 2+ trading days" ← exists, good
- No AI recommendation → "First recommendation scheduled for Friday 2:55 PM"
- Empty trade log → "Your trade history will appear here"
- No signals → "Signals generate daily at market close (2:45 PM)"

For sections that HAVE data but it's stale (e.g., scores showing "50 placeholder"):
- Gray them out
- Add a subtle label: "Preliminary — needs 20 trading days for full analysis"

---

## TASK 6: Performance & Loading Optimizations (15 min)

1. Check if pages use loading skeletons:
```bash
grep -rn "Skeleton\|skeleton\|shimmer" src/frontend/ --include="*.tsx" | head -10
```

2. Every API-dependent section should show a skeleton while loading, not a spinner or blank space

3. Add error boundaries — if an API call fails, show "Unable to load [section]" with a retry button, not a crash

4. Check if images/icons are optimized:
```bash
ls -la src/frontend/public/*.png
# Icon files should be < 50KB each
```

---

## Verification

```bash
# TypeScript
cd ~/workspace/cse-ai-dashboard/src/backend && npx tsc --noEmit
cd ~/workspace/cse-ai-dashboard/src/frontend && npx tsc --noEmit

# Manual checks:
echo "1. Open localhost:3000 in LIGHT mode — screenshot the dashboard"
echo "2. Open localhost:3000/demo in LIGHT mode — check cards"  
echo "3. Open localhost:3000/alerts in LIGHT mode — check weekly brief renders markdown"
echo "4. Open localhost:3000/stocks — click a stock — check detail page"
echo "5. Open in Chrome DevTools mobile view (375px) — check all pages"
echo "6. Toggle to DARK mode — verify nothing broke"
```

Commit: `feat: design polish for CFO presentation, markdown rendering, dashboard improvements`
Git push.

⚠️ CRITICAL: `.env` must NEVER be touched, modified, read, or deleted under ANY circumstances. ⚠️
