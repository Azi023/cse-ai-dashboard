# CSE AI Dashboard — Lessons Learned

## TypeORM Patterns

### findOne() requires where clause
**Rule:** TypeORM 0.3+: `findOne()` REQUIRES a `where` clause.
**Wrong:** `findOne({ order: { created_at: 'DESC' } })`
**Right:** `find({ order: { created_at: 'DESC' }, take: 1 })` then `[0]`
**Why:** TypeORM throws a hard error without `where` in findOne().

### Between() type cast
**Rule:** `Between()` in TypeORM requires explicit `as unknown as T` cast for date columns.
**Example:** `summary_date: Between(new Date(start), new Date(end)) as unknown as Date`

### Nullable string columns MUST have explicit type:'varchar'
**Rule:** Any `@Column` with a `string | null` TypeScript type MUST specify `type: 'varchar'` explicitly.
**Wrong:** `@Column({ length: 50, nullable: true }) source: string | null;`
**Right:** `@Column({ type: 'varchar', length: 50, nullable: true }) source: string | null;`
**Why:** TypeORM with `emitDecoratorMetadata` emits `Object` at runtime for union types (`string | null`).
Without explicit `type`, TypeORM sees `Object` and throws `DataTypeNotSupportedError` on startup —
crashing the entire backend before any DB queries run. Data is safe but ALL endpoints return nothing.
**Applies to:** Any nullable column: `string | null`, `number | null` without a clearly-inferrable type.
Safe: `number | null` with `type: 'decimal'`, `Date | null` with `type: 'timestamp'`, `object | null` with `type: 'jsonb'`.

---

## ATrad Dojo UI Patterns

### Login selectors (confirmed)
- Username: `#txtUserName`
- Password: `#txtPassword`
- Login button: `#btnSubmit`

### Client menu navigation
- Client menu: `#dijit_PopupMenuBarItem_4`
- Stock Holding item: `#dijit_MenuItem_40`
- Account Summary item: `#dijit_MenuItem_41`
- Account balance IDs: `txtAccSumaryCashBalance`, `txtAccSumaryBuyingPowr`

### Holdings API
- POST `/atsweb/client` with `action=getStockHolding&exchange=CSE&broker=FWS&stockHoldingClientAccount=128229LI0&format=json`
- **Leave `stockHoldingSecurity` EMPTY for all-holdings query**
- ATrad returns single-quote JSON — normalize before `JSON.parse()`
- `#gridContainer4 table` is the MARKET WATCH table, NOT holdings
- `portfolios: []` returned pre-T+2 settlement — wait until settlement day

### Account Value bug
- ATrad returns account number (128229050000) in adjacent field
- Filter: any value > 50,000,000 is implausible for retail account
- Use specific element IDs instead of text parsing when possible

---

## CSE API

### Field naming
- Redis cache field names: `price` and `change` (NOT `lastTradedPrice` / `priceChange`)
- Market summary endpoint: `marketSummery` (CSE typo — keep as-is in our code)
- Trade summary: `reqTradeSummery` array with `symbol`, `price`, `change` fields

### API characteristics
- 22 POST endpoints at `https://www.cse.lk/api/*` — no auth needed
- `tradeSummary` returns all 296 stocks
- Keep polling intervals at 5+ minutes minimum

---

## AI / Claude API

### Model selection
- Haiku (`claude-haiku-4-5-20251001`): digests, simple summaries (~$0.01/call)
- Sonnet (`claude-sonnet-4-6`): weekly briefs, recommendations, deep analysis (~$0.05/call)
- Auto-downgrade Sonnet → Haiku when monthly token budget > 500K

### Response format
- Always request raw JSON (no markdown code fences) for structured data
- Parse token usage: `response.usage.input_tokens + response.usage.output_tokens`

### Caching TTLs
- Daily brief: 4h (`ai:daily-brief:cache`)
- EOD signals: 20h
- Daily digest: 24h
- Weekly brief: 7d

---

## UI/UX Rules

### P&L Display
- NEVER show -100% P&L when portfolio has no holdings
- Show "T+2 pending settlement" message instead
- Guard `formatLKR()` and `formatPct()` against null/undefined inputs

### Number formatting
- Use central `formatLKR()` / `formatPct()` utilities — never raw `.toFixed()` or `.toLocaleString()`
- These guard against NaN, null, undefined, string inputs

---

## NestJS / Architecture

### Module registration
- Always export services needed by other modules in the `exports` array
- Register new entities in TypeOrmModule.forFeature() within the module
- `autoLoadEntities: true` in app.module.ts handles global entity registration

### Cron scheduling
- All times in UTC — add note of SLT equivalent in comments
- SLT = UTC+5:30, so: 9:10 AM UTC = 2:40 PM SLT

---

## Git Workflow

### Pre-commit checklist
- [ ] No `.env` files staged
- [ ] No `data/atrad-sync/*.html` or `*.png` screenshots staged
- [ ] No `data/tracking/` directory staged
- [ ] `npx tsc --noEmit` passes with 0 errors
