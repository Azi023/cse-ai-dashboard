# CSE Dashboard — Testing Guide

Five independent tiers. Run top-down; stop at the first failure, fix,
then resume. All tiers complete in ~1 hour.

---

## Tier 1 — Infrastructure (5 min)

```bash
ssh hetzner-vps "pm2 status"
ssh hetzner-vps "tailscale status"
curl -sS https://csedash.xyz/api/atrad/status | jq
```

**Pass when:** 4 PM2 processes online; tailnet shows phone + VPS; atrad
status returns HTTP 200 with a recent `lastSynced` timestamp.

---

## Tier 2 — Auth + persistence (1 min, automated)

```bash
./scripts/verify-auth.sh
```

**Pass when:** login → cookie → `/auth/me` → protected endpoint all
return HTTP 200. Failure usually means VPS `DASHBOARD_*` creds or
`API_SECRET_KEY` drifted from local.

---

## Tier 3 — Data pipeline (5 min, observational)

```bash
ssh hetzner-vps "sudo -u postgres psql -d cse_dashboard <<'SQL'
SELECT trade_date, COUNT(*) FROM daily_prices
  WHERE trade_date >= CURRENT_DATE - 7
  GROUP BY trade_date ORDER BY trade_date DESC;
SELECT date, total_trades, aspi_close FROM market_snapshots
  WHERE date >= CURRENT_DATE - 7 ORDER BY date DESC;
SELECT date, COUNT(*) FROM technical_signals
  WHERE date >= CURRENT_DATE - 7 GROUP BY date ORDER BY date DESC;
SELECT date, COUNT(*) FROM stock_scores
  WHERE date >= CURRENT_DATE - 7 GROUP BY date ORDER BY date DESC;
SQL"
```

**Pass when:** only trading days have rows (no entries on weekends or
public holidays). If you see a Saturday/Sunday row,
`TradingCalendarService` needs inspection.

---

## Tier 4 — Feature tests (30 s, automated)

```bash
./scripts/test-features.sh
```

Hits 15 critical endpoints (stocks, market, signals, portfolio, atrad,
crypto ticker + DCA, paper trading both portfolios, debates both
routes, auth/me, journey KPIs, token usage).

**Pass when:** "All 15 tests passed." Any failure prints the route and
HTTP code — investigate that endpoint first.

---

## Tier 5 — UX smoke test (15 min, manual)

Log in at `https://csedash.xyz/login`, then walk this sequence at
1280 px, 1440 px, and 1920 px widths:

1. `/` (dashboard) — nav bar visible, "This week's debates" widget renders (or is absent with no error).
2. `/stocks` — list loads, filter works, click any row.
3. `/stocks/[symbol]` — detail page, scroll to bottom: Debate panel renders ("No debate run yet" is acceptable until Friday).
4. `/portfolio` — holdings + P&L match ATrad status.
5. `/journey` — **Total Deposited = LKR 20,000** exactly (not 25,944). No emoji in KPI labels. Geist font rendering (not Inter).
6. `/signals` — at least one signal, no console errors.
7. `/backtest` — form + 3 strategies in dropdown.
8. `/crypto` — BTC + ETH tickers live, **DCA panel at bottom** with 2 seeded plans (BTC $50/wk, ETH $25/wk), pause/resume/delete buttons work.
9. `/demo` — paper-trading UI, buy/sell buttons reachable.
10. `/settings` — Shariah toggle persists on reload.
11. `/news` — RSS items load.
12. `/alerts` — bell opens, list loads.

**Pass when:** every page renders without client-side errors in console,
nav bar never cuts icons off, no Lorem ipsum / "$0" placeholders.

---

## CI/CD — auto-deploy on push

The GitHub Actions workflow at `.github/workflows/deploy.yml` runs on
every push to `master`:

1. Typecheck both backend + frontend (fail-fast if either broken).
2. Rsync both src trees to the VPS.
3. SSH to VPS: `npm ci` → `npm run build` → `pm2 restart` for each half.
4. Smoke test `/api/atrad/status` — HTTP 200 required, fails the
   deployment otherwise.

Required repo secrets (Settings → Secrets → Actions):

| Secret | Example | Notes |
|---|---|---|
| `VPS_HOST` | `195.201.33.87` | IP of the Hetzner VPS |
| `VPS_USER` | `root` | SSH login user |
| `VPS_SSH_KEY` | `-----BEGIN…` | Private ed25519 key, matching a line in VPS `/root/.ssh/authorized_keys` |
| `VPS_APP_DIR` | `/opt/cse-ai-dashboard` | Where the project lives on the VPS |

### First-time setup on the VPS (one-shot)

```bash
ssh hetzner-vps
sudo -u root ssh-keygen -t ed25519 -f /root/.ssh/github_deploy -N "" -C "github-actions@csedash"
cat /root/.ssh/github_deploy.pub >> /root/.ssh/authorized_keys
cat /root/.ssh/github_deploy   # paste THIS (private key) into VPS_SSH_KEY secret
```

### Trigger a deploy manually

- Any push to `master`
- Or click "Run workflow" in the Actions tab (workflow_dispatch)

### When CI fails

- **Typecheck stage:** run `npx tsc --noEmit` locally in `src/backend` or
  `src/frontend` to reproduce.
- **Deploy stage:** SSH into the VPS, run `cd /opt/cse-ai-dashboard/src/backend && npm run build`
  manually — the error surfaces there.
- **Smoke test stage:** the backend booted but the endpoint 5xx-ed.
  Check `pm2 logs cse-backend --lines 50`.
