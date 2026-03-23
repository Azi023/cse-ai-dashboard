# Upcoming Tasks

## March 25, 2026 — CBSL Rate Decision
- [ ] Watch for CBSL Monetary Policy Board announcement (OPR decision)
- [ ] Update macro data after announcement:
  ```bash
  curl -X POST http://localhost:3001/api/macro/refresh  # if endpoint exists
  ```
- [ ] Reassess TJL.N0000 purchase timing based on rate decision
  - If OPR cut → positive for equities → consider buying sooner
  - If hold/raise → wait for market reaction before entry

## April 16, 2026 — 20 Trading Days Target
- [ ] Verify scoring engine is fully active (20 market days of data)
  ```bash
  curl -s http://localhost:3001/api/stocks/AEL.N0000/score
  # RSI, SMA20, SMA50, MACD should all be non-null
  ```
- [ ] Check stock scoring leaderboard — top compliant stocks by composite score
- [ ] AI Advisor should now generate real Sonnet-based recommendations (not placeholders)
- [ ] Verify demo account performance tracking: Sharpe ratio should be calculable

## Post April 16 — ATrad Order Execution
- [ ] Run ATrad order execution test with safe limit orders
  - Use smallest quantity possible (1 share) for validation
  - Only after scoring is validated and AI recommendations are trustworthy

## Post April 16 — CFO Meeting Prep
- [ ] Professional polish pass on the dashboard UI
- [ ] Export portfolio performance summary (PDF or screenshot)
- [ ] Review AI recommendation accuracy — did past signals perform?

## Ongoing
- [ ] Shariah Tier 2 screening — import quarterly financial ratios when available
- [ ] ATrad holdings selector fix — post-settlement verification
- [ ] Historical accuracy tracking for AI recommendations
