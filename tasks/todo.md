# CSE AI Dashboard — Task Tracker

## Phase 1: PM2 Setup + Stability

### Task 1.1: PM2 Process Management
- [x] Install PM2 globally (`npm install -g pm2`)
- [x] Create `ecosystem.config.js` in project root
- [ ] Start backend via PM2 (`pm2 start ecosystem.config.js --only cse-backend`)
- [ ] Start frontend via PM2 (`pm2 start ecosystem.config.js --only cse-frontend`)
- [ ] Verify both running (`pm2 status`)
- [ ] Save PM2 config (`pm2 save`)
- [ ] Configure PM2 startup (`pm2 startup`)

### Task 1.2: ATrad Holdings Verification (Post T+2 Settlement)
- [ ] Run recon script: `cd src/backend && npx tsx ../../scripts/atrad-recon.ts`
- [ ] Check if 200 AEL.N0000 shares appear in `portfolios` array
- [ ] If holdings appear: wire into `atrad-browser.ts` production sync
- [ ] Fix Account Value implausible number bug (filter values > 50M)

### Task 1.3: Verify Cron Jobs
- [ ] Observe backend logs for one full market day
- [ ] Confirm: preMarketWarmup (9:25), polling (9:30-14:30), postCloseSnapshot (14:35), dailyDigest (14:45)
- [ ] Confirm: ZERO polling after 14:35 except news (until 20:00) and announcements (18:00)

---

## Phase 2: AI Analysis Pipeline

### Task 2.1: Data Accumulation Service
- [x] Create `market_snapshot` entity
- [x] Create `portfolio_snapshot` entity
- [x] Create `weekly_metric` entity
- [x] Create `AnalysisService` with `saveMarketSnapshot()` (2:40 PM SLT cron)
- [x] Create `AnalysisService` with `savePortfolioSnapshot()` (2:40 PM SLT cron)
- [x] Create `AnalysisService` with `calculateWeeklyMetrics()` (Fri 2:50 PM SLT cron)
- [x] Create `AnalysisController` with GET endpoints
- [x] Create `AnalysisModule` and register in `AppModule`
- [ ] Verify TypeScript compiles (`npx tsc --noEmit`)
- [ ] Test endpoints: `GET /api/analysis/snapshot/latest`, `GET /api/analysis/snapshots`

### Task 2.2: Stock Scoring Engine
- [x] Create `stock_score` entity
- [x] Create `ScoringService` with deterministic composite scoring
  - Dividend yield: 30%, Price momentum: 20%, Volume trend: 10%
  - Volatility: 15%, Sector strength: 15%, Liquidity: 10%
- [x] Add cron: runs daily at 2:42 PM SLT (after market snapshot)
- [x] Placeholder scores when < 20 days data accumulated
- [x] Only score Shariah-compliant + pending stocks
- [x] Expose GET `/api/analysis/scores` endpoint
- [ ] Verify TypeScript compiles

### Task 2.3: AI Investment Recommendation (Weekly)
- [x] Create `ai_recommendation` entity
- [x] Add `generateWeeklyRecommendation()` to AnalysisService
- [x] Runs Friday 2:55 PM SLT (after scoring)
- [x] Claude Sonnet prompt: top 10 scored stocks, portfolio, week snapshots
- [x] JSON output: recommended_stock, confidence, reasoning, price_outlook_3m, risk_flags
- [x] Save to DB + create alert notification
- [x] Expose GET `/api/analysis/recommendation` endpoint
- [ ] Verify TypeScript compiles

### Task 2.4: Dashboard Integration (Journey Page + Stocks Page)
- [x] Add "AI Advisor" card to Journey page with:
  - Latest recommendation + confidence badge
  - Data accumulation status indicator
  - Top 5 stocks by composite score
- [x] Add score column to Stocks page table
- [ ] Verify frontend builds without console errors

### Task 2.5: Enhanced Notifications
- [x] Daily digest: portfolio P&L per holding, flag >5% drops, ASPI >3% crash alert
- [x] Weekly brief: include AI recommendation, top 5 scores, WoW portfolio comparison
- [ ] Verify TypeScript compiles

---

## Final Verification Checklist
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `GET /api/analysis/snapshot/latest` — responds 200
- [ ] `GET /api/analysis/scores` — responds 200
- [ ] `GET /api/analysis/recommendation` — responds 200
- [ ] `GET /api/notifications/daily-digest` — responds 200
- [ ] `GET /api/notifications/weekly-brief` — responds 200
- [ ] Frontend loads without console errors
- [ ] PM2 shows both processes as "online"
- [ ] Git commit all changes

---

## Review Notes
_(Add post-implementation notes here)_
