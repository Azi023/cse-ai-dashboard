# CSE AI Dashboard — Frontend Audit & UX Critique

> **Date:** 2026-04-10
> **Scope:** Full frontend audit at `src/frontend/src/` (26 pages, 20 components, ~16,000 lines)
> **Status:** READ-ONLY analysis. No source files modified.

---

## Executive Summary

The CSE AI Dashboard is a well-built, production-ready application with strong TypeScript discipline (zero `any` types), a comprehensive dark/light theme system using OKLch color space, and solid mobile-first responsive patterns. The codebase scores **7.7/10 overall** — above average for a solo-developer project of this scope.

However, several issues degrade the user experience significantly:

| Severity | Count | Impact |
|----------|-------|--------|
| Critical | 3 | Data display errors, unusable on mobile for key workflows |
| High | 7 | Design inconsistency, navigation overload, chart quality |
| Medium | 8 | Polish, accessibility, theme bypass |
| Low | 5 | Minor optimizations, nice-to-have improvements |

The three most impactful fixes are:
1. **Parse and format the 3-month outlook** (currently renders raw JSON)
2. **Fix candlestick open-price fallback** (open=0 makes all candles green)
3. **Reorganize navigation** (25 items overwhelm new users)

---

## Table of Contents

1. [Critical Issues](#1-critical-issues)
2. [High Priority Improvements](#2-high-priority-improvements)
3. [Medium Priority Polish](#3-medium-priority-polish)
4. [Low Priority / Nice-to-Have](#4-low-priority--nice-to-have)
5. [Chart-Specific Findings](#5-chart-specific-findings)
6. [Quick Wins (< 30 min each)](#6-quick-wins--30-min-each)
7. [Phased Implementation Plan](#7-phased-implementation-plan)
8. [Appendix: Full Inventory](#appendix-full-inventory)

---

## 1. Critical Issues

### C1: AI Recommendation 3-Month Outlook Renders Raw JSON

**Location:** `src/frontend/src/app/journey/page.tsx:441-444`
**Backend:** `src/backend/src/modules/analysis/analysis.service.ts:608-611`

**Root Cause:** The AI prompt requests a structured JSON object for `price_outlook_3m`:
```json
{
  "bear": {"price": 46.8, "scenario": "ASPI correction + sector rotation"},
  "base": {"price": 52.0, "scenario": "Steady accumulation continues"},
  "bull": {"price": 58.5, "scenario": "Rate cut catalyst + earnings beat"}
}
```

The backend serializes this with `JSON.stringify()` and stores it in a `text` column. The frontend renders it directly as `{aiRec.price_outlook_3m}` — displaying the raw JSON string to the user.

**Fix:** Parse `price_outlook_3m` in the frontend and render a structured card:
- Three rows: Bear / Base / Bull
- Each showing target price + scenario description
- Color-coded: red (bear), neutral (base), green (bull)
- Wrap in `try/catch` for backwards compatibility with any plain-text entries

**Effort:** 30-45 min

---

### C2: Candlestick Chart Shows Mostly Green Candles

**Location:** `src/frontend/src/components/charts/price-chart.tsx:101-110`
**Backend:** `src/backend/src/modules/cse-data/cse-data.service.ts:697`

**Root Cause:** When saving daily prices from the trade summary, the open price falls back to zero:
```typescript
dailyPrice.open = item.open ?? 0;  // If CSE API returns null/undefined open, defaults to 0
```

A candle with `open=0` and `close=73.90` will always render as green (bullish) because `close > open`. This means any stock where the CSE API doesn't provide an intraday open price will show 100% green candles.

The historical backfill service (`data.service.ts:233`) correctly handles this:
```typescript
open: item.o ?? close,  // Falls back to close price, not zero
```

But the primary daily ingestion path does not.

**Fix (backend):** Change the fallback in `cse-data.service.ts`:
```typescript
// Before
dailyPrice.open = item.open ?? 0;
// After
dailyPrice.open = item.open ?? item.price ?? 0;
```

Also run a one-time data repair query:
```sql
UPDATE daily_prices SET open = close WHERE open = 0 AND close > 0;
```

**Impact:** All historical candlestick charts will immediately show correct red/green coloring.

**Effort:** 15 min (code change) + 5 min (data repair)

---

### C3: Tables Unusable on Mobile (Horizontal Scroll Only)

**Location:** All table-heavy pages (portfolio, stocks, orders, signals, backtest)

**Root Cause:** Every data table uses `overflow-x-auto` with the same desktop column layout on mobile. Users must scroll horizontally to see critical data columns (price, P&L, signals). No card-based mobile redesign exists.

**Affected Pages:**
- `/portfolio` — 8+ columns, most important data (P&L) requires scrolling right
- `/stocks` — 7+ columns, price change hidden on small screens
- `/orders` — 6+ columns with action buttons
- `/signals` — 7+ columns, signal direction hidden
- `/backtest` — 10+ columns with results

**Fix:** For the 3 most-used tables (portfolio holdings, stock browser, signals):
- Below `md` breakpoint, render as stacked cards instead of table rows
- Show symbol + price + change + P&L in the card header
- Collapse secondary data into expandable detail section
- Keep table layout for `md` and above

**Effort:** 2-3 hours per table (6-9 hours total for top 3)

---

## 2. High Priority Improvements

### H1: Navigation Overload — 25 Items Across 6 Groups

**Location:** `src/frontend/src/components/layout/header.tsx:71-125`

**Current State:** 6 top-level links + 4 dropdown groups containing 19 more links = 25 total navigation items. For a single-user personal tool, this creates cognitive overload and makes the header crowded on desktop, worse on tablet.

**Recommended Reorganization (3 groups, 12 items):**

| Group | Items | Notes |
|-------|-------|-------|
| **Core** (top-level) | Dashboard, Portfolio, Stocks, Signals | 4 items, always visible |
| **Research** (dropdown) | Sectors, Compare, Opportunities, Backtester | 4 items |
| **More** (dropdown) | News, Announcements, Chat, Shariah, Dividends, Zakat, Crypto, Settings | 8 items |

**Remove from main nav:**
- Journey → Move to Dashboard as a tab or widget
- Orders → Move to Portfolio as a tab
- AI Performance → Move to Settings or Dashboard
- Demo Portfolio/Performance → Move to Settings or separate admin area
- Financials → Move to Settings (admin tool, not daily use)

**Simple Mode:** Only show Core (4 items) + condensed "More" (3-4 items)

**Effort:** 2-3 hours

---

### H2: Chart Gridlines Look Unprofessional

**Location:** `src/frontend/src/components/charts/price-chart.tsx:118-121`

**Current:** Hardcoded `#1f2937` gridlines visible on both axes. Professional trading terminals (TradingView, Bloomberg) use either no gridlines or very subtle ones.

**Fix:**
```typescript
grid: {
  vertLines: { visible: false },
  horzLines: { color: 'rgba(255, 255, 255, 0.04)' },  // Nearly invisible horizontal only
},
```

Also make chart colors theme-aware by reading CSS variables instead of hardcoded hex.

**Effort:** 15 min

---

### H3: Chart Colors Not Theme-Aware

**Location:** `src/frontend/src/components/charts/price-chart.tsx:113-143`

**Current:** All chart colors are hardcoded hex values (`#22c55e`, `#ef4444`, `#9ca3af`, `#1f2937`, `#374151`). These are dark-theme-only colors. In light mode, `#1f2937` gridlines would be nearly invisible against a white background, and `#9ca3af` text would have poor contrast.

The app has semantic CSS variables defined (`--profit`, `--loss`, `--chart-1` through `--chart-5`) that adapt to dark/light themes, but the chart component bypasses them entirely.

**Fix:** Read computed CSS variable values at render time:
```typescript
const styles = getComputedStyle(document.documentElement);
const profitColor = styles.getPropertyValue('--profit').trim();
const lossColor = styles.getPropertyValue('--loss').trim();
```

Note: lightweight-charts requires hex/rgb values, not OKLch. Convert CSS variable values or maintain a parallel hex map keyed by theme.

**Effort:** 1-2 hours

---

### H4: 400 Hardcoded Tailwind Color Instances Bypass Design System

**Location:** 33 files across `src/frontend/src/`

**Current:** The `globals.css` defines semantic color variables (`--profit`, `--loss`, `--warning-color`) mapped to Tailwind classes (`text-profit`, `bg-loss`, `text-warning-color`). However, 400+ instances across 33 files use raw Tailwind colors instead:

| Raw Color | Should Be | Count (approx) |
|-----------|-----------|-----------------|
| `text-emerald-500`, `text-green-400/500` | `text-profit` | ~80 |
| `text-red-400/500`, `bg-red-500/10` | `text-loss` or `text-destructive` | ~90 |
| `text-yellow-400/500`, `bg-yellow-500/10` | `text-warning-color` | ~40 |
| `bg-green-500/10/15/20` | `bg-profit/10` etc. | ~60 |
| Other hardcoded colors | Various semantic vars | ~130 |

**Impact:**
- Light/dark theme changes require updating 400 places instead of 2 CSS variables
- No semantic meaning — is `text-red-500` an error, a loss, or a destructive action?
- Inconsistent shades (some use `-400`, others `-500`, others `-600`)

**Fix:** Systematic find-and-replace per color family. Prioritize the top 3 pages (portfolio, journey, dashboard) first.

**Effort:** 3-4 hours (full sweep), or 1 hour (top 3 pages only)

---

### H5: No Data Caching Layer (Every Page Refetches)

**Location:** All pages use `useState` + `useEffect` + raw `fetch` pattern

**Current:** Each page fetches all its data on mount. Navigating from Dashboard to Stocks and back triggers a full refetch of dashboard data. No stale-while-revalidate, no background refresh, no shared cache.

**Impact:**
- Sluggish navigation (flash of loading state on every page visit)
- Unnecessary API load on the backend
- No optimistic updates for user actions

**Fix:** Add TanStack Query (React Query):
- Wrap app in `QueryClientProvider`
- Replace `useEffect` fetch patterns with `useQuery` hooks
- Configure `staleTime` per data type (market data: 30s, portfolio: 5min, static: 1hr)
- Enables prefetching on hover and background refetching

**Effort:** 4-6 hours (incremental, page by page)

---

### H6: Mobile Menu Is a Cramped Dropdown, Not a Full-Screen Experience

**Location:** `src/frontend/src/components/layout/header.tsx:440-566`

**Current:** Mobile menu opens as a scrollable dropdown capped at `max-h-[70vh]`. With 25 nav items, it requires scrolling within the dropdown. No full-screen takeover, no search, no recent pages.

**Fix:** Replace with a full-screen mobile menu:
- Full viewport height overlay
- Large touch targets (48px+ height per item)
- Group items with section headers
- Add a search/filter input at top
- Show current page with highlight
- Animate in from bottom or right

**Effort:** 2-3 hours

---

### H7: Simple/Pro Mode Differentiation Is Minimal

**Location:** `src/frontend/src/contexts/display-mode-context.tsx`, `header.tsx:272-299`

**Current:** Simple mode only:
- Reduces top nav from 6 to 2 items (Journey, Portfolio)
- Reduces dropdown groups from 4 to 2 (with only News and Settings visible)
- On Dashboard: swaps to `SimpleDashboard` component, hides macro/global/sectors cards
- Changes label text ("Winners" vs "Top Gainers")

**Missing in Simple mode:**
- No simplified data views (still shows full tables with all columns)
- No guided tooltips or explanatory text
- No "what should I do?" call-to-action on each page
- No progressive disclosure (show summary first, details on tap)
- No beginner-friendly terminology throughout

**Fix:** Define a clear product brief for Simple mode — is it "fewer pages" or "simpler experience per page"? Currently it's just "fewer pages." For a beginner investor, the pages they CAN access (Portfolio, Journey) still show complex data without guidance.

**Effort:** Requires design decision first, then 4-8 hours implementation

---

## 3. Medium Priority Polish

### M1: Accessibility — Missing ARIA Labels on Icon Buttons

**Location:** `header.tsx:386, 401, 424` and throughout

**Current:** Icon-only buttons use `title` attribute but lack `aria-label`. Screen readers cannot announce button purpose.

**Affected Elements:**
- Theme toggle (Sun/Moon icon)
- Simple/Pro mode toggle
- Notification bell
- Logout button
- Mobile menu hamburger
- Chart indicator toggle buttons
- Refresh/sync buttons on various pages

**Fix:** Add `aria-label` to every icon-only button:
```tsx
<button aria-label="Toggle dark mode" title="Toggle theme">
  {theme === 'dark' ? <Sun /> : <Moon />}
</button>
```

**Effort:** 30-45 min

---

### M2: No Skip-to-Content Link

**Location:** `src/frontend/src/app/layout.tsx`

**Current:** No skip link for keyboard users. The sticky header with 25+ nav items means keyboard users must tab through every link to reach page content.

**Fix:** Add a visually-hidden skip link as the first focusable element:
```tsx
<a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded">
  Skip to content
</a>
```

**Effort:** 10 min

---

### M3: Console Statements in Production Code

**Location:** 13 instances across portfolio, shariah, orders, hooks, error.tsx

**Current:** `console.error()` calls in catch blocks. Acceptable for development but should use a proper logging service for production.

**Fix:** Replace with a thin logger wrapper that can be silenced in production or integrated with an error tracking service (e.g., Sentry).

**Effort:** 1 hour

---

### M4: Duplicate Color Mapping Logic

**Location:** Multiple files define sentiment/status color maps independently

**Files affected:**
- `daily-brief.tsx` — sentiment color mapping
- `journey/page.tsx` — confidence badge colors, score bar colors
- `signals/page.tsx` — signal direction colors
- `portfolio/page.tsx` — P&L color logic
- `stocks/[symbol]/page.tsx` — price change colors

**Fix:** Extract to a shared utility:
```typescript
// lib/colors.ts
export function profitLossColor(value: number): string {
  if (value > 0) return 'text-profit';
  if (value < 0) return 'text-loss';
  return 'text-muted-foreground';
}

export function confidenceColor(level: string): string { ... }
export function scoreColor(score: number): string { ... }
```

**Effort:** 1 hour

---

### M5: Large Page Files Need Decomposition

**Current file sizes exceeding 800 lines:**

| File | Lines | Recommended Split |
|------|-------|-------------------|
| `admin/financials/page.tsx` | 1,353 | Extract form sections into 3-4 components |
| `portfolio/page.tsx` | 1,197 | Extract holdings table, add-holding form, risk section |
| `crypto/page.tsx` | 1,150 | Extract trading panel, chart section, positions table |
| `journey/page.tsx` | 942 | Extract AI advisor card, KPIs section, insights |
| `stocks/[symbol]/page.tsx` | 793 | Extract info panel, technical signals section |
| `orders/page.tsx` | 730 | Extract order table, pending orders, execution log |

**Fix:** Extract logical sections into components within the same directory (colocation):
```
app/portfolio/
  page.tsx          (orchestrator, ~200 lines)
  holdings-table.tsx
  add-holding-form.tsx
  risk-overview.tsx
```

**Effort:** 2-3 hours per page (12-18 hours total, can be done incrementally)

---

### M6: Risk Flags Display Could Be Improved

**Location:** `src/frontend/src/app/journey/page.tsx:446-453`

**Current:** Risk flags render as inline badges with `⚠` emoji prefix. When there are 5+ flags, they wrap to multiple lines and create a wall of red badges.

**Fix:**
- Show first 2-3 flags inline
- Collapse remaining behind "Show N more" toggle
- Consider using a warning callout box with bulleted list instead of badges
- Replace emoji `⚠` with Lucide `AlertTriangle` icon for consistency

**Effort:** 30 min

---

### M7: Font Choice Violates Design System Preferences

**Location:** `src/frontend/src/app/layout.tsx:9-19`

**Current:** Uses **Inter** (sans) + **JetBrains Mono** (mono).

**Note:** Inter is the #1 most common font on web applications and was specifically called out in the global design preferences as a font to avoid. However, this was a deliberate design decision for the Bloomberg Terminal aesthetic documented in CLAUDE.md.

**Recommendation:** Consider switching to **Geist** (Vercel's font) or **Instrument Sans** — both have the same professional, data-dense feel as Inter but are more distinctive. JetBrains Mono is a good choice for financial data and should stay.

**Effort:** 15 min (font swap is trivial)

---

### M8: No Empty States for Key Pages

**Location:** Various pages

**Current:** Most pages show a brief text message when there's no data ("No data available"). This is a missed opportunity to guide users.

**Pages needing proper empty states:**
- **Signals** — "No signals yet. Signals are generated daily at 2:43 PM SLT after market close."
- **Orders** — "No pending orders. Visit Signals to find opportunities."
- **Alerts** — "No alerts set. You can create price alerts from any stock detail page."
- **Portfolio** (no holdings) — "Start your investment journey by adding your first holding."

**Fix:** Design contextual empty states with icon, message, and call-to-action link.

**Effort:** 1-2 hours

---

## 4. Low Priority / Nice-to-Have

### L1: Add React Query for Data Caching
See H5 — this is listed as High but can be done incrementally. Start with the Dashboard page.

### L2: Keyboard Navigation in Custom Dropdowns
**Location:** `header.tsx` dropdown menus
Arrow key support (Up/Down to navigate, Enter to select, Escape to close) is missing from custom dropdown menus. Consider switching to Radix UI `DropdownMenu` for built-in accessibility.

### L3: Preload Critical Data on App Shell
The `AppShell` component could prefetch market status and portfolio summary so they're ready before the user navigates.

### L4: Add `role="alert"` to Error Banners
Error banners and toast notifications should have `role="alert"` and `aria-live="polite"` for screen reader announcements.

### L5: PWA Offline Support
The app has PWA meta tags but no service worker for offline caching. Low priority since it's a data-heavy app that requires live market data.

---

## 5. Chart-Specific Findings

### Data Pipeline: OHLCV Is Complete

The CSE API **does** provide full OHLC data via the `tradeSummary` endpoint:
- `item.open` → stored as `daily_prices.open`
- `item.high` → stored as `daily_prices.high`
- `item.low` → stored as `daily_prices.low`
- `item.price` → stored as `daily_prices.close`
- `item.sharevolume` → stored as `daily_prices.volume`

The `daily_prices` entity has proper decimal(10,2) columns for all OHLCV fields. **This is NOT a missing-data issue.**

### Root Cause of Green-Only Candles

**Primary cause:** `cse-data.service.ts:697` uses `item.open ?? 0` as fallback. When CSE API returns `null`/`undefined` for open price (which happens for some stocks or during pre-market), `open` is saved as `0`. A candle with `open=0, close=73.90` always renders green.

**Secondary cause:** The historical backfill service (`data.service.ts:233`) correctly falls back to `item.o ?? close`, but data saved via the primary daily path uses the broken fallback.

**Verification query:** Run this to check extent of the problem:
```sql
SELECT COUNT(*) FROM daily_prices WHERE open = 0 AND close > 0;
```

### Chart Rendering: Correct Implementation

The `PriceChart` component (`price-chart.tsx:136-143`) uses lightweight-charts v5.1.0 correctly:
- `upColor: '#22c55e'` (green for bullish: close > open)
- `downColor: '#ef4444'` (red for bearish: close < open)
- Candle body, border, and wick colors all properly set
- Volume bars color-coded to match candle direction

The rendering logic is correct — the issue is upstream data quality.

### Chart Styling Recommendations

| Current | Recommended | Rationale |
|---------|-------------|-----------|
| Gridlines: `#1f2937` both axes | Horizontal only, `rgba(255,255,255,0.04)` | Professional terminals minimize grid noise |
| Text: `#9ca3af` hardcoded | Use `--muted-foreground` CSS var | Theme-aware |
| Borders: `#374151` hardcoded | Use `--border` CSS var | Theme-aware |
| Crosshair: `#6b7280` | Use `--muted-foreground` with 60% opacity | Subtle but visible |
| No chart legend | Add price + change in top-left overlay | Quick reference without hovering |
| Fixed height 400px | Responsive height based on viewport | Better mobile experience |

### Chart Feature Gaps

1. **No watermark/branding** — Add subtle "CSE Dashboard" watermark
2. **No price scale format** — Should show "LKR" prefix for Sri Lankan Rupees
3. **No tooltip customization** — Default lightweight-charts tooltip; could show OHLCV + change
4. **RSI chart not synced on scroll** — Time scale sync only works for range changes, not panning
5. **No dark/light theme adaptation** — Chart is dark-only, breaks in light mode

---

## 6. Quick Wins (< 30 min each)

| # | Fix | File | Time | Impact |
|---|-----|------|------|--------|
| Q1 | Fix candlestick open-price fallback (`?? 0` to `?? item.price ?? 0`) | `cse-data.service.ts:697` | 5 min | Critical — fixes green-only candles |
| Q2 | Repair existing `open=0` data in DB | SQL query | 5 min | Critical — fixes historical charts |
| Q3 | Remove chart gridlines (set `visible: false` for vert, subtle for horiz) | `price-chart.tsx:118-121` | 5 min | High — professional chart appearance |
| Q4 | Add `aria-label` to all icon buttons | `header.tsx` + 5 other files | 30 min | Medium — accessibility |
| Q5 | Add skip-to-content link | `layout.tsx` | 10 min | Medium — accessibility |
| Q6 | Parse and display `price_outlook_3m` as structured card | `journey/page.tsx:441-444` | 30 min | Critical — removes raw JSON display |
| Q7 | Replace emoji `⚠` in risk flags with Lucide icon | `journey/page.tsx:449` | 5 min | Low — consistency |
| Q8 | Extract profit/loss color utility | New `lib/colors.ts` | 20 min | Medium — reduces duplication |
| Q9 | Collapse 5+ risk flags behind "show more" | `journey/page.tsx:446-453` | 20 min | Medium — cleaner display |
| Q10 | Add contextual empty states to Signals + Orders pages | 2 files | 25 min | Medium — better UX |

---

## 7. Phased Implementation Plan

### Phase 1: Critical Data Fixes (Sprint 1 — 1 day)

| Task | Effort | Depends On |
|------|--------|------------|
| Q1: Fix open-price fallback in cse-data.service | 5 min | — |
| Q2: SQL repair for open=0 records | 5 min | Q1 |
| Q6: Parse price_outlook_3m, render structured card | 30 min | — |
| Q3: Professional chart gridlines | 5 min | — |
| C3: Mobile card layout for portfolio holdings table | 2-3 hrs | — |

**Outcome:** Charts show correct red/green candles, AI outlook readable, portfolio usable on mobile.

### Phase 2: Navigation & Mobile UX (Sprint 2 — 2 days)

| Task | Effort | Depends On |
|------|--------|------------|
| H1: Reorganize navigation (25 → ~12 items) | 2-3 hrs | Design decision |
| H6: Full-screen mobile menu | 2-3 hrs | H1 |
| C3: Mobile card layout for stocks + signals tables | 4-6 hrs | — |
| Q4 + Q5: Accessibility quick wins | 40 min | — |

**Outcome:** Clean navigation, proper mobile experience, accessible.

### Phase 3: Design System Consistency (Sprint 3 — 2 days)

| Task | Effort | Depends On |
|------|--------|------------|
| H4: Replace hardcoded colors with semantic vars (top 10 files) | 2 hrs | — |
| H3: Theme-aware chart colors | 1-2 hrs | — |
| M4: Extract shared color utilities | 1 hr | H4 |
| M5: Decompose largest pages (portfolio, journey) | 4-6 hrs | — |
| M8: Empty states for key pages | 1-2 hrs | — |

**Outcome:** Consistent theming, maintainable code, polished empty states.

### Phase 4: Performance & Polish (Sprint 4 — 2-3 days)

| Task | Effort | Depends On |
|------|--------|------------|
| H5: Add TanStack Query (start with Dashboard) | 4-6 hrs | — |
| H7: Define and implement Simple mode enhancements | 4-8 hrs | Design decision |
| M3: Replace console.error with logger | 1 hr | — |
| M7: Font upgrade (Inter → Geist or Instrument Sans) | 15 min | Design decision |
| L2: Keyboard nav in dropdowns | 2 hrs | — |

**Outcome:** Faster navigation, meaningful Simple/Pro split, production-ready logging.

---

## Appendix: Full Inventory

### Pages (26 total, ~16,000 lines)

| Page | Lines | Responsive | Mobile Cards |
|------|-------|-----------|--------------|
| `/` (Dashboard) | 601 | Good | Partial |
| `/journey` | 942 | Good | No tables |
| `/portfolio` | 1,197 | Partial | No (scroll) |
| `/stocks` | 292 | Good | No (scroll) |
| `/stocks/[symbol]` | 793 | Good | No tables |
| `/performance` | 601 | Partial | No (scroll) |
| `/demo` | 580 | Partial | No (scroll) |
| `/demo/performance` | 509 | Partial | No (scroll) |
| `/orders` | 730 | Partial | No (scroll) |
| `/opportunities` | 589 | Partial | No (scroll) |
| `/sectors` | 232 | Good | Grid adapts |
| `/compare` | 415 | Partial | Side-by-side |
| `/dividends` | 373 | Partial | No (scroll) |
| `/shariah` | 391 | Good | No (scroll) |
| `/zakat` | 500 | Good | Form-based |
| `/signals` | 400 | Partial | No (scroll) |
| `/crypto` | 1,150 | Partial | No (scroll) |
| `/chat` | 221 | Good | Chat layout |
| `/news` | 266 | Good | Card layout |
| `/announcements` | 286 | Good | Card layout |
| `/alerts` | 312 | Good | Card layout |
| `/settings` | 498 | Good | Form-based |
| `/admin/financials` | 1,353 | Poor | Admin-only |
| `/backtest` | 652 | Partial | No (scroll) |
| `/login` | 158 | Good | Form-based |

### Components (20 total, ~3,500 lines)

| Component | Lines | Purpose |
|-----------|-------|---------|
| `layout/header.tsx` | 569 | Navigation, controls, mobile menu |
| `layout/app-shell.tsx` | 26 | Page chrome wrapper |
| `charts/price-chart.tsx` | 330 | Candlestick + indicators |
| `market/simple-dashboard.tsx` | 357 | Beginner dashboard view |
| `market/global-indicators.tsx` | 362 | Global market data |
| `market/macro-indicators.tsx` | 359 | Macro economic data |
| `market/daily-brief.tsx` | 183 | AI daily brief card |
| `market/top-stocks-table.tsx` | 98 | Gainers/losers/active table |
| `market/market-stats-card.tsx` | 68 | Volume/turnover/trades |
| `market/index-card.tsx` | 54 | ASPI/S&P20 index card |
| `markdown-renderer.tsx` | 80 | AI content renderer |
| `ui/select.tsx` | 201 | Form select component |
| `ui/table.tsx` | 116 | Base table component |
| `ui/card.tsx` | 105 | Card family components |
| `ui/tabs.tsx` | 82 | Tabs component |
| `ui/button.tsx` | 60 | Button with variants |
| `ui/badge.tsx` | 52 | Badge component |
| `ui/separator.tsx` | 25 | Visual separator |
| `ui/input.tsx` | 20 | Text input |
| `ui/skeleton.tsx` | 13 | Loading skeleton |

### Quality Scores

| Dimension | Score | Notes |
|-----------|-------|-------|
| TypeScript Strictness | 9/10 | Zero `any` types, proper interfaces everywhere |
| Component Organization | 8.5/10 | Clear separation, good naming conventions |
| Responsive Design | 7/10 | Mobile-first header, but tables are desktop-only |
| Accessibility | 6.5/10 | Focus styles work, missing labels and roles |
| CSS/Theme Consistency | 6/10 | System exists but bypassed 400+ times |
| Code Duplication | 7/10 | Color logic repeated, some patterns duplicated |
| Error Handling | 8.5/10 | Promise.allSettled, graceful fallbacks |
| Performance | 6.5/10 | No caching layer, full refetch on navigation |
| Chart Quality | 7/10 | Good library choice, data bug + styling issues |
| Mobile UX | 5.5/10 | Navigation works, tables don't, no bottom nav |

**Overall: 7.1/10** — Strong foundation with specific fixable weaknesses.
