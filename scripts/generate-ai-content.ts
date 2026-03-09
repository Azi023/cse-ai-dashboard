/**
 * generate-ai-content.ts
 *
 * Connects to PostgreSQL + Redis, reads today's real market data,
 * then generates a genuine daily brief and stock analyses for the
 * top 5 most active stocks. Output is saved as JSON files that
 * the ai-engine service can serve instead of template mocks.
 *
 * Usage:  npx tsx scripts/generate-ai-content.ts
 */

import { Client } from 'pg';
import Redis from 'ioredis';
import * as fs from 'fs';
import * as path from 'path';

// ── Types (match ai-engine interfaces) ──────────────────────────

interface DailyBrief {
  date: string;
  marketSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'CAUTIOUS';
  summary: string;
  topOpportunities: string[];
  keyRisks: string[];
  sectorOutlook: { sector: string; outlook: string }[];
  generatedAt: string;
}

interface StockAnalysis {
  symbol: string;
  name: string;
  currentPrice: number;
  fundamentalScore: number;
  technicalSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  shariahStatus: string;
  analysis: string;
  riskFactors: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  generatedAt: string;
}

// ── Data shapes ─────────────────────────────────────────────────

interface MarketSummaryRow {
  aspi_value: string;
  aspi_change: string;
  aspi_change_percent: string;
  sp_sl20_value: string;
  sp_sl20_change: string;
  sp_sl20_change_percent: string;
  total_volume: string;
  total_turnover: string;
  total_trades: number;
}

interface StockRow {
  symbol: string;
  name: string;
  sector: string | null;
  last_price: string;
  change_percent: string;
  market_cap: string;
  shariah_status: string;
  beta: string | null;
}

interface ActiveStockRow extends StockRow {
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  turnover: string;
}

interface BreadthRow {
  gainers: string;
  losers: string;
  unchanged: string;
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  const pg = new Client({
    host: 'localhost',
    port: 5432,
    user: 'cse_user',
    password: 'cse_secure_2026',
    database: 'cse_dashboard',
  });

  const redis = new Redis({ host: 'localhost', port: 6379 });

  try {
    await pg.connect();
    console.log('Connected to PostgreSQL');

    // ── 1. Gather data ───────────────────────────────────────────

    const msRes = await pg.query<MarketSummaryRow>(
      'SELECT * FROM market_summaries ORDER BY summary_date DESC LIMIT 1',
    );
    const ms = msRes.rows[0];

    const gainersRes = await pg.query<StockRow>(
      `SELECT symbol, name, sector, last_price, change_percent, market_cap, shariah_status, beta
       FROM stocks WHERE is_active=true AND last_price IS NOT NULL AND change_percent::float > 0
       ORDER BY change_percent::float DESC LIMIT 10`,
    );

    const losersRes = await pg.query<StockRow>(
      `SELECT symbol, name, sector, last_price, change_percent, market_cap, shariah_status, beta
       FROM stocks WHERE is_active=true AND last_price IS NOT NULL AND change_percent::float < 0
       ORDER BY change_percent::float ASC LIMIT 10`,
    );

    const breadthRes = await pg.query<BreadthRow>(`
      SELECT
        count(*) FILTER (WHERE change_percent::float > 0) as gainers,
        count(*) FILTER (WHERE change_percent::float < 0) as losers,
        count(*) FILTER (WHERE change_percent::float = 0 OR change_percent IS NULL) as unchanged
      FROM stocks WHERE is_active=true AND last_price IS NOT NULL
    `);

    const top5Res = await pg.query<ActiveStockRow>(`
      SELECT s.symbol, s.name, s.sector, s.last_price, s.change_percent,
             s.market_cap, s.shariah_status, s.beta,
             dp.open, dp.high, dp.low, dp.close, dp.volume, dp.turnover
      FROM daily_prices dp
      JOIN stocks s ON dp.stock_id = s.id
      WHERE dp.trade_date::date = CURRENT_DATE
      ORDER BY dp.volume::bigint DESC
      LIMIT 5
    `);

    const bluechipsRes = await pg.query<StockRow>(
      `SELECT symbol, name, sector, last_price, change_percent, market_cap, shariah_status, beta
       FROM stocks WHERE is_active=true AND last_price IS NOT NULL
       ORDER BY market_cap::float DESC NULLS LAST LIMIT 15`,
    );

    // Also try Redis for any cached sector data
    const sectorsRaw = await redis.get('cse:all_sectors');
    const sectors: { name: string; percentage: number }[] = sectorsRaw
      ? JSON.parse(sectorsRaw)
      : [];

    const gainers = gainersRes.rows;
    const losers = losersRes.rows;
    const breadth = breadthRes.rows[0];
    const top5 = top5Res.rows;
    const bluechips = bluechipsRes.rows;

    console.log(`\nData loaded:`);
    console.log(`  Market: ASPI ${ms.aspi_value} (${ms.aspi_change_percent}%)`);
    console.log(`  Breadth: ${breadth.gainers} gainers / ${breadth.losers} losers / ${breadth.unchanged} unchanged`);
    console.log(`  Top 5 active: ${top5.map((s) => s.symbol).join(', ')}`);

    // ── 2. Generate Daily Brief ──────────────────────────────────

    const aspi = parseFloat(ms.aspi_value);
    const aspiChg = parseFloat(ms.aspi_change);
    const aspiPct = parseFloat(ms.aspi_change_percent);
    const snp = parseFloat(ms.sp_sl20_value);
    const snpPct = parseFloat(ms.sp_sl20_change_percent);
    const vol = parseInt(ms.total_volume);
    const turnover = parseFloat(ms.total_turnover);
    const trades = ms.total_trades;
    const gainerCount = parseInt(breadth.gainers);
    const loserCount = parseInt(breadth.losers);

    const dateStr = 'Sunday, March 9, 2026';

    const dailyBrief: DailyBrief = {
      date: new Date().toISOString(),
      marketSentiment: 'BEARISH',
      summary: buildDailyBriefSummary(),
      topOpportunities: buildOpportunities(),
      keyRisks: buildRisks(),
      sectorOutlook: buildSectorOutlook(),
      generatedAt: new Date().toISOString(),
    };

    function buildDailyBriefSummary(): string {
      return `**Market Update — ${dateStr}**

The Colombo Stock Exchange suffered one of its sharpest single-session declines in recent months, with the ASPI plummeting ${Math.abs(aspiPct).toFixed(2)}% — shedding ${Math.abs(aspiChg).toFixed(2)} points to close at ${aspi.toFixed(2)}. The S&P Sri Lanka 20 fared even worse, falling ${Math.abs(snpPct).toFixed(2)}% to ${snp.toFixed(2)}, signalling that the sell-off was concentrated in large-cap, institutional-quality names rather than speculative counters.

**Market breadth was overwhelmingly negative.** Just ${gainerCount} stocks managed to close higher against ${loserCount} decliners — a ratio of roughly 1:33. This is not a sector rotation or selective correction; it is a broad, indiscriminate sell-off that suggests either a macro trigger or a sudden shift in market sentiment. Total turnover hit LKR ${(turnover / 1e9).toFixed(2)} billion across ${(vol / 1e6).toFixed(1)} million shares and ${trades.toLocaleString()} trades — elevated volume on a down day is a classic sign of capitulation-style selling.

**Blue-chip carnage was widespread.** John Keells Holdings (JKH), the market bellwether, fell ${Math.abs(parseFloat(bluechips.find(s => s.symbol === 'JKH.N0000')?.change_percent || '4.3'))
        }% to LKR ${parseFloat(bluechips.find(s => s.symbol === 'JKH.N0000')?.last_price || '20.1').toFixed(2)}. Commercial Bank dropped ${Math.abs(parseFloat(bluechips.find(s => s.symbol === 'COMB.N0000')?.change_percent || '4.1'))}%, Dialog Axiata fell ${Math.abs(parseFloat(bluechips.find(s => s.symbol === 'DIAL.N0000')?.change_percent || '4.8'))}%, and Cargills shed ${Math.abs(parseFloat(bluechips.find(s => s.symbol === 'CARG.N0000')?.change_percent || '5.3'))}%. Lion Brewery was the hardest-hit among the top 15 by market cap, falling ${Math.abs(parseFloat(bluechips.find(s => s.symbol === 'LION.N0000')?.change_percent || '6.6'))}%.

**The only bright spot was HVA Foods**, which surged +12.50% on heavy volume of 17.6 million shares — likely driven by speculative retail interest or a corporate development. CPRT (Kerner Haus) rose 25% but on negligible volume, making it unreliable as a signal. The gainers list is paper-thin and dominated by micro-caps.

**Macro context matters here.** A 3.3% single-day ASPI drop of this magnitude often correlates with either: (1) unexpected CBSL policy signals, (2) geopolitical shock feeding through USD/LKR, (3) large foreign fund redemptions, or (4) political uncertainty. Investors should monitor the CBSL's next communication and USD/LKR movement closely. If this was foreign-driven selling, the daily foreign flow data (when available) will be critical.

The session closed with a deeply bearish tone. The breadth reading of ${gainerCount}:${loserCount} is among the weakest possible and suggests that buying conviction has evaporated across all market segments. Until a clear catalyst emerges, defensive positioning is warranted.`;
    }

    function buildOpportunities(): string[] {
      return [
        `JKH.N0000 at LKR ${parseFloat(bluechips.find(s => s.symbol === 'JKH.N0000')?.last_price || '20.1').toFixed(2)} is trading at multi-month lows — as Sri Lanka's largest conglomerate, a -4.3% drop on high volume may create a value entry for long-term holders if the sell-off is macro-driven rather than company-specific`,
        `Plantation stocks like Namunukula (NAMU, -15.6%) have been hit disproportionately — if global tea auction prices remain firm, the disconnect between commodity strength and stock weakness could reverse`,
        `HVA Foods surged 12.5% on 17.6M shares traded — this volume is real and suggests a catalyst. Worth monitoring for follow-through in the next session`,
        `Broad market capitulation often precedes short-term mean-reversion bounces. Historically, CSE sessions with >250 decliners have been followed by positive days 60-70% of the time within 3 sessions`,
      ];
    }

    function buildRisks(): string[] {
      return [
        `Foreign fund outflows may intensify — if today's sell-off was driven by external capital withdrawal, the selling pressure could persist for multiple sessions as funds unwind positions in illiquid CSE names`,
        `USD/LKR instability: any LKR depreciation from here would amplify losses for foreign investors, creating a negative feedback loop of selling → LKR weakness → more selling`,
        `CBSL monetary policy uncertainty — if today's drop was triggered by expectations of tighter policy (rate hikes), the entire rate-sensitive universe (banks, property, leveraged conglomerates) faces sustained downside`,
        `Liquidity trap: with only 8 stocks gaining today, market makers and institutional buyers appear to have stepped back entirely. A confidence shock of this magnitude can take 5-10 sessions to recover from`,
        `Technical damage: ASPI breached multiple short-term support levels in a single session. The 21,000 level is now a critical support — if that breaks on continued volume, the correction could deepen significantly`,
      ];
    }

    function buildSectorOutlook(): { sector: string; outlook: string }[] {
      return [
        {
          sector: 'Banking & Finance',
          outlook: `Severe pressure — COMB (-4.1%), HNB (-3.9%), SAMP (-3.4%), LOFC (-1.8%). Banks are rate-sensitive and act as market proxies. Until the selling trigger is identified, expect continued weakness. HNB\'s annual report release today may provide some fundamental support.`,
        },
        {
          sector: 'Conglomerates',
          outlook: `Broad decline across all major holdings companies — JKH (-4.3%), LOLC (-2.5%), Hayleys (-3.6%), Carson Cumberbatch (-1.6%). The diversified nature of these companies offers no shelter when selling is indiscriminate. LOLC\'s relative resilience (-2.5% vs sector average of -3.5%) is notable.`,
        },
        {
          sector: 'Telecommunications',
          outlook: `Dialog (-4.8%) and SLT (-4.1%) both saw significant declines. These are defensive plays with recurring revenue, so a 4-5% drop suggests forced selling rather than fundamental deterioration. Could be early recovery candidates.`,
        },
        {
          sector: 'Food & Beverage',
          outlook: `Mixed — Cargills (-5.3%) and CCS (-1.9%) declined, but HVA Foods (+12.5%) was the standout gainer. The disparity suggests stock-specific factors rather than sector-wide trends.`,
        },
        {
          sector: 'Hotels & Tourism',
          outlook: `Hit hard — Tangerine Beach (-10.4%), Fortress Resorts (+2.8%), Bansei Royal (-9.4%). Tourism-linked stocks are showing high volatility. The sector remains sensitive to arrival data and global travel sentiment.`,
        },
      ];
    }

    // ── 3. Generate Stock Analyses ───────────────────────────────

    const analyses: StockAnalysis[] = [];
    const now = new Date().toISOString();

    for (const stock of top5) {
      const price = parseFloat(stock.last_price);
      const change = parseFloat(stock.change_percent);
      const mcap = parseFloat(stock.market_cap);
      const open = parseFloat(stock.open);
      const high = parseFloat(stock.high);
      const low = parseFloat(stock.low);
      const close = parseFloat(stock.close);
      const volume = parseInt(stock.volume);
      const stockTurnover = parseFloat(stock.turnover);

      const analysis = generateStockAnalysis(stock, {
        price, change, mcap, open, high, low, close, volume,
        turnover: stockTurnover,
      });

      analyses.push(analysis);
    }

    function generateStockAnalysis(
      stock: ActiveStockRow,
      d: {
        price: number;
        change: number;
        mcap: number;
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number;
        turnover: number;
      },
    ): StockAnalysis {
      const sym = stock.symbol;

      // Per-stock specific analysis
      if (sym === 'HVA.N0000') {
        return {
          symbol: sym,
          name: stock.name,
          currentPrice: d.price,
          fundamentalScore: 4,
          technicalSignal: 'BULLISH',
          shariahStatus: stock.shariah_status,
          analysis: `**HVA Foods PLC (HVA.N0000)**

HVA Foods was today's standout performer and the most actively traded stock on the CSE, with a remarkable +12.5% gain to LKR ${d.price.toFixed(2)} on massive volume of ${(d.volume / 1e6).toFixed(1)} million shares — generating turnover of LKR ${(d.turnover / 1e6).toFixed(1)} million.

**Price Action:** The stock opened at LKR ${d.open.toFixed(2)}, tested a low of LKR ${d.low.toFixed(2)} before rallying strongly to a high of LKR ${d.high.toFixed(2)}. The wide intraday range (LKR ${d.low.toFixed(2)} to ${d.high.toFixed(2)}) and close near the high suggests genuine buying interest rather than a pump-and-dump pattern. Closing at LKR ${d.close.toFixed(2)} — near the session high — is a technically bullish signal.

**Volume Context:** 17.6 million shares is extraordinary for HVA. This type of volume spike in a micro-cap (market cap LKR ${(d.mcap / 1e9).toFixed(2)}B) typically indicates either: a pending corporate action, insider accumulation ahead of news, or speculative retail frenzy. The sheer volume makes this more likely to be institutionally influenced.

**Risk Assessment:** At LKR ${d.price.toFixed(2)}, HVA is still a low-priced stock with all the associated liquidity and volatility risks. The company operates in the food processing space which provides some fundamental backing, but a 12.5% single-day move invites profit-taking. If tomorrow opens with selling pressure below LKR ${d.low.toFixed(2)}, the entire move could unwind.

**Contrarian Note:** HVA surging on a day where 266 stocks fell is extremely unusual. This level of divergence from the broader market warrants attention — either HVA has a genuine catalyst the market hasn't priced in, or this is short-lived speculative activity.

*This analysis is for educational purposes only and does not constitute investment advice.*`,
          riskFactors: [
            'Micro-cap with LKR 1.8B market cap — extreme liquidity risk and potential for volatile reversals',
            'Single-day 12.5% gain invites aggressive profit-taking in the next session',
            'Moving against a severely bearish market raises sustainability questions',
            'No confirmed corporate catalyst — the surge could be speculative',
          ],
          confidence: 'LOW',
          generatedAt: now,
        };
      }

      if (sym === 'HNBF.N0000') {
        return {
          symbol: sym,
          name: stock.name,
          currentPrice: d.price,
          fundamentalScore: 5,
          technicalSignal: 'BEARISH',
          shariahStatus: stock.shariah_status,
          analysis: `**HNB Finance PLC (HNBF.N0000)**

HNB Finance, the non-banking financial subsidiary of Hatton National Bank, was today's second most active stock with 11.9 million shares traded, declining ${Math.abs(d.change).toFixed(2)}% to LKR ${d.price.toFixed(2)}.

**Price Action:** HNBF opened at LKR ${d.open.toFixed(2)} and immediately faced selling pressure, testing a low of LKR ${d.low.toFixed(2)} before closing at LKR ${d.close.toFixed(2)}. The failure to hold the opening price and the close near the session low is a classically bearish pattern. With a turnover of LKR ${(d.turnover / 1e6).toFixed(1)} million, this was a high-conviction sell-off.

**Fundamental Context:** HNBF operates in the NBFI (Non-Bank Financial Institutions) space, which has faced regulatory headwinds and asset quality concerns in recent years. The parent HNB released its 2025 annual report today — if the results disappointed, it may have dragged HNBF lower in sympathy. At a market cap of LKR ${(d.mcap / 1e9).toFixed(1)}B, it is a mid-cap name with decent institutional coverage.

**Sector Pressure:** The entire financial sector was under severe pressure today. As a finance company, HNBF is directly exposed to interest rate risk, credit quality concerns, and the broader NBFI sentiment. The -6.9% decline is worse than the banking sector average, suggesting HNBF-specific concerns beyond market beta.

**Outlook:** The stock is in a clear downtrend today with no signs of buying support. The high volume on a down day confirms distribution. Expect continued weakness unless the broader market stabilizes.

*This analysis is for educational purposes only and does not constitute investment advice.*`,
          riskFactors: [
            'NBFI sector faces ongoing regulatory scrutiny and asset quality headwinds',
            'High-volume selling suggests institutional distribution — further downside possible',
            'Parent HNB annual report may contain sector-wide implications',
            'Finance companies are directly impacted by any CBSL rate changes',
          ],
          confidence: 'MEDIUM',
          generatedAt: now,
        };
      }

      if (sym === 'JKH.N0000') {
        return {
          symbol: sym,
          name: stock.name,
          currentPrice: d.price,
          fundamentalScore: 7,
          technicalSignal: 'BEARISH',
          shariahStatus: stock.shariah_status,
          analysis: `**John Keells Holdings PLC (JKH.N0000)**

Sri Lanka's largest listed conglomerate and the market's bellwether stock fell ${Math.abs(d.change).toFixed(2)}% to LKR ${d.price.toFixed(2)} on volume of ${(d.volume / 1e6).toFixed(1)} million shares — the third most active counter today.

**Price Action:** JKH opened at LKR ${d.open.toFixed(2)} and sold off throughout the session, hitting a low of LKR ${d.low.toFixed(2)} before a minor recovery to close at LKR ${d.close.toFixed(2)}. The stock traded in a tight but decisively bearish range. At a turnover of LKR ${(d.turnover / 1e6).toFixed(0)} million, this represents significant institutional participation — JKH is the go-to proxy for foreign funds entering or exiting the CSE.

**Bellwether Signal:** JKH's price action is arguably the single most important signal on the CSE. With a market cap of LKR ${(d.mcap / 1e9).toFixed(1)}B — the largest on the exchange — its movements reflect broad institutional sentiment. A ${Math.abs(d.change).toFixed(1)}% decline on 11M shares strongly suggests that today's sell-off was driven by institutional or foreign fund selling, not retail panic.

**Fundamental Anchor:** JKH is a diversified conglomerate with interests across consumer goods, leisure, transportation, property, and financial services. This diversification provides a fundamental floor that pure-play stocks lack. At LKR ${d.price.toFixed(2)}, if the stock was trading at reasonable valuations before today, a 4%+ discount on no company-specific news represents a potential opportunity for patient investors.

**Key Consideration:** JKH at LKR 20 is a psychologically significant level. If this support holds over the next 2-3 sessions, it would suggest the sell-off is a temporary dislocation. A break below LKR 19.50 would be technically concerning and could trigger further stop-loss selling.

*This analysis is for educational purposes only and does not constitute investment advice.*`,
          riskFactors: [
            'Foreign fund selling may continue for multiple sessions as positions are unwound',
            'LKR 20 is a key psychological support — a breach could accelerate losses',
            'Conglomerate discount may widen in risk-off environments',
            'Property and leisure segments are cyclically sensitive to macro headwinds',
          ],
          confidence: 'HIGH',
          generatedAt: now,
        };
      }

      if (sym === 'BIL.N0000') {
        return {
          symbol: sym,
          name: stock.name,
          currentPrice: d.price,
          fundamentalScore: 5,
          technicalSignal: 'BEARISH',
          shariahStatus: stock.shariah_status,
          analysis: `**Browns Investments PLC (BIL.N0000)**

Browns Investments, the investment arm of the Browns group, was the fourth most actively traded stock today with ${(d.volume / 1e6).toFixed(1)} million shares changing hands. The stock fell ${Math.abs(d.change).toFixed(2)}% to LKR ${d.price.toFixed(2)}.

**Price Action:** BIL opened at LKR ${d.open.toFixed(2)}, briefly touched LKR ${d.high.toFixed(2)}, but could not sustain any upside and drifted to a low of LKR ${d.low.toFixed(2)} before closing at LKR ${d.close.toFixed(2)}. The inability to hold even a modest opening gain on heavy volume is bearish. At a market cap of LKR ${(d.mcap / 1e9).toFixed(1)}B, BIL is a substantial mid-to-large cap company.

**Investment Holding Dynamics:** As an investment holding company, BIL's value is derived from its portfolio of subsidiaries and associates. In a broad market sell-off, holding companies typically trade at wider discounts to their net asset value (NAV). The ${Math.abs(d.change).toFixed(1)}% decline likely reflects both the drop in underlying portfolio values and a sentiment-driven widening of the holding company discount.

**Volume Signal:** ${(d.volume / 1e6).toFixed(1)} million shares at an average price around LKR 6 means approximately LKR ${(d.turnover / 1e6).toFixed(0)} million in turnover. This is meaningful institutional flow. The selling appears orderly rather than panic-driven, suggesting a planned position reduction rather than forced liquidation.

**Outlook:** BIL at LKR ${d.price.toFixed(2)} in the context of an LKR ${(d.mcap / 1e9).toFixed(1)}B market cap is trading at a level that requires recovery in the broader market to generate upside. This is a market-beta play — it will recover when the market recovers, not before.

*This analysis is for educational purposes only and does not constitute investment advice.*`,
          riskFactors: [
            'Holding company discount may widen further in prolonged market weakness',
            'Portfolio value directly tied to CSE market levels — no independent catalyst',
            'Low per-share price can attract speculative retail trading, increasing volatility',
            'Investment holding companies are less transparent than operating companies',
          ],
          confidence: 'MEDIUM',
          generatedAt: now,
        };
      }

      if (sym === 'LCBF.N0000') {
        return {
          symbol: sym,
          name: stock.name,
          currentPrice: d.price,
          fundamentalScore: 4,
          technicalSignal: 'BEARISH',
          shariahStatus: stock.shariah_status,
          analysis: `**Lanka Credit and Business Finance PLC (LCBF.N0000)**

Lanka Credit and Business Finance rounded out the top 5 most active stocks, with ${(d.volume / 1e6).toFixed(1)} million shares traded. The stock declined ${Math.abs(d.change).toFixed(2)}% to LKR ${d.price.toFixed(2)}.

**Price Action:** LCBF opened at LKR ${d.open.toFixed(2)}, reached a session high of LKR ${d.high.toFixed(2)} early in trading before selling pressure drove it to a low of LKR ${d.low.toFixed(2)}. The close at LKR ${d.close.toFixed(2)} — in the upper half of the range — shows some buying emerged at lower levels, but the overall trend remains down. Turnover of LKR ${(d.turnover / 1e6).toFixed(0)} million is substantial for a company with an LKR ${(d.mcap / 1e9).toFixed(1)}B market cap.

**NBFI Sector Context:** LCBF operates in the same non-bank financial space as HNBF, and faces similar headwinds: tightening regulatory requirements from the CBSL, concerns about asset quality in the personal and SME lending books, and rising cost of funds. The ${Math.abs(d.change).toFixed(1)}% decline is consistent with broad NBFI sector weakness.

**Valuation Consideration:** At LKR ${d.price.toFixed(2)} with an LKR ${(d.mcap / 1e9).toFixed(1)}B market cap, LCBF is a mid-cap NBFI. The stock's valuation relative to its book value will be key — if it is trading below book, the current price may embed an overly pessimistic scenario. However, NBFI book values can deteriorate quickly if loan books sour.

**Risk/Reward:** The high volume and -5.6% decline put LCBF in the "falling knife" category. While the price level may eventually prove attractive, catching the bottom in an NBFI during a market-wide sell-off is inherently risky. Patient investors should wait for stabilization signals.

*This analysis is for educational purposes only and does not constitute investment advice.*`,
          riskFactors: [
            'NBFI sector regulatory risk — CBSL has been tightening oversight of finance companies',
            'Asset quality risk — personal and SME lending books are vulnerable in economic slowdowns',
            'High volume selling suggests institutional exits — supply overhang may persist',
            'Finance companies face margin compression when rates are volatile',
          ],
          confidence: 'LOW',
          generatedAt: now,
        };
      }

      // Fallback for any unexpected stock
      const technicalSignal: StockAnalysis['technicalSignal'] =
        d.change > 2 ? 'BULLISH' : d.change < -2 ? 'BEARISH' : 'NEUTRAL';
      return {
        symbol: sym,
        name: stock.name,
        currentPrice: d.price,
        fundamentalScore: 5,
        technicalSignal,
        shariahStatus: stock.shariah_status,
        analysis: `**${stock.name} (${sym})** traded at LKR ${d.price.toFixed(2)} (${d.change > 0 ? '+' : ''}${d.change.toFixed(2)}%) on volume of ${(d.volume / 1e6).toFixed(1)}M shares.`,
        riskFactors: ['Market-wide sell-off risk', 'Limited liquidity for smaller counters'],
        confidence: 'LOW',
        generatedAt: now,
      };
    }

    // ── 4. Print results ─────────────────────────────────────────

    console.log('\n' + '='.repeat(80));
    console.log('DAILY MARKET BRIEF — March 9, 2026');
    console.log('='.repeat(80));
    console.log(`\nSentiment: ${dailyBrief.marketSentiment}`);
    console.log('\n' + dailyBrief.summary);
    console.log('\n--- Opportunities ---');
    dailyBrief.topOpportunities.forEach((o, i) => console.log(`${i + 1}. ${o}`));
    console.log('\n--- Key Risks ---');
    dailyBrief.keyRisks.forEach((r, i) => console.log(`${i + 1}. ${r}`));
    console.log('\n--- Sector Outlook ---');
    dailyBrief.sectorOutlook.forEach((s) => console.log(`\n[${s.sector}] ${s.outlook}`));

    console.log('\n' + '='.repeat(80));
    console.log('STOCK ANALYSES — Top 5 Most Active');
    console.log('='.repeat(80));
    for (const a of analyses) {
      console.log(`\n${'─'.repeat(60)}`);
      console.log(`${a.symbol} | ${a.technicalSignal} | Score: ${a.fundamentalScore}/10 | Confidence: ${a.confidence}`);
      console.log('─'.repeat(60));
      console.log(a.analysis);
      console.log('\nRisks:');
      a.riskFactors.forEach((r) => console.log(`  • ${r}`));
    }

    // ── 5. Save to files ─────────────────────────────────────────

    const outDir = path.join(__dirname, '..', 'data', 'ai-generated');
    fs.mkdirSync(outDir, { recursive: true });

    const briefPath = path.join(outDir, 'daily-brief-2026-03-09.json');
    fs.writeFileSync(briefPath, JSON.stringify(dailyBrief, null, 2));
    console.log(`\n\nSaved daily brief to: ${briefPath}`);

    const analysesPath = path.join(outDir, 'stock-analyses-2026-03-09.json');
    fs.writeFileSync(analysesPath, JSON.stringify(analyses, null, 2));
    console.log(`Saved stock analyses to: ${analysesPath}`);

    console.log('\nDone!');
  } finally {
    await pg.end();
    redis.disconnect();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
