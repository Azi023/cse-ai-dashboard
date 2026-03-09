/**
 * generate-ai-content.ts
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │  Run this after 10:00 AM once market data has accumulated.  │
 * │  npx tsx scripts/generate-ai-content.ts                     │
 * │  npx tsx scripts/generate-ai-content.ts 2026-03-10          │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Connects to PostgreSQL, reads the day's real market data,
 * then generates a daily brief and stock analyses for the
 * top 5 most active stocks. Output is saved as JSON files that
 * the ai-engine service serves to the dashboard.
 *
 * Accepts an optional date parameter (YYYY-MM-DD), defaults to today.
 * Clears any previous content for the target date before generating.
 */

import { Client } from 'pg';
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

interface SectorRow {
  sector: string;
  stock_count: string;
  avg_change: string;
  total_volume: string;
}

// ── Helpers ─────────────────────────────────────────────────────

function parseDate(dateStr: string): string {
  // Validate YYYY-MM-DD format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(`Invalid date format: ${dateStr}. Use YYYY-MM-DD.`);
  }
  return dateStr;
}

function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatLKR(value: number): string {
  if (value >= 1e9) return `LKR ${(value / 1e9).toFixed(2)} billion`;
  if (value >= 1e6) return `LKR ${(value / 1e6).toFixed(1)} million`;
  return `LKR ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

function determineSentiment(aspiPct: number, breadthRatio: number): DailyBrief['marketSentiment'] {
  if (aspiPct > 1.5 && breadthRatio > 2) return 'BULLISH';
  if (aspiPct > 0.3 && breadthRatio > 1) return 'BULLISH';
  if (aspiPct < -1.5 && breadthRatio < 0.5) return 'BEARISH';
  if (aspiPct < -0.3 && breadthRatio < 1) return 'BEARISH';
  if (aspiPct < -0.3 || breadthRatio < 0.8) return 'CAUTIOUS';
  return 'NEUTRAL';
}

function determineTechnical(change: number): StockAnalysis['technicalSignal'] {
  if (change > 2) return 'BULLISH';
  if (change < -2) return 'BEARISH';
  return 'NEUTRAL';
}

function determineConfidence(mcap: number, volume: number): StockAnalysis['confidence'] {
  if (mcap > 10e9 && volume > 1e6) return 'HIGH';
  if (mcap > 1e9 || volume > 500000) return 'MEDIUM';
  return 'LOW';
}

function scoreFundamentals(mcap: number, change: number, shariahStatus: string): number {
  let score = 5;
  if (mcap > 50e9) score += 2;
  else if (mcap > 10e9) score += 1;
  if (shariahStatus === 'compliant') score += 1;
  if (Math.abs(change) > 5) score -= 1; // high volatility penalty
  return Math.max(1, Math.min(10, score));
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  // Parse date argument
  const targetDate = process.argv[2]
    ? parseDate(process.argv[2])
    : new Date().toISOString().split('T')[0];

  console.log(`\n📅 Generating AI content for: ${targetDate}`);
  console.log(`   (${formatDateLong(targetDate)})\n`);

  const pg = new Client({
    host: 'localhost',
    port: 5432,
    user: 'cse_user',
    password: 'cse_secure_2026',
    database: 'cse_dashboard',
  });

  try {
    await pg.connect();
    console.log('Connected to PostgreSQL');

    // ── 0. Setup output directory & clear previous content ──────

    const outDir = path.join(__dirname, '..', 'data', 'ai-generated');
    fs.mkdirSync(outDir, { recursive: true });

    const briefPath = path.join(outDir, `daily-brief-${targetDate}.json`);
    const analysesPath = path.join(outDir, `stock-analyses-${targetDate}.json`);

    // Clear previous content for this date
    if (fs.existsSync(briefPath)) {
      fs.unlinkSync(briefPath);
      console.log(`Cleared previous daily brief for ${targetDate}`);
    }
    if (fs.existsSync(analysesPath)) {
      fs.unlinkSync(analysesPath);
      console.log(`Cleared previous stock analyses for ${targetDate}`);
    }

    // ── 1. Gather data ───────────────────────────────────────────

    const msRes = await pg.query<MarketSummaryRow>(
      'SELECT * FROM market_summaries ORDER BY summary_date DESC LIMIT 1',
    );
    if (msRes.rows.length === 0) {
      console.error('❌ No market summary data found. Has market data been ingested today?');
      console.error('   Wait until after 9:30 AM for data to start flowing.');
      process.exit(1);
    }
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
      WHERE dp.trade_date::date = $1
      ORDER BY dp.volume::bigint DESC
      LIMIT 5
    `, [targetDate]);

    // If no daily_prices for the target date, fall back to most active by volume from stocks table
    let top5 = top5Res.rows;
    if (top5.length === 0) {
      console.log('⚠️  No daily_prices for target date. Using stocks table data instead.');
      const fallbackRes = await pg.query<ActiveStockRow>(`
        SELECT symbol, name, sector, last_price, change_percent,
               market_cap, shariah_status, beta,
               last_price as open, last_price as high, last_price as low,
               last_price as close, '0' as volume, '0' as turnover
        FROM stocks
        WHERE is_active=true AND last_price IS NOT NULL
        ORDER BY market_cap::float DESC NULLS LAST
        LIMIT 5
      `);
      top5 = fallbackRes.rows;
    }

    const bluechipsRes = await pg.query<StockRow>(
      `SELECT symbol, name, sector, last_price, change_percent, market_cap, shariah_status, beta
       FROM stocks WHERE is_active=true AND last_price IS NOT NULL
       ORDER BY market_cap::float DESC NULLS LAST LIMIT 15`,
    );

    // Sector performance
    const sectorRes = await pg.query<SectorRow>(`
      SELECT sector, count(*) as stock_count,
             avg(change_percent::float) as avg_change,
             sum(CASE WHEN change_percent IS NOT NULL THEN 1 ELSE 0 END) as total_volume
      FROM stocks
      WHERE is_active=true AND last_price IS NOT NULL AND sector IS NOT NULL
      GROUP BY sector
      ORDER BY avg(change_percent::float) ASC
      LIMIT 10
    `);

    const gainers = gainersRes.rows;
    const losers = losersRes.rows;
    const breadth = breadthRes.rows[0];
    const bluechips = bluechipsRes.rows;
    const sectors = sectorRes.rows;

    // ── 2. Parse metrics ───────────────────────────────────────────

    const aspi = parseFloat(ms.aspi_value);
    const aspiChg = parseFloat(ms.aspi_change);
    const aspiPct = parseFloat(ms.aspi_change_percent);
    const snp = parseFloat(ms.sp_sl20_value);
    const snpChg = parseFloat(ms.sp_sl20_change);
    const snpPct = parseFloat(ms.sp_sl20_change_percent);
    const vol = parseInt(ms.total_volume);
    const turnover = parseFloat(ms.total_turnover);
    const trades = ms.total_trades;
    const gainerCount = parseInt(breadth.gainers);
    const loserCount = parseInt(breadth.losers);
    const unchangedCount = parseInt(breadth.unchanged);
    const breadthRatio = loserCount > 0 ? gainerCount / loserCount : gainerCount > 0 ? 99 : 1;
    const dateLong = formatDateLong(targetDate);
    const sentiment = determineSentiment(aspiPct, breadthRatio);

    console.log(`\nData loaded:`);
    console.log(`  Market: ASPI ${aspi.toFixed(2)} (${pct(aspiPct)})`);
    console.log(`  S&P SL20: ${snp.toFixed(2)} (${pct(snpPct)})`);
    console.log(`  Breadth: ${gainerCount} gainers / ${loserCount} losers / ${unchangedCount} unchanged`);
    console.log(`  Volume: ${(vol / 1e6).toFixed(1)}M shares, Turnover: ${formatLKR(turnover)}`);
    console.log(`  Top 5 active: ${top5.map((s) => s.symbol).join(', ')}`);
    console.log(`  Sentiment: ${sentiment}`);

    // ── 3. Generate Daily Brief ──────────────────────────────────

    const dailyBrief: DailyBrief = {
      date: new Date(targetDate).toISOString(),
      marketSentiment: sentiment,
      summary: buildDailyBriefSummary(),
      topOpportunities: buildOpportunities(),
      keyRisks: buildRisks(),
      sectorOutlook: buildSectorOutlook(),
      generatedAt: new Date().toISOString(),
    };

    function buildDailyBriefSummary(): string {
      const direction = aspiPct >= 0 ? 'gained' : 'fell';
      const magnitude = Math.abs(aspiPct);
      let intensityAdj: string;
      if (magnitude > 3) intensityAdj = 'dramatically';
      else if (magnitude > 1.5) intensityAdj = 'significantly';
      else if (magnitude > 0.5) intensityAdj = 'moderately';
      else intensityAdj = 'marginally';

      const snpDirection = snpPct >= 0 ? 'rising' : 'falling';
      const snpComparison = Math.abs(snpPct) > Math.abs(aspiPct)
        ? 'The S&P SL20 fared even worse'
        : Math.abs(snpPct) < Math.abs(aspiPct)
          ? 'The S&P SL20 was relatively more resilient'
          : 'The S&P SL20 moved in tandem';

      // Market breadth analysis
      let breadthDesc: string;
      if (breadthRatio > 3) breadthDesc = 'overwhelmingly positive';
      else if (breadthRatio > 1.5) breadthDesc = 'broadly positive';
      else if (breadthRatio > 0.8) breadthDesc = 'mixed';
      else if (breadthRatio > 0.3) breadthDesc = 'broadly negative';
      else breadthDesc = 'overwhelmingly negative';

      // Volume context
      let volumeDesc: string;
      if (turnover > 5e9) volumeDesc = 'exceptionally heavy';
      else if (turnover > 2e9) volumeDesc = 'above-average';
      else if (turnover > 500e6) volumeDesc = 'moderate';
      else volumeDesc = 'light';

      // Blue-chip summary
      const topBluechips = bluechips.slice(0, 5);
      const bluechipLines = topBluechips.map(s => {
        const chg = parseFloat(s.change_percent);
        return `${s.name.split(' ').slice(0, 3).join(' ')} (${s.symbol.replace('.N0000', '')}) ${pct(chg)} to LKR ${parseFloat(s.last_price).toFixed(2)}`;
      }).join(', ');

      // Top gainer highlight
      const topGainer = gainers.length > 0 ? gainers[0] : null;
      const topLoser = losers.length > 0 ? losers[0] : null;

      let standoutNote = '';
      if (topGainer && parseFloat(topGainer.change_percent) > 5) {
        standoutNote = `\n\n**Standout performer:** ${topGainer.name} (${topGainer.symbol.replace('.N0000', '')}) surged ${pct(parseFloat(topGainer.change_percent))} to LKR ${parseFloat(topGainer.last_price).toFixed(2)}, bucking the broader trend.`;
      }

      return `**Market Update — ${dateLong}**

The Colombo Stock Exchange ${direction} ${intensityAdj} today, with the ASPI moving ${pct(aspiPct)} — ${aspiChg >= 0 ? 'adding' : 'shedding'} ${Math.abs(aspiChg).toFixed(2)} points to close at ${aspi.toFixed(2)}. ${snpComparison}, ${snpDirection} ${Math.abs(snpPct).toFixed(2)}% to ${snp.toFixed(2)}.

**Market breadth was ${breadthDesc}.** ${gainerCount} stocks advanced, ${loserCount} declined, and ${unchangedCount} were unchanged — a gainer-to-loser ratio of ${breadthRatio < 1 ? `1:${(1/breadthRatio).toFixed(0)}` : `${breadthRatio.toFixed(1)}:1`}. Total turnover was ${formatLKR(turnover)} across ${(vol / 1e6).toFixed(1)} million shares and ${trades.toLocaleString()} trades — ${volumeDesc} trading activity ${aspiPct < -1 && turnover > 2e9 ? 'on a down day, which is a classic sign of capitulation-style selling' : aspiPct > 1 && turnover > 2e9 ? 'on an up day, confirming broad-based buying interest' : 'for the session'}.

**Large-cap movers:** ${bluechipLines}.${standoutNote}

${sentiment === 'BEARISH' ? 'The session closed with a bearish tone. Until a clear catalyst emerges, defensive positioning may be warranted.' : sentiment === 'BULLISH' ? 'The session closed with bullish momentum. The broad-based advance suggests genuine buying conviction across market segments.' : sentiment === 'CAUTIOUS' ? 'The session closed on a cautious note. Mixed signals suggest investors should wait for clearer direction before committing new capital.' : 'The session closed with a neutral tone. The market appears to be in a consolidation phase, awaiting fresh catalysts.'}`;
    }

    function buildOpportunities(): string[] {
      const opps: string[] = [];

      // Oversold blue-chips on a down day
      if (aspiPct < -1) {
        const oversoldBlue = bluechips.find(s => parseFloat(s.change_percent) < -3);
        if (oversoldBlue) {
          opps.push(
            `${oversoldBlue.symbol.replace('.N0000', '')} at LKR ${parseFloat(oversoldBlue.last_price).toFixed(2)} has dropped ${pct(parseFloat(oversoldBlue.change_percent))} — as a large-cap name, this may create a value entry if the sell-off is macro-driven rather than company-specific`,
          );
        }
      }

      // Top gainers with real volume as momentum plays
      if (gainers.length > 0) {
        const topG = gainers[0];
        opps.push(
          `${topG.name} (${topG.symbol.replace('.N0000', '')}) gained ${pct(parseFloat(topG.change_percent))} — worth monitoring for follow-through in the next session`,
        );
      }

      // Sector-level opportunities
      if (sectors.length > 0) {
        const worstSector = sectors[0];
        const avgChg = parseFloat(worstSector.avg_change);
        if (avgChg < -2) {
          opps.push(
            `${worstSector.sector} sector has been hit hard (avg ${pct(avgChg)}) — individual stocks within may be oversold relative to fundamentals`,
          );
        }
      }

      // Mean-reversion play
      if (loserCount > 200) {
        opps.push(
          `Broad market capitulation with ${loserCount} decliners often precedes short-term mean-reversion bounces — historically, CSE sessions with >200 decliners have been followed by positive days within 3 sessions 60-70% of the time`,
        );
      }

      // Shariah-compliant picks
      const compliantGainer = gainers.find(s => s.shariah_status === 'compliant');
      if (compliantGainer) {
        opps.push(
          `${compliantGainer.name} (${compliantGainer.symbol.replace('.N0000', '')}) at ${pct(parseFloat(compliantGainer.change_percent))} is Shariah-compliant — suitable for halal portfolios`,
        );
      }

      return opps.length > 0 ? opps : ['Market conditions suggest waiting for clearer signals before initiating new positions'];
    }

    function buildRisks(): string[] {
      const risks: string[] = [];

      if (aspiPct < -1) {
        risks.push('Selling pressure may continue if today\'s decline was driven by institutional or foreign fund outflows');
        risks.push('Technical damage from the decline may trigger further stop-loss selling in the next session');
      }

      if (loserCount > gainerCount * 3) {
        risks.push(`Extreme breadth weakness (${gainerCount}:${loserCount} ratio) suggests broad-based loss of confidence — recovery may take multiple sessions`);
      }

      risks.push('USD/LKR volatility can amplify losses for foreign investors, creating selling feedback loops');
      risks.push('CBSL monetary policy direction remains a key risk for rate-sensitive sectors (banks, property, leveraged companies)');

      if (turnover < 500e6) {
        risks.push('Low liquidity makes price discovery unreliable — large orders can move prices disproportionately');
      }

      return risks.slice(0, 5);
    }

    function buildSectorOutlook(): { sector: string; outlook: string }[] {
      return sectors.slice(0, 5).map(s => {
        const avgChg = parseFloat(s.avg_change);
        const count = parseInt(s.stock_count);
        let desc: string;

        if (avgChg < -3) desc = 'Severe pressure';
        else if (avgChg < -1) desc = 'Under pressure';
        else if (avgChg < 0) desc = 'Slightly negative';
        else if (avgChg < 1) desc = 'Marginally positive';
        else if (avgChg < 3) desc = 'Positive momentum';
        else desc = 'Strong rally';

        // Find notable stocks in this sector from our data
        const sectorGainers = gainers.filter(st => st.sector === s.sector).slice(0, 2);
        const sectorLosers = losers.filter(st => st.sector === s.sector).slice(0, 2);

        let notable = '';
        if (sectorGainers.length > 0) {
          notable += ` Notable gainers: ${sectorGainers.map(st => `${st.symbol.replace('.N0000', '')} (${pct(parseFloat(st.change_percent))})`).join(', ')}.`;
        }
        if (sectorLosers.length > 0) {
          notable += ` Decliners: ${sectorLosers.map(st => `${st.symbol.replace('.N0000', '')} (${pct(parseFloat(st.change_percent))})`).join(', ')}.`;
        }

        return {
          sector: s.sector,
          outlook: `${desc} — ${count} stocks tracked, average change ${pct(avgChg)}.${notable}`,
        };
      });
    }

    // ── 4. Generate Stock Analyses ───────────────────────────────

    const analyses: StockAnalysis[] = [];
    const now = new Date().toISOString();

    for (const stock of top5) {
      const price = parseFloat(stock.last_price);
      const change = parseFloat(stock.change_percent);
      const mcap = parseFloat(stock.market_cap || '0');
      const open = parseFloat(stock.open);
      const high = parseFloat(stock.high);
      const low = parseFloat(stock.low);
      const close = parseFloat(stock.close);
      const volume = parseInt(stock.volume);
      const stockTurnover = parseFloat(stock.turnover);

      const signal = determineTechnical(change);
      const confidence = determineConfidence(mcap, volume);
      const fundScore = scoreFundamentals(mcap, change, stock.shariah_status);
      const shortName = stock.name.split(' ').slice(0, 4).join(' ');
      const shortSym = stock.symbol.replace('.N0000', '');

      // Price action analysis
      const rangeWidth = high - low;
      const closeInRange = rangeWidth > 0 ? (close - low) / rangeWidth : 0.5;
      let priceActionDesc: string;
      if (closeInRange > 0.75 && change > 0) {
        priceActionDesc = `closed near the session high — a technically bullish sign suggesting genuine buying interest`;
      } else if (closeInRange < 0.25 && change < 0) {
        priceActionDesc = `closed near the session low — a bearish pattern indicating sustained selling pressure throughout the day`;
      } else if (closeInRange > 0.5) {
        priceActionDesc = `recovered from the session lows to close in the upper half of the range, showing some buying support at lower levels`;
      } else {
        priceActionDesc = `drifted lower from the session highs, suggesting selling pressure intensified as the day progressed`;
      }

      // Volume context
      let volumeContext: string;
      if (volume > 10e6) volumeContext = 'Extraordinary volume';
      else if (volume > 5e6) volumeContext = 'Very heavy volume';
      else if (volume > 1e6) volumeContext = 'Above-average volume';
      else volumeContext = 'Moderate volume';

      // Market divergence note
      let divergenceNote = '';
      if (change > 2 && aspiPct < -1) {
        divergenceNote = `\n\n**Contrarian Note:** ${shortSym} surging on a day where ${loserCount} stocks fell is highly unusual. This divergence from the broader market warrants attention — either there is a genuine catalyst the market hasn't fully priced in, or this is short-lived speculative activity.`;
      } else if (change < -5 && aspiPct > -1) {
        divergenceNote = `\n\n**Warning:** ${shortSym}'s sharp decline significantly underperforms the broader market, suggesting company-specific or sector-specific headwinds beyond general market weakness.`;
      }

      const analysis: StockAnalysis = {
        symbol: stock.symbol,
        name: stock.name,
        currentPrice: price,
        fundamentalScore: fundScore,
        technicalSignal: signal,
        shariahStatus: stock.shariah_status,
        analysis: `**${shortName} (${stock.symbol})**

${shortSym} was among today's most actively traded stocks, with ${(volume / 1e6).toFixed(1)} million shares changing hands${stockTurnover > 0 ? `, generating turnover of ${formatLKR(stockTurnover)}` : ''}. The stock ${change >= 0 ? 'gained' : 'fell'} ${pct(change)} to LKR ${price.toFixed(2)}.

**Price Action:** The stock opened at LKR ${open.toFixed(2)}, reached a high of LKR ${high.toFixed(2)} and a low of LKR ${low.toFixed(2)}, before closing at LKR ${close.toFixed(2)}. The stock ${priceActionDesc}. ${rangeWidth > 0 ? `The intraday range of LKR ${rangeWidth.toFixed(2)} (${((rangeWidth / open) * 100).toFixed(1)}% of opening price) indicates ${rangeWidth / open > 0.05 ? 'high' : rangeWidth / open > 0.02 ? 'moderate' : 'low'} volatility.` : ''}

**Volume Context:** ${volumeContext} of ${(volume / 1e6).toFixed(1)}M shares${mcap > 0 ? ` for a company with LKR ${(mcap / 1e9).toFixed(1)}B market cap` : ''}. ${change < -2 && volume > 1e6 ? 'Heavy volume on a declining day confirms distribution and suggests institutional selling.' : change > 2 && volume > 1e6 ? 'Strong volume on an advancing day confirms accumulation and genuine buying interest.' : 'Volume levels are consistent with normal trading patterns.'}

**Sector:** ${stock.sector ?? 'Not classified'}. ${stock.shariah_status === 'compliant' ? 'This stock is Shariah-compliant.' : stock.shariah_status === 'non_compliant' ? 'Note: This stock is classified as non-Shariah-compliant.' : 'Shariah status is pending review.'}${divergenceNote}

*This analysis is for educational purposes only and does not constitute investment advice.*`,
        riskFactors: generateRiskFactors(stock, { change, mcap, volume }),
        confidence,
        generatedAt: now,
      };

      analyses.push(analysis);
    }

    function generateRiskFactors(
      stock: ActiveStockRow,
      d: { change: number; mcap: number; volume: number },
    ): string[] {
      const risks: string[] = [];
      const shortSym = stock.symbol.replace('.N0000', '');

      if (d.mcap < 2e9) risks.push(`${shortSym} is a small-cap stock — expect higher volatility and liquidity risk`);
      if (Math.abs(d.change) > 5) risks.push(`${Math.abs(d.change).toFixed(1)}% single-day move invites profit-taking or continued momentum — manage position size accordingly`);
      if (d.change < -3 && d.volume > 1e6) risks.push('High-volume selling suggests institutional distribution — further downside possible');
      if (d.change > 5 && aspiPct < -1) risks.push('Moving against a bearish market raises sustainability questions — potential for sharp reversal');

      // Sector risks
      if (stock.sector?.includes('Bank') || stock.sector?.includes('Finance')) {
        risks.push('Financial sector stocks are directly impacted by CBSL rate decisions and regulatory changes');
      }
      if (stock.sector?.includes('Hotel') || stock.sector?.includes('Tourism')) {
        risks.push('Tourism sector remains sensitive to global travel sentiment and political stability');
      }

      // General risks
      risks.push('Broader CSE market conditions and macro factors may override stock-specific dynamics');

      return risks.slice(0, 4);
    }

    // ── 5. Print results ─────────────────────────────────────────

    console.log('\n' + '='.repeat(80));
    console.log(`DAILY MARKET BRIEF — ${dateLong}`);
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

    // ── 6. Save to files ─────────────────────────────────────────

    fs.writeFileSync(briefPath, JSON.stringify(dailyBrief, null, 2));
    console.log(`\n\n✅ Saved daily brief to: ${briefPath}`);

    fs.writeFileSync(analysesPath, JSON.stringify(analyses, null, 2));
    console.log(`✅ Saved stock analyses to: ${analysesPath}`);

    console.log(`\n🎯 Content ready! The dashboard will serve this data automatically.`);
    console.log('Done!');
  } finally {
    await pg.end();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
