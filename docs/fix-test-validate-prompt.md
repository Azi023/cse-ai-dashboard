# CSE Dashboard — Fix, Test & Validate Everything

⚠️ CRITICAL: `.env` must NEVER be touched, modified, read, or deleted under ANY circumstances. ⚠️
⚠️ SAFETY: Do NOT delete any database tables or production data. ⚠️

Read `CLAUDE.md` first for full project context.

---

## Execution Rules

1. Complete tasks IN ORDER
2. After EACH task: `npx tsc --noEmit` on both backend and frontend
3. Commit after every successful task
4. If a task fails after 3 attempts, log in `tasks/fix-test-validate-report.md` and SKIP
5. Do NOT ask for input — make reasonable decisions and document
6. Log progress to `tasks/fix-test-validate-report.md` as you go

---

## TASK 1: Fix Global Market Indicators — Stale Data (25 min)

### Problem
Global Market Indicators shows "Updated Mar 10, 2026" — 12 days stale. Oil, Gold, USD/LKR, S&P 500 all show 0.00% change. The external data fetcher is broken or not running.

### Fix

1. Find the global/external market data service:
```bash
grep -rn "global.*market\|external.*market\|yahoo\|exchange.*rate\|brent\|gold\|xau\|oil.*price\|s.p.*500\|sp500" src/backend/src/ --include="*.ts" | grep -v node_modules
```

2. Find the cron job that fetches this data:
```bash
grep -rn "@Cron" src/backend/src/ --include="*.ts" | grep -i "global\|external\|forex\|commodity"
```

3. Diagnose WHY it stopped:
   - Is the API endpoint returning errors? Test manually:
   ```bash
   # Test exchange rate API
   curl -s "https://api.exchangerate-api.com/v4/latest/USD" | python3 -c "import json,sys; d=json.load(sys.stdin); print('USD/LKR:', d['rates'].get('LKR','N/A'))"
   
   # Test if Yahoo Finance or alternative commodity API works
   curl -s "https://query1.finance.yahoo.com/v8/finance/chart/CL=F?interval=1d&range=1d" -H "User-Agent: Mozilla/5.0" | head -c 500
   ```
   - Is the cron schedule wrong?
   - Is there an error in the service that silently fails?

4. Fix the fetcher. If the original API is broken, use alternatives:
   - USD/LKR: `https://api.exchangerate-api.com/v4/latest/USD` (free, no key)
   - Oil (Brent): Try `https://api.commodities-api.com/` or extract from a free finance API
   - Gold: Same source as oil
   - S&P 500: Try Yahoo Finance chart API or a free alternative
   
   If free APIs for commodities are unreliable, at minimum fix USD/LKR (which has a reliable free API) and add a note "Commodity data updates during market hours" for the others.

5. Ensure the cron runs AT LEAST twice daily (morning + evening):
```typescript
@Cron('0 4,12 * * 1-5')  // 9:30 AM + 5:30 PM SLT on weekdays
```

6. After fixing, trigger a manual refresh:
```bash
curl -s -X POST http://localhost:3001/api/market/refresh-global | python3 -m json.tool
# Or whatever the refresh endpoint is called
```

7. Verify the dashboard shows updated data with today's date.

---

## TASK 2: Fix Simple Mode "What the AI Thinks" (20 min)

### Problem
The Simple Mode dashboard shows raw AI output in "What the AI Thinks":
```
"MARKET PULSE — 22 Mar 2026 Sentiment: NEUTRAL *(data-constrained session)* --- 
1. Index Review ⚠️ DATA UNAVAILABLE — ASPI, S&P SL20 closing levels..."
```

This is the raw Pro-mode AI brief dumped into Simple mode. A beginner user would be confused and alarmed by "DATA UNAVAILABLE" and technical jargon.

### Fix

1. Find the Simple Mode dashboard component:
```bash
grep -rn "simple.*dashboard\|SimpleDashboard\|What the AI Thinks\|aiThinks" src/frontend/src/ --include="*.tsx"
```

2. The "What the AI Thinks" section needs to:
   a. Extract ONLY the actionable insight from the AI brief (not the full technical report)
   b. If the brief contains "DATA UNAVAILABLE" or "data-constrained", show a friendly fallback instead

3. Implement a content simplifier:

```tsx
function simplifyAIBrief(rawBrief: string): { summary: string; opportunities: string[]; risks: string[] } {
  // If brief is empty or data-constrained, return friendly default
  if (!rawBrief || rawBrief.includes('DATA UNAVAILABLE') || rawBrief.includes('data-constrained')) {
    return {
      summary: "The market is closed today. The AI will provide a fresh analysis when trading resumes on Monday.",
      opportunities: [],
      risks: []
    };
  }
  
  // Extract key sections
  // Look for "Trading Thesis" or "Base case" for the main summary
  // Look for "Opportunities" section
  // Look for "Key Risks" section
  
  // Strip markdown formatting (**, ##, ---, |pipes|)
  // Convert to plain English sentences
  // Cap at 3-4 sentences max
  
  // Extract sentiment (BULLISH/NEUTRAL/BEARISH) and translate:
  // BULLISH → "The AI sees positive signs in the market"
  // NEUTRAL → "The market is steady — no major changes expected"  
  // BEARISH → "The AI sees some caution signs — but this is normal market behavior"
  
  let summary = rawBrief;
  
  // Try to find the trading thesis / base case
  const thesisMatch = rawBrief.match(/Base case.*?:(.*?)(?=Bull|Bear|Risk|\n\n)/s);
  if (thesisMatch) {
    summary = thesisMatch[1].trim();
  }
  
  // Strip markdown
  summary = summary
    .replace(/\*\*/g, '')
    .replace(/#{1,3}\s/g, '')
    .replace(/\|[^|]*\|/g, '')
    .replace(/---+/g, '')
    .replace(/⚠️/g, '')
    .trim();
  
  // Truncate to ~200 chars with ellipsis
  if (summary.length > 250) {
    summary = summary.substring(0, 247) + '...';
  }
  
  return { summary, opportunities: [], risks: [] };
}
```

4. In the Simple Dashboard, replace the raw brief display with:

```tsx
{(() => {
  const simplified = simplifyAIBrief(briefContent);
  return (
    <div>
      <p className="text-foreground leading-relaxed">{simplified.summary}</p>
      {simplified.opportunities.length > 0 && (
        <div className="mt-3">
          <p className="font-medium text-sm text-emerald-600">Opportunities to watch:</p>
          {simplified.opportunities.map((opp, i) => (
            <p key={i} className="text-sm text-muted-foreground ml-2">• {opp}</p>
          ))}
        </div>
      )}
    </div>
  );
})()}
```

5. Test: Switch to Simple Mode, verify "What the AI Thinks" shows friendly text, not raw markdown.

---

## TASK 3: Test & Validate Goal-Setting Features (20 min)

### Problem
The Journey page has goal templates ("Emergency Fund Portfolio", "Grow Monthly SIP", "15% Return Target") and a "Set Goal" button — but these haven't been verified to work.

### Test Procedure

1. Find the goal-related code:
```bash
grep -rn "goal\|Goal\|investment.*goal\|target.*return" src/backend/src/ --include="*.ts" | grep -v node_modules | head -20
grep -rn "goal\|Goal\|setGoal\|goalTemplate" src/frontend/src/ --include="*.tsx" | head -20
```

2. Check if the backend has goal endpoints:
```bash
curl -s http://localhost:3001/api/goals 2>/dev/null | head -c 200
curl -s http://localhost:3001/api/journey/goals 2>/dev/null | head -c 200
curl -s http://localhost:3001/api/portfolio/goals 2>/dev/null | head -c 200
```

3. **Test "Use this template →" links:**
   - Check what happens when a template is clicked
   - If it calls a POST endpoint, test it:
   ```bash
   curl -s -X POST http://localhost:3001/api/goals \
     -H "Content-Type: application/json" \
     -d '{"name":"Emergency Fund Portfolio","target_value":500000,"target_date":"2029-03-22","type":"portfolio_value"}' | python3 -m json.tool
   ```
   - If it creates a record, verify it shows on the Journey page
   - If the endpoint doesn't exist, document this as "UI only — backend not implemented"

4. **Test "+ Set Goal" button:**
   - Does it open a modal/form?
   - Can you create a custom goal?
   - Does the goal persist after page refresh?

5. **Test "Record This Month's Deposit" button:**
   ```bash
   # Find the endpoint
   grep -rn "deposit\|recordDeposit\|monthly.*deposit" src/backend/src/ --include="*.ts" | head -10
   ```
   - Click it and verify it records a deposit
   - Check if the journey page updates the "Total Deposited" value
   - If it creates a form, test with: amount LKR 10,000, date today

6. **Document results** in `tasks/fix-test-validate-report.md`:
   - Which features work end-to-end
   - Which are UI-only (no backend)
   - Which have bugs

7. **Fix any broken features:**
   - If goal creation endpoint is missing, create a simple one
   - If deposit recording doesn't work, fix it
   - If templates don't create goals, wire them up

---

## TASK 4: Fix AI Brief Rendering on Pro Dashboard (15 min)

### Problem
The Pro dashboard AI Market Brief on a non-trading day (Sunday) shows "DATA UNAVAILABLE" warnings throughout. While technically correct, the presentation should be cleaner.

### Fix

1. When the brief contains "DATA UNAVAILABLE" or "data-constrained session":
   - Add a banner at the TOP of the brief section:
   ```
   ℹ️ Market is closed today. This analysis uses the most recent available data.
   Real-time data resumes Monday 9:30 AM.
   ```
   - Keep the full analysis below (Pro users want the detail) but the banner sets expectations

2. The macro dashboard table in the brief now renders properly (from our earlier markdown fix), but verify:
   - Open the dashboard in Pro mode
   - Check that the "5. Macro Dashboard" section shows a proper HTML table
   - If still showing pipe-separated text, the markdown renderer component isn't being used here

3. Check if the MarkdownRenderer component created earlier is used in the brief:
```bash
grep -rn "MarkdownRenderer\|ReactMarkdown\|react-markdown" src/frontend/src/app/page.tsx
grep -rn "MarkdownRenderer\|ReactMarkdown\|react-markdown" src/frontend/src/components/ --include="*.tsx"
```
   If the main dashboard brief section isn't using it, replace the plain text rendering with the MarkdownRenderer.

---

## TASK 5: Validate Real-Time Data Pipeline (15 min)

Verify that all data sources are actually live and updating:

```bash
echo "=== DATA FRESHNESS AUDIT ===" > /tmp/data-freshness.txt

# 1. CSE Market Data (should be from last trading day - Friday Mar 20)
echo "--- CSE Market Data ---" >> /tmp/data-freshness.txt
curl -s http://localhost:3001/api/market/summary | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('ASPI:', d.get('aspiValue', 'N/A'))
print('Timestamp:', d.get('timestamp', d.get('updated_at', 'N/A')))
" >> /tmp/data-freshness.txt 2>&1

# 2. Stock prices (check a few stocks)
echo "--- Stock Prices ---" >> /tmp/data-freshness.txt
for sym in AEL.N0000 TJL.N0000 TKYO.X0000; do
  curl -s "http://localhost:3001/api/stocks/$sym" 2>/dev/null | python3 -c "
import json,sys
try:
  d=json.load(sys.stdin)
  print(f'$sym: price={d.get(\"lastTradedPrice\", d.get(\"price\", \"N/A\"))}, updated={d.get(\"updated_at\", \"N/A\")}')
except: print('$sym: endpoint error')
" >> /tmp/data-freshness.txt 2>&1
done

# 3. News freshness
echo "--- News ---" >> /tmp/data-freshness.txt
curl -s http://localhost:3001/api/news 2>/dev/null | python3 -c "
import json,sys
try:
  d=json.load(sys.stdin)
  items = d if isinstance(d, list) else d.get('items', d.get('articles', []))
  if items:
    print(f'Latest: {items[0].get(\"title\", \"?\")[:60]}')
    print(f'Date: {items[0].get(\"published_at\", items[0].get(\"date\", \"N/A\"))}')
    print(f'Total: {len(items)} articles')
except: print('News endpoint error')
" >> /tmp/data-freshness.txt 2>&1

# 4. AI Brief freshness
echo "--- AI Brief ---" >> /tmp/data-freshness.txt
curl -s http://localhost:3001/api/ai/brief 2>/dev/null | python3 -c "
import json,sys
try:
  d=json.load(sys.stdin)
  content = d.get('content', d.get('brief', ''))[:100]
  print(f'Brief preview: {content}')
  print(f'Generated: {d.get(\"generated_at\", d.get(\"created_at\", \"N/A\"))}')
except: print('Brief endpoint error')
" >> /tmp/data-freshness.txt 2>&1

# 5. Macro data
echo "--- Macro Data ---" >> /tmp/data-freshness.txt
curl -s http://localhost:3001/api/macro 2>/dev/null | python3 -c "
import json,sys
try:
  d=json.load(sys.stdin)
  items = d if isinstance(d, list) else [d]
  for item in items[:3]:
    print(f'{item.get(\"indicator\",\"?\")}: {item.get(\"value\",\"?\")} (date: {item.get(\"date\",\"?\")})')
except: print('Macro endpoint error')
" >> /tmp/data-freshness.txt 2>&1

# 6. Global market data
echo "--- Global Market ---" >> /tmp/data-freshness.txt
curl -s http://localhost:3001/api/market/global 2>/dev/null | python3 -c "
import json,sys
try:
  d=json.load(sys.stdin)
  print(json.dumps(d, indent=2)[:500])
except: print('Global market endpoint error')
" >> /tmp/data-freshness.txt 2>&1

# 7. ForexFactory events
echo "--- ForexFactory Events ---" >> /tmp/data-freshness.txt
curl -s http://localhost:3001/api/news/calendar 2>/dev/null | python3 -c "
import json,sys
try:
  d=json.load(sys.stdin)
  items = d if isinstance(d, list) else d.get('events', [])
  print(f'Upcoming events: {len(items)}')
  for e in items[:3]:
    print(f'  {e.get(\"date\",\"?\")}: {e.get(\"title\",e.get(\"event\",\"?\"))} ({e.get(\"impact\",\"?\")})')
except: print('Calendar endpoint error')
" >> /tmp/data-freshness.txt 2>&1

# 8. Daily prices accumulation
echo "--- Price History ---" >> /tmp/data-freshness.txt
curl -s http://localhost:3001/api/market/snapshot 2>/dev/null | python3 -c "
import json,sys
try:
  d=json.load(sys.stdin)
  print(f'Snapshots: {d}')
except: print('Snapshot endpoint error')
" >> /tmp/data-freshness.txt 2>&1

cat /tmp/data-freshness.txt
```

For any data source that's stale or returning errors:
- Diagnose the root cause
- Fix if possible (broken URL, wrong API key, cron not running)
- Document in report if unfixable (e.g., API requires paid subscription)

---

## TASK 6: Hardcoded Dark Color Audit (20 min)

### Find and fix all hardcoded dark-mode colors

```bash
cd ~/workspace/cse-ai-dashboard/src/frontend/src

# Find hardcoded dark backgrounds
echo "=== Hardcoded bg colors ===" 
grep -rn "bg-gray-900\|bg-gray-800\|bg-slate-900\|bg-slate-800\|bg-zinc-900\|bg-neutral-900\|bg-\[#0A0E17\]\|bg-\[#111827\]" --include="*.tsx" | grep -v node_modules | grep -v "dark:"

# Find hardcoded text colors  
echo "=== Hardcoded text colors ==="
grep -rn 'className="[^"]*text-white[^"]*"' --include="*.tsx" | grep -v node_modules | grep -v "dark:" | grep -v "btn\|button\|Badge"

# Find hardcoded border colors
echo "=== Hardcoded border colors ==="
grep -rn "border-gray-700\|border-gray-800\|border-slate-700\|border-\[#1F2937\]" --include="*.tsx" | grep -v node_modules | grep -v "dark:"
```

For EACH match:
- Open the file, check context
- If it's a standalone color (not inside a `dark:` conditional), replace:
  - `bg-gray-900` / `bg-slate-900` → `bg-background`
  - `bg-gray-800` / `bg-slate-800` → `bg-card` or `bg-muted`
  - `text-white` (standalone) → `text-foreground`
  - `text-gray-400` → `text-muted-foreground`
  - `border-gray-700` / `border-gray-800` → `border-border`

- Do NOT change:
  - Colors inside `dark:` prefix (e.g., `dark:bg-gray-900` is correct)
  - Button/badge colors that should be fixed (e.g., green approve button)
  - SVG/chart inline colors

After all fixes, toggle between light and dark mode on EVERY page and verify nothing is invisible (white on white, black on black).

---

## TASK 7: Portfolio Health Score Validation (10 min)

The Journey page shows Portfolio Health with these scores:
- Diversification: 20/100 (red) — "Highly concentrated"
- Shariah Compliance: 100/100 (green) — "Fully Shariah compliant"
- Risk Level: 75/100 (blue) — "Moderate risk"
- Cost Efficiency: 35/100 (red) — "Slight loss"
- Consistency: 30/100 (red) — "Building habit"

### Validate these are computed correctly:

1. Find the health score calculation:
```bash
grep -rn "portfolio.*health\|health.*score\|diversification.*score\|consistency" src/backend/src/ --include="*.ts" | head -15
```

2. Check each metric:
   - **Diversification 20/100**: User has 1 stock (AEL) — low diversification is CORRECT
   - **Shariah 100/100**: AEL is COMPLIANT — CORRECT
   - **Risk Level 75/100**: Should reflect volatility and position sizing — verify formula
   - **Cost Efficiency 35/100**: User is at -5.4% loss — "slight loss" at 35 seems about right
   - **Consistency 30/100**: User has made 1 deposit in 1 month — "building habit" is CORRECT

3. If any score seems wrong, trace the calculation and fix it

4. Document the scoring formula in the report for transparency

---

## TASK 8: Generate Comprehensive Test Report (10 min)

Create `tasks/fix-test-validate-report.md`:

```markdown
# Fix, Test & Validate Report — March 22, 2026

## Data Freshness Status
| Source | Last Updated | Status | Notes |
|--------|-------------|--------|-------|
| CSE Market (ASPI) | | ✅/❌ | |
| Stock Prices | | ✅/❌ | |
| Global Markets (Oil, Gold, FX) | | ✅/❌ | |
| News (RSS) | | ✅/❌ | |
| AI Brief | | ✅/❌ | |
| Macro Data (CBSL) | | ✅/❌ | |
| ForexFactory Calendar | | ✅/❌ | |

## Feature Test Results
| Feature | Status | Notes |
|---------|--------|-------|
| Goal templates (Emergency Fund) | ✅/❌/UI-only | |
| Goal templates (Grow Monthly SIP) | ✅/❌/UI-only | |
| Goal templates (15% Return) | ✅/❌/UI-only | |
| Custom goal creation (+ Set Goal) | ✅/❌/UI-only | |
| Record monthly deposit | ✅/❌ | |
| Simple mode AI brief | ✅/❌ | |
| Pro mode AI table rendering | ✅/❌ | |
| Portfolio health scores | ✅/❌ | |

## Fixes Applied
(list each fix with file and description)

## Remaining Issues
(anything that couldn't be fixed)
```

Then:
```bash
cd ~/workspace/cse-ai-dashboard
git add -A
git commit -m "fix: global data staleness, simple mode AI brief, goal validation, color audit, data freshness"
git push
```

⚠️ CRITICAL: `.env` must NEVER be touched, modified, read, or deleted under ANY circumstances. ⚠️
