import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../cse-data/redis.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Stock } from '../../entities';

interface MarketData {
  aspiValue: number | null;
  aspiChange: number | null;
  aspiPercent: number | null;
  snpValue: number | null;
  snpChange: number | null;
  snpPercent: number | null;
  volume: number | null;
  turnover: number | null;
  trades: number | null;
  gainers: TopMover[];
  losers: TopMover[];
  active: TopMover[];
  sectors: SectorData[];
}

interface TopMover {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercentage: number;
  volume: number;
  turnover: number;
}

interface SectorData {
  name: string;
  indexValue: number;
  change: number;
  percentage: number;
}

@Injectable()
export class MockGenerator {
  private readonly logger = new Logger(MockGenerator.name);

  constructor(
    private readonly redisService: RedisService,
    @InjectRepository(Stock)
    private readonly stockRepository: Repository<Stock>,
  ) {}

  async getMarketData(): Promise<MarketData> {
    const [aspiRaw, snpRaw, marketRaw, gainersRaw, losersRaw, activeRaw, sectorsRaw] =
      await Promise.all([
        this.redisService.getJson<{ value?: number; change?: number; percentage?: number }>('cse:aspi_data'),
        this.redisService.getJson<{ value?: number; change?: number; percentage?: number }>('cse:snp_data'),
        this.redisService.getJson<{ tradeVolume?: number; shareVolume?: number; trades?: number }>('cse:market_summary'),
        this.redisService.getJson<TopMover[]>('cse:top_gainers'),
        this.redisService.getJson<TopMover[]>('cse:top_losers'),
        this.redisService.getJson<TopMover[]>('cse:most_active'),
        this.redisService.getJson<SectorData[]>('cse:all_sectors'),
      ]);

    return {
      aspiValue: aspiRaw?.value ?? null,
      aspiChange: aspiRaw?.change ?? null,
      aspiPercent: aspiRaw?.percentage ?? null,
      snpValue: snpRaw?.value ?? null,
      snpChange: snpRaw?.change ?? null,
      snpPercent: snpRaw?.percentage ?? null,
      volume: marketRaw?.shareVolume ?? null,
      turnover: marketRaw?.tradeVolume ?? null,
      trades: marketRaw?.trades ?? null,
      gainers: gainersRaw ?? [],
      losers: losersRaw ?? [],
      active: activeRaw ?? [],
      sectors: sectorsRaw ?? [],
    };
  }

  async generateDailyBrief(): Promise<{
    date: Date;
    marketSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'CAUTIOUS';
    summary: string;
    topOpportunities: string[];
    keyRisks: string[];
    sectorOutlook: { sector: string; outlook: string }[];
    generatedAt: Date;
  }> {
    const data = await this.getMarketData();
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const sentiment = this.determineSentiment(data);
    const summary = this.buildBriefSummary(data, dateStr, sentiment);
    const opportunities = this.buildOpportunities(data);
    const risks = this.buildRisks(data, sentiment);
    const sectorOutlook = this.buildSectorOutlook(data);

    return {
      date: now,
      marketSentiment: sentiment,
      summary,
      topOpportunities: opportunities,
      keyRisks: risks,
      sectorOutlook,
      generatedAt: now,
    };
  }

  async generateStockAnalysis(symbol: string): Promise<{
    symbol: string;
    name: string;
    currentPrice: number;
    fundamentalScore: number;
    technicalSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    shariahStatus: string;
    analysis: string;
    riskFactors: string[];
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    generatedAt: Date;
  }> {
    const stock = await this.stockRepository.findOne({
      where: { symbol: symbol.toUpperCase() },
    });

    if (!stock) {
      return {
        symbol: symbol.toUpperCase(),
        name: 'Unknown',
        currentPrice: 0,
        fundamentalScore: 5,
        technicalSignal: 'NEUTRAL',
        shariahStatus: 'pending_review',
        analysis: `No data available for ${symbol}. The stock may not be listed on the CSE or data has not been ingested yet.`,
        riskFactors: ['Insufficient data for analysis'],
        confidence: 'LOW',
        generatedAt: new Date(),
      };
    }

    const data = await this.getMarketData();
    const changePercent = Number(stock.change_percent) || 0;
    const price = Number(stock.last_price) || 0;

    const technicalSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
      changePercent > 2 ? 'BULLISH' : changePercent < -2 ? 'BEARISH' : 'NEUTRAL';

    const fundamentalScore = this.calculateFundamentalScore(stock, data);
    const confidence = this.determineConfidence(stock);

    const sectorPerf = data.sectors.find((s) =>
      s.name.toLowerCase().includes((stock.sector || '').toLowerCase()),
    );

    const analysis = this.buildStockAnalysis(stock, data, sectorPerf, technicalSignal);
    const riskFactors = this.buildStockRisks(stock, data);

    return {
      symbol: stock.symbol,
      name: stock.name,
      currentPrice: price,
      fundamentalScore,
      technicalSignal,
      shariahStatus: stock.shariah_status,
      analysis,
      riskFactors,
      confidence,
      generatedAt: new Date(),
    };
  }

  async generateChatResponse(
    message: string,
    history: { role: 'user' | 'assistant'; content: string }[],
  ): Promise<string> {
    const data = await this.getMarketData();
    const lowerMsg = message.toLowerCase();

    if (lowerMsg.includes('market') && (lowerMsg.includes('today') || lowerMsg.includes('movement') || lowerMsg.includes('how'))) {
      return this.chatMarketOverview(data);
    }

    if (lowerMsg.includes('analyze') || lowerMsg.includes('analysis')) {
      const symbolMatch = message.match(/([A-Z]{2,10}(?:\.N\d{4})?)/);
      if (symbolMatch) {
        const result = await this.generateStockAnalysis(symbolMatch[1]);
        return result.analysis;
      }
    }

    if (lowerMsg.includes('shariah') || lowerMsg.includes('compliant') || lowerMsg.includes('halal')) {
      return this.chatShariahResponse(data);
    }

    if (lowerMsg.includes('sector') || lowerMsg.includes('industry')) {
      return this.chatSectorResponse(data);
    }

    if (lowerMsg.includes('risk') || lowerMsg.includes('tension') || lowerMsg.includes('geopolit')) {
      return this.chatGeopoliticalResponse(data);
    }

    if (lowerMsg.includes('p/e') || lowerMsg.includes('ratio') || lowerMsg.includes('beginner') || lowerMsg.includes('explain')) {
      return this.chatEducationalResponse(message);
    }

    return this.chatGenericResponse(data, message);
  }

  async generateSignals(): Promise<
    Array<{
      symbol: string;
      name: string;
      currentPrice: number;
      direction: 'BUY' | 'HOLD' | 'SELL';
      reasoning: string;
      confidence: 'HIGH' | 'MEDIUM' | 'LOW';
      shariahStatus: string;
      generatedAt: Date;
    }>
  > {
    const data = await this.getMarketData();
    const signals: Array<{
      symbol: string;
      name: string;
      currentPrice: number;
      direction: 'BUY' | 'HOLD' | 'SELL';
      reasoning: string;
      confidence: 'HIGH' | 'MEDIUM' | 'LOW';
      shariahStatus: string;
      generatedAt: Date;
    }> = [];
    const now = new Date();

    // Generate buy signals from top losers (potential dip buying)
    for (const loser of data.losers.slice(0, 3)) {
      const stock = await this.stockRepository.findOne({
        where: { symbol: loser.symbol },
      });
      if (stock && stock.shariah_status !== 'non_compliant') {
        signals.push({
          symbol: loser.symbol,
          name: loser.name || stock.name,
          currentPrice: loser.price,
          direction: 'BUY',
          reasoning: `${loser.symbol} has declined ${Math.abs(loser.changePercentage ?? 0).toFixed(1)}% today to LKR ${(loser.price ?? 0).toFixed(2)}, potentially offering a buying opportunity if fundamentals remain intact. Volume of ${(loser.volume ?? 0).toLocaleString()} shares suggests active interest.`,
          confidence: Math.abs(loser.changePercentage ?? 0) > 5 ? 'MEDIUM' : 'LOW',
          shariahStatus: stock.shariah_status,
          generatedAt: now,
        });
      }
    }

    // Generate hold signals from top gainers (momentum)
    for (const gainer of data.gainers.slice(0, 3)) {
      const stock = await this.stockRepository.findOne({
        where: { symbol: gainer.symbol },
      });
      if (stock) {
        signals.push({
          symbol: gainer.symbol,
          name: gainer.name || stock.name,
          currentPrice: gainer.price,
          direction: 'HOLD',
          reasoning: `${gainer.symbol} is showing strong momentum, up ${(gainer.changePercentage ?? 0).toFixed(1)}% to LKR ${(gainer.price ?? 0).toFixed(2)}. The upward movement suggests positive market sentiment, but chasing gains at current levels carries risk.`,
          confidence: 'MEDIUM',
          shariahStatus: stock.shariah_status,
          generatedAt: now,
        });
      }
    }

    // Generate sell signals from active stocks with negative change
    for (const active of data.active.slice(0, 4)) {
      const stock = await this.stockRepository.findOne({
        where: { symbol: active.symbol },
      });
      if (stock && (active.changePercentage ?? 0) < -1) {
        signals.push({
          symbol: active.symbol,
          name: active.name || stock.name,
          currentPrice: active.price ?? 0,
          direction: 'SELL',
          reasoning: `${active.symbol} is seeing heavy volume (${(active.volume ?? 0).toLocaleString()} shares) with a ${(active.changePercentage ?? 0).toFixed(1)}% decline. High volume selling could indicate institutional distribution. Consider reviewing your position.`,
          confidence: (active.volume ?? 0) > 100000 ? 'MEDIUM' : 'LOW',
          shariahStatus: stock.shariah_status,
          generatedAt: now,
        });
      }
    }

    // If no signals generated from live data, use some stocks from DB
    if (signals.length === 0) {
      const sampleStocks = await this.stockRepository.find({
        where: { is_active: true },
        take: 5,
        order: { symbol: 'ASC' },
      });

      for (const stock of sampleStocks) {
        const price = Number(stock.last_price) || 0;
        const change = Number(stock.change_percent) || 0;
        const direction: 'BUY' | 'HOLD' | 'SELL' =
          change > 1 ? 'HOLD' : change < -1 ? 'BUY' : 'HOLD';

        signals.push({
          symbol: stock.symbol,
          name: stock.name,
          currentPrice: price,
          direction,
          reasoning: `Based on current market conditions, ${stock.symbol} at LKR ${price.toFixed(2)} (${change > 0 ? '+' : ''}${change.toFixed(1)}%) is showing ${direction === 'BUY' ? 'potential value at current levels' : 'stable price action with no strong directional signal'}.`,
          confidence: 'LOW',
          shariahStatus: stock.shariah_status,
          generatedAt: now,
        });
      }
    }

    return signals;
  }

  // --- Private helpers ---

  private determineSentiment(data: MarketData): 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'CAUTIOUS' {
    const aspiPercent = data.aspiPercent ?? 0;
    if (aspiPercent > 1) return 'BULLISH';
    if (aspiPercent < -1) return 'BEARISH';
    if (aspiPercent < -0.3) return 'CAUTIOUS';
    return 'NEUTRAL';
  }

  private buildBriefSummary(
    data: MarketData,
    dateStr: string,
    sentiment: string,
  ): string {
    const aspiVal = data.aspiValue?.toFixed(2) ?? 'N/A';
    const aspiChg = data.aspiPercent?.toFixed(2) ?? '0.00';
    const aspiDir = (data.aspiPercent ?? 0) >= 0 ? 'rising' : 'falling';
    const snpVal = data.snpValue?.toFixed(2) ?? 'N/A';
    const snpChg = data.snpPercent?.toFixed(2) ?? '0.00';
    const vol = data.volume ? (data.volume / 1_000_000).toFixed(1) + 'M' : 'N/A';
    const turnover = data.turnover
      ? 'LKR ' + (data.turnover / 1_000_000).toFixed(1) + 'M'
      : 'N/A';

    const gainerCount = data.gainers.length;
    const loserCount = data.losers.length;
    const topGainers = data.gainers.slice(0, 2);
    const topLosers = data.losers.slice(0, 2);

    const bestSector = data.sectors.length > 0
      ? [...data.sectors].sort((a, b) => b.percentage - a.percentage)[0]
      : null;
    const worstSector = data.sectors.length > 0
      ? [...data.sectors].sort((a, b) => a.percentage - b.percentage)[0]
      : null;

    let summary = `**Market Update — ${dateStr}**\n\n`;
    summary += `The Colombo Stock Exchange saw ${(data.aspiPercent ?? 0) >= 0 ? 'positive' : 'negative'} movement today with the ASPI ${aspiDir} ${Math.abs(Number(aspiChg))}% to ${aspiVal} points. `;
    summary += `The S&P Sri Lanka 20 index ${(data.snpPercent ?? 0) >= 0 ? 'gained' : 'declined'} ${Math.abs(Number(snpChg))}% to ${snpVal}. `;
    summary += `Trading volume reached ${vol} shares with a turnover of ${turnover}.\n\n`;

    if ((data.aspiPercent ?? 0) < 0) {
      summary += `Selling pressure was evident across the market`;
      if (worstSector) {
        summary += `, with ${worstSector.name} leading declines at ${worstSector.percentage.toFixed(2)}%`;
      }
      summary += `. ${gainerCount} stocks advanced against ${loserCount} decliners, indicating weak market breadth.\n\n`;
    } else {
      summary += `Buying interest was ${(data.aspiPercent ?? 0) > 1 ? 'broad-based' : 'selective'}`;
      if (bestSector) {
        summary += ` with ${bestSector.name} leading gains at +${bestSector.percentage.toFixed(2)}%`;
      }
      summary += `. ${gainerCount} stocks advanced against ${loserCount} decliners`;
      summary += (data.aspiPercent ?? 0) > 0.5
        ? ', suggesting healthy market participation.\n\n'
        : '.\n\n';
    }

    if (topGainers.length > 0) {
      const gainerStr = topGainers
        .map((g) => `${g.symbol} (+${(g.changePercentage ?? 0).toFixed(1)}%)`)
        .join(' and ');
      summary += `Top performers today included ${gainerStr}`;
    }
    if (topLosers.length > 0) {
      const loserStr = topLosers
        .map((l) => `${l.symbol} (${(l.changePercentage ?? 0).toFixed(1)}%)`)
        .join(' and ');
      summary += `, while ${loserStr} faced selling pressure`;
    }
    summary += '.\n\n';

    summary += `**Key factors to watch:** CBSL monetary policy direction, USD/LKR exchange rate movement, and foreign investor flow trends. The upcoming trading sessions will likely be influenced by global risk sentiment and domestic macro indicators.`;

    return summary;
  }

  private buildOpportunities(data: MarketData): string[] {
    const opps: string[] = [];

    if (data.losers.length > 0) {
      const topLoser = data.losers[0];
      opps.push(
        `${topLoser.symbol} declined ${Math.abs(topLoser.changePercentage ?? 0).toFixed(1)}% — may present a value entry if fundamentals remain sound`,
      );
    }

    const positiveSectors = data.sectors.filter((s) => s.percentage > 0.5);
    if (positiveSectors.length > 0) {
      opps.push(
        `${positiveSectors[0].name} sector showing strength (+${positiveSectors[0].percentage.toFixed(1)}%) — sector momentum plays could be attractive`,
      );
    }

    if (data.active.length > 0) {
      const highVol = data.active[0];
      opps.push(
        `${highVol.symbol} seeing elevated volume (${(highVol.volume ?? 0).toLocaleString()} shares) — increased institutional interest possible`,
      );
    }

    if (opps.length === 0) {
      opps.push(
        'Monitor market for clearer directional signals before committing capital',
        'Consider defensive positions in established blue-chip names',
      );
    }

    return opps;
  }

  private buildRisks(data: MarketData, sentiment: string): string[] {
    const risks: string[] = [];

    if (sentiment === 'BEARISH' || sentiment === 'CAUTIOUS') {
      risks.push(
        'Continued selling pressure may test support levels — tight stop-losses recommended',
      );
    }

    risks.push('Global risk-off sentiment could impact emerging market flows including Sri Lanka');
    risks.push('USD/LKR volatility remains a key concern for import-heavy sectors');

    if (data.turnover && data.turnover < 500_000_000) {
      risks.push(
        'Low market turnover suggests limited conviction — avoid large position sizes in illiquid names',
      );
    }

    risks.push('Upcoming CBSL monetary policy review could shift interest rate expectations');

    return risks.slice(0, 4);
  }

  private buildSectorOutlook(data: MarketData): { sector: string; outlook: string }[] {
    if (data.sectors.length === 0) {
      return [
        { sector: 'Market', outlook: 'Insufficient sector data available — monitor for updates' },
      ];
    }

    const sorted = [...data.sectors].sort((a, b) => b.percentage - a.percentage);
    return sorted.slice(0, 5).map((s) => ({
      sector: s.name,
      outlook:
        s.percentage > 1
          ? `Strong positive momentum (+${s.percentage.toFixed(1)}%). Sector leaders may continue if volume supports.`
          : s.percentage > 0
            ? `Mild gains (+${s.percentage.toFixed(1)}%). Steady but lacks conviction for a breakout.`
            : s.percentage > -1
              ? `Slight weakness (${s.percentage.toFixed(1)}%). Watch for stabilization signals.`
              : `Under pressure (${s.percentage.toFixed(1)}%). Avoid catching falling knives — wait for reversal confirmation.`,
    }));
  }

  private calculateFundamentalScore(stock: Stock, data: MarketData): number {
    let score = 5;
    const change = Number(stock.change_percent) || 0;
    if (change > 2) score += 1;
    if (change > 5) score += 1;
    if (change < -2) score -= 1;
    if (change < -5) score -= 1;
    if (stock.shariah_status === 'compliant') score += 1;
    if (stock.shariah_status === 'non_compliant') score -= 1;
    if (Number(stock.market_cap) > 10_000_000_000) score += 1;
    return Math.max(1, Math.min(10, score));
  }

  private determineConfidence(stock: Stock): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (Number(stock.market_cap) > 50_000_000_000 && stock.last_price) return 'HIGH';
    if (Number(stock.market_cap) > 5_000_000_000) return 'MEDIUM';
    return 'LOW';
  }

  private buildStockAnalysis(
    stock: Stock,
    data: MarketData,
    sectorPerf: SectorData | undefined,
    signal: string,
  ): string {
    const price = Number(stock.last_price) || 0;
    const change = Number(stock.change_percent) || 0;
    const mcap = Number(stock.market_cap) || 0;
    const mcapStr = mcap > 0 ? `LKR ${(mcap / 1_000_000_000).toFixed(2)}B` : 'N/A';

    let analysis = `**${stock.name} (${stock.symbol})**\n\n`;
    analysis += `${stock.name} is a ${stock.sector || 'diversified'} sector company listed on the Colombo Stock Exchange.\n\n`;

    analysis += `**Price Action:** Currently trading at LKR ${price.toFixed(2)} with a ${change >= 0 ? 'positive' : 'negative'} change of ${change > 0 ? '+' : ''}${change.toFixed(2)}% in today's session. `;
    analysis += `The stock is showing ${signal.toLowerCase()} signals based on recent price movement. `;

    if (stock.beta) {
      analysis += `With a beta of ${Number(stock.beta).toFixed(2)}, the stock is ${Number(stock.beta) > 1 ? 'more volatile than' : 'less volatile than'} the broader market.\n\n`;
    } else {
      analysis += '\n\n';
    }

    analysis += `**Fundamentals:** Market capitalization stands at ${mcapStr}. `;
    analysis += mcap > 50_000_000_000
      ? 'As a large-cap stock, it offers relatively better liquidity compared to smaller CSE-listed names.'
      : mcap > 5_000_000_000
        ? 'As a mid-cap stock, it offers a balance of growth potential and reasonable liquidity.'
        : 'As a smaller-cap stock, liquidity may be limited — exercise caution with position sizing.';
    analysis += '\n\n';

    if (sectorPerf) {
      analysis += `**Sector Context:** The ${sectorPerf.name} sector ${sectorPerf.percentage >= 0 ? 'gained' : 'declined'} ${Math.abs(sectorPerf.percentage).toFixed(2)}% today. `;
      analysis += change > sectorPerf.percentage
        ? `${stock.symbol} is outperforming its sector.`
        : change < sectorPerf.percentage
          ? `${stock.symbol} is underperforming relative to its sector peers.`
          : `${stock.symbol} is trading in line with its sector.`;
      analysis += '\n\n';
    }

    if (stock.shariah_status === 'compliant') {
      analysis += `**Shariah Status:** Compliant — suitable for Shariah-sensitive portfolios. Purification calculations should be applied to dividend income.\n\n`;
    } else if (stock.shariah_status === 'non_compliant') {
      analysis += `**Shariah Status:** Non-Compliant — excluded from Shariah-compliant investment universes due to business activity or financial ratio screens.\n\n`;
    } else {
      analysis += `**Shariah Status:** Pending Review — awaiting financial data for comprehensive Tier 2 screening.\n\n`;
    }

    analysis += `*Disclaimer: This analysis is generated for educational purposes only and does not constitute investment advice. Always conduct your own research before making investment decisions.*`;

    return analysis;
  }

  private buildStockRisks(stock: Stock, data: MarketData): string[] {
    const risks: string[] = [];
    const mcap = Number(stock.market_cap) || 0;

    if (mcap < 5_000_000_000) {
      risks.push('Low market cap — liquidity risk and wider bid-ask spreads');
    }

    if (Math.abs(Number(stock.change_percent) || 0) > 5) {
      risks.push('High daily volatility — price may continue to swing sharply');
    }

    if (stock.shariah_status === 'pending_review') {
      risks.push('Shariah compliance status pending — may change upon financial review');
    }

    risks.push('CSE market-wide risk from foreign investor outflows or macro shocks');

    if (stock.sector) {
      risks.push(`${stock.sector} sector-specific regulatory or competitive risks`);
    }

    return risks.slice(0, 4);
  }

  private chatMarketOverview(data: MarketData): string {
    const aspiVal = data.aspiValue?.toFixed(2) ?? 'N/A';
    const aspiChg = data.aspiPercent?.toFixed(2) ?? '0.00';
    const dir = (data.aspiPercent ?? 0) >= 0 ? 'up' : 'down';

    let response = `Here's a quick overview of today's CSE market:\n\n`;
    response += `**ASPI** is ${dir} ${Math.abs(Number(aspiChg))}% at **${aspiVal}** points. `;

    if (data.snpValue) {
      response += `The S&P Sri Lanka 20 is at ${data.snpValue.toFixed(2)} (${(data.snpPercent ?? 0) >= 0 ? '+' : ''}${(data.snpPercent ?? 0).toFixed(2)}%).\n\n`;
    }

    if (data.gainers.length > 0) {
      response += `**Top Gainers:** ${data.gainers.slice(0, 3).map((g) => `${g.symbol} (+${(g.changePercentage ?? 0).toFixed(1)}%)`).join(', ')}\n`;
    }
    if (data.losers.length > 0) {
      response += `**Top Losers:** ${data.losers.slice(0, 3).map((l) => `${l.symbol} (${(l.changePercentage ?? 0).toFixed(1)}%)`).join(', ')}\n\n`;
    }

    response += `Market turnover is ${data.turnover ? `LKR ${(data.turnover / 1_000_000).toFixed(1)}M` : 'not yet available'} with ${data.volume ? `${(data.volume / 1_000_000).toFixed(1)}M shares` : 'volume data pending'}.\n\n`;
    response += `The overall mood is ${(data.aspiPercent ?? 0) > 0.5 ? 'cautiously optimistic' : (data.aspiPercent ?? 0) < -0.5 ? 'risk-averse' : 'mixed'} today. Keep an eye on global cues and any CBSL announcements that could shift sentiment.`;

    return response;
  }

  private chatShariahResponse(data: MarketData): string {
    let response = `Great question about Shariah compliance on the CSE! Here's what you should know:\n\n`;
    response += `The SEC Sri Lanka introduced a standardized **two-tier screening methodology** in September 2024:\n\n`;
    response += `**Tier 1 — Business Activity Screen:** Companies in alcohol (DIST, LION, BREW), tobacco (CTC), conventional banking, and insurance are automatically excluded.\n\n`;
    response += `**Tier 2 — Financial Ratio Screen:** For remaining companies, four ratios must be satisfied:\n`;
    response += `- Interest income < 5% of total revenue\n`;
    response += `- Interest-bearing debt < 30% of market cap\n`;
    response += `- Interest-earning deposits < 30% of market cap\n`;
    response += `- (Receivables + Cash) < 50% of total assets\n\n`;
    response += `For any dividends received from compliant stocks, you should calculate a **purification amount** — the portion of dividend attributable to non-compliant income. Our portfolio tracker has a built-in purification calculator for this.\n\n`;
    response += `*Note: Always consult a qualified Shariah scholar for definitive rulings. This information is based on the SEC Sri Lanka's published methodology.*`;

    return response;
  }

  private chatSectorResponse(data: MarketData): string {
    if (data.sectors.length === 0) {
      return `Sector data is not currently available. This usually refreshes during market hours. Check back when the market is open for real-time sector performance data.`;
    }

    const sorted = [...data.sectors].sort((a, b) => b.percentage - a.percentage);
    let response = `Here's today's **sector performance** on the CSE:\n\n`;

    for (const sector of sorted.slice(0, 8)) {
      const icon = sector.percentage > 0 ? '🟢' : sector.percentage < 0 ? '🔴' : '⚪';
      response += `${icon} **${sector.name}:** ${sector.percentage > 0 ? '+' : ''}${sector.percentage.toFixed(2)}% (${sector.indexValue.toFixed(2)})\n`;
    }

    response += `\nThe strongest sector is **${sorted[0].name}** at +${sorted[0].percentage.toFixed(2)}%, `;
    response += `while **${sorted[sorted.length - 1].name}** is the weakest at ${sorted[sorted.length - 1].percentage.toFixed(2)}%.\n\n`;
    response += `Sector rotation is a key signal — money flowing from one sector to another often precedes broader market moves.`;

    return response;
  }

  private chatGeopoliticalResponse(data: MarketData): string {
    let response = `Geopolitical events can significantly impact the CSE through several transmission channels:\n\n`;
    response += `**1. Oil Prices:** Sri Lanka imports 100% of its oil. Rising oil prices → higher import bill → LKR weakness → inflation → potential rate hikes. This particularly affects transport, manufacturing, and energy-intensive sectors.\n\n`;
    response += `**2. Remittances (~25% from Middle East):** Any Middle East instability directly threatens Sri Lanka's remittance inflows, which are crucial for the balance of payments and consumer spending.\n\n`;
    response += `**3. Tourism:** Global tensions reduce travel appetite. The hotel and leisure sector on the CSE is directly exposed to tourist arrival numbers.\n\n`;
    response += `**4. Tea Exports:** Sri Lanka's #1 export. Russia and Middle East are major buyers — sanctions or trade disruptions impact plantation company revenues.\n\n`;
    response += `**5. Safe Haven Flows:** During global uncertainty, capital flows to USD/gold, away from emerging markets like Sri Lanka. This creates LKR depreciation pressure and potential foreign investor selling on the CSE.\n\n`;

    if (data.aspiValue) {
      response += `Currently with ASPI at ${data.aspiValue.toFixed(2)}, the market is pricing in the prevailing global risk environment. Monitor the USD/LKR rate and foreign investor net flows for early warning signals.`;
    }

    return response;
  }

  private chatEducationalResponse(message: string): string {
    const lower = message.toLowerCase();

    if (lower.includes('p/e')) {
      return `**Price-to-Earnings (P/E) Ratio Explained:**\n\nThe P/E ratio tells you how much investors are paying for every rupee of a company's earnings.\n\n**Formula:** P/E = Share Price ÷ Earnings Per Share (EPS)\n\n**Example:** If a CSE stock is trading at LKR 100 and its EPS is LKR 10, the P/E is 10x. This means investors are paying LKR 10 for every LKR 1 of earnings.\n\n**What's a good P/E?**\n- CSE average is typically 10-15x\n- Below 8x: Could be undervalued OR the market expects problems\n- Above 20x: Growth expectations priced in OR overvalued\n- Compare within sectors, not across them\n\n**Important caveats for CSE:**\n- Many stocks have low liquidity, distorting P/E\n- One-off gains can inflate EPS temporarily\n- Always look at the trend (is P/E expanding or contracting?)`;
    }

    return `Good question! Understanding financial concepts is key to making informed investment decisions.\n\nThe CSE has about 300 listed companies across 20 sectors. When evaluating stocks, consider:\n\n- **Valuation ratios** (P/E, P/B) to assess if a stock is fairly priced\n- **Liquidity** — many CSE stocks trade infrequently, which affects your ability to buy/sell\n- **Sector context** — compare within peers, not across sectors\n- **Macro factors** — CBSL interest rates, inflation, and USD/LKR all matter\n\nFeel free to ask about specific concepts and I'll explain them in the CSE context!`;
  }

  private chatGenericResponse(data: MarketData, message: string): string {
    let response = `Thanks for your question. Let me share some insights based on current CSE data.\n\n`;

    if (data.aspiValue) {
      response += `The ASPI is currently at ${data.aspiValue.toFixed(2)} (${(data.aspiPercent ?? 0) >= 0 ? '+' : ''}${(data.aspiPercent ?? 0).toFixed(2)}% today). `;
    }

    response += `\n\nI can help you with:\n- **Market overview** — ask about today's market movement\n- **Stock analysis** — ask me to analyze any CSE stock (e.g., "Analyze JKH.N0000")\n- **Sector performance** — ask about which sectors are leading\n- **Shariah compliance** — questions about halal investing on the CSE\n- **Financial concepts** — I can explain P/E ratios, technical indicators, etc.\n- **Geopolitical impact** — how global events affect Sri Lankan stocks\n\nWhat would you like to explore?`;

    return response;
  }
}
