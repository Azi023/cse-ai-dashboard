import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import {
  Stock,
  MarketSummary,
  Portfolio,
  NewsItem,
  DailyPrice,
} from '../../entities';
import { RedisService } from '../cse-data/redis.service';

export interface DynamicInsight {
  id: string;
  text: string;
  category: 'market' | 'portfolio' | 'news' | 'education' | 'milestone';
  relevance: 'HIGH' | 'MEDIUM' | 'LOW';
  icon: string;
  actionText?: string;
  actionLink?: string;
  createdAt: string;
}

export interface MarketExplainer {
  id: string;
  trigger: string;
  headline: string;
  explanation: string;
  whatItMeans: string;
  actionSuggestion: string;
  createdAt: string;
  expiresAt: string;
}

interface TradeSummaryItem {
  symbol?: string;
  lastTradedPrice?: number;
  priceChange?: number;
  percentageChange?: number;
  highPrice?: number;
  lowPrice?: number;
  volume?: number;
}

@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);

  constructor(
    @InjectRepository(Stock)
    private readonly stockRepo: Repository<Stock>,
    @InjectRepository(MarketSummary)
    private readonly marketSummaryRepo: Repository<MarketSummary>,
    @InjectRepository(Portfolio)
    private readonly portfolioRepo: Repository<Portfolio>,
    @InjectRepository(NewsItem)
    private readonly newsItemRepo: Repository<NewsItem>,
    @InjectRepository(DailyPrice)
    private readonly dailyPriceRepo: Repository<DailyPrice>,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Returns 3-5 most relevant dynamic insights based on real market and portfolio data.
   * Priority: breaking news > portfolio alerts > market insights > education
   */
  async getCurrentInsights(): Promise<DynamicInsight[]> {
    const insights: DynamicInsight[] = [];

    try {
      const [
        newsInsights,
        portfolioInsights,
        marketInsights,
        milestoneInsights,
      ] = await Promise.all([
        this.generateNewsInsights(),
        this.generatePortfolioInsights(),
        this.generateMarketInsights(),
        this.generateMilestoneInsights(),
      ]);

      // Priority order: news > portfolio > market > milestones
      insights.push(...newsInsights);
      insights.push(...portfolioInsights);
      insights.push(...marketInsights);
      insights.push(...milestoneInsights);
    } catch (error) {
      this.logger.error(
        `Error generating dynamic insights: ${String(error)}`,
      );
    }

    // If we have fewer than 3 insights, pad with education fallbacks
    if (insights.length < 3) {
      const educationInsights = await this.generateEducationFallbacks();
      insights.push(
        ...educationInsights.slice(0, 3 - insights.length),
      );
    }

    // Return top 5, sorted by relevance
    const relevanceOrder: Record<string, number> = {
      HIGH: 0,
      MEDIUM: 1,
      LOW: 2,
    };
    insights.sort(
      (a, b) => relevanceOrder[a.relevance] - relevanceOrder[b.relevance],
    );

    return insights.slice(0, 5);
  }

  /**
   * Generate a plain-language market explainer when ASPI moves > 2%.
   * Returns null if no significant move today.
   */
  async getMarketExplainer(): Promise<MarketExplainer | null> {
    try {
      const latestSummary = await this.marketSummaryRepo.find({
        order: { summary_date: 'DESC' },
        take: 1,
      });

      if (!latestSummary.length) return null;

      const summary = latestSummary[0];
      const changePercent = Number(summary.aspi_change_percent) || 0;

      if (Math.abs(changePercent) < 2) return null;

      const direction = changePercent > 0 ? 'up' : 'down';
      const absChange = Math.abs(changePercent).toFixed(2);

      // Get recent high-impact news
      const oneDayAgo = new Date();
      oneDayAgo.setHours(oneDayAgo.getHours() - 24);

      const recentNews = await this.newsItemRepo.find({
        where: {
          impact_level: 'HIGH',
          published_at: MoreThanOrEqual(oneDayAgo),
        },
        order: { published_at: 'DESC' },
        take: 3,
      });

      // Calculate portfolio impact
      const openPositions = await this.portfolioRepo.find({
        where: { is_open: true },
      });

      let portfolioImpactText = '';
      if (openPositions.length > 0) {
        const totalInvested = openPositions.reduce(
          (sum, p) => sum + Number(p.buy_price) * p.quantity,
          0,
        );
        const estimatedImpact = totalInvested * (changePercent / 100);
        const impactDirection = estimatedImpact > 0 ? 'gained' : 'lost';
        portfolioImpactText = `Your portfolio may have ${impactDirection} approximately LKR ${Math.abs(estimatedImpact).toLocaleString('en-US', { maximumFractionDigits: 0 })} today based on market movement.`;
      }

      const newsContext =
        recentNews.length > 0
          ? `Recent developments: ${recentNews.map((n) => n.title).join('; ')}.`
          : 'No major news catalysts identified yet.';

      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setHours(expiresAt.getHours() + 12);

      const isDown = changePercent < 0;

      return {
        id: `explainer-${summary.summary_date}`,
        trigger: `ASPI ${direction} ${absChange}%`,
        headline: isDown
          ? `Market dropped ${absChange}% today — here's what it means for you`
          : `Market surged ${absChange}% today — here's the context`,
        explanation: `The All Share Price Index (ASPI) moved ${direction} by ${absChange}% to ${Number(summary.aspi_value).toLocaleString('en-US', { maximumFractionDigits: 2 })}. ${newsContext}`,
        whatItMeans: portfolioImpactText || `A ${absChange}% move is significant. ${isDown ? 'Market drops of this size often recover within days to weeks on the CSE.' : 'Strong rallies can signal renewed investor confidence.'}`,
        actionSuggestion: isDown
          ? "Stay calm. Your LKR 10,000 monthly deposit now buys more shares at lower prices. Rupee Cost Averaging works best when you don't react emotionally to drops."
          : "Don't chase the rally. Stick to your monthly investment plan. Buying after a big surge means you're paying higher prices.",
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `Error generating market explainer: ${String(error)}`,
      );
      return null;
    }
  }

  /**
   * Generate data-backed educational tips using real portfolio and market data.
   */
  async getEducationalTips(): Promise<DynamicInsight[]> {
    const tips: DynamicInsight[] = [];
    const now = new Date().toISOString();

    try {
      // Tip 1: Transaction cost awareness using real data
      const openPositions = await this.portfolioRepo.find({
        where: { is_open: true },
      });

      if (openPositions.length > 0) {
        const avgBuyPrice =
          openPositions.reduce((sum, p) => sum + Number(p.buy_price), 0) /
          openPositions.length;
        const breakEvenPercent = 2.24; // ~1.12% each way on CSE

        tips.push({
          id: `edu-txn-cost-${Date.now()}`,
          text: `Transaction costs on CSE are about 1.12% per trade (broker commission + SEC levy + CSE fee). With your average buy price of LKR ${avgBuyPrice.toFixed(2)}, each stock needs to rise at least ${breakEvenPercent}% before you break even. This is why frequent trading erodes returns.`,
          category: 'education',
          relevance: 'MEDIUM',
          icon: '\ud83d\udcb0',
          createdAt: now,
        });
      } else {
        tips.push({
          id: `edu-txn-cost-${Date.now()}`,
          text: 'Transaction costs on CSE are about 1.12% per trade (broker commission + SEC levy + CSE fee). A stock needs to go up at least 2.24% before you break even after buying and selling. This is why long-term holding beats frequent trading.',
          category: 'education',
          relevance: 'MEDIUM',
          icon: '\ud83d\udcb0',
          createdAt: now,
        });
      }

      // Tip 2: Historical market context
      const summaryCount = await this.marketSummaryRepo.count();
      const latestSummaries = await this.marketSummaryRepo.find({
        order: { summary_date: 'DESC' },
        take: 30,
      });

      if (latestSummaries.length >= 10) {
        const positiveCount = latestSummaries.filter(
          (s) => Number(s.aspi_change_percent) > 0,
        ).length;
        const positivePercent = (
          (positiveCount / latestSummaries.length) *
          100
        ).toFixed(0);

        tips.push({
          id: `edu-market-history-${Date.now()}`,
          text: `In the last ${latestSummaries.length} trading days, the CSE was up on ${positiveCount} days (${positivePercent}% of the time). Markets don't go up every day, but historically they trend upward over years. Your monthly LKR 10,000 strategy removes the pressure of timing.`,
          category: 'education',
          relevance: 'MEDIUM',
          icon: '\ud83d\udcc8',
          createdAt: now,
        });
      } else {
        tips.push({
          id: `edu-market-history-${Date.now()}`,
          text: `We have ${summaryCount} days of market data tracked so far. Over long periods, the CSE ASPI has historically trended upward despite short-term volatility. Rupee Cost Averaging with LKR 10,000/month smooths out the bumps.`,
          category: 'education',
          relevance: 'MEDIUM',
          icon: '\ud83d\udcc8',
          createdAt: now,
        });
      }

      // Tip 3: Portfolio-specific education
      if (openPositions.length > 0) {
        const symbols = openPositions.map((p) => p.symbol);
        const stocks = await this.stockRepo.find({
          where: symbols.map((s) => ({ symbol: s })),
        });
        const sectors = [
          ...new Set(stocks.map((s) => s.sector).filter(Boolean)),
        ];

        if (sectors.length === 1 && openPositions.length > 1) {
          tips.push({
            id: `edu-diversification-${Date.now()}`,
            text: `All ${openPositions.length} of your holdings are in the ${sectors[0]} sector. Diversifying across sectors (like manufacturing, plantations, or conglomerates) reduces risk — if one sector struggles, others may hold steady.`,
            category: 'education',
            relevance: 'HIGH',
            icon: '\ud83c\udfaf',
            createdAt: now,
          });
        } else if (sectors.length > 1) {
          tips.push({
            id: `edu-diversification-${Date.now()}`,
            text: `Your portfolio spans ${sectors.length} sectors: ${sectors.join(', ')}. Good diversification! Each sector responds differently to economic changes, which helps protect your overall portfolio.`,
            category: 'education',
            relevance: 'LOW',
            icon: '\u2705',
            createdAt: now,
          });
        } else {
          tips.push({
            id: `edu-rca-${Date.now()}`,
            text: 'With Rupee Cost Averaging at LKR 10,000/month, you buy more shares when prices are low and fewer when prices are high. Over time, this lowers your average cost per share compared to trying to time the market.',
            category: 'education',
            relevance: 'MEDIUM',
            icon: '\ud83d\udcc5',
            createdAt: now,
          });
        }
      } else {
        tips.push({
          id: `edu-rca-${Date.now()}`,
          text: 'With Rupee Cost Averaging at LKR 10,000/month, you buy more shares when prices are low and fewer when prices are high. Over time, this lowers your average cost per share compared to trying to time the market.',
          category: 'education',
          relevance: 'MEDIUM',
          icon: '\ud83d\udcc5',
          createdAt: now,
        });
      }
    } catch (error) {
      this.logger.error(
        `Error generating educational tips: ${String(error)}`,
      );

      // Fallback static tips if data fails
      tips.push(
        {
          id: `edu-fallback-1-${Date.now()}`,
          text: 'CSE transaction costs are about 1.12% per trade. Your stock needs to rise 2.24% before you break even. Long-term holding minimizes the impact of these costs.',
          category: 'education',
          relevance: 'MEDIUM',
          icon: '\ud83d\udcb0',
          createdAt: now,
        },
        {
          id: `edu-fallback-2-${Date.now()}`,
          text: 'Rupee Cost Averaging means investing a fixed LKR 10,000 every month regardless of market conditions. This removes emotion from investing and historically outperforms market timing.',
          category: 'education',
          relevance: 'MEDIUM',
          icon: '\ud83d\udcc5',
          createdAt: now,
        },
        {
          id: `edu-fallback-3-${Date.now()}`,
          text: 'Diversification across sectors reduces risk. If one industry faces challenges, holdings in other sectors can offset losses.',
          category: 'education',
          relevance: 'MEDIUM',
          icon: '\ud83c\udfaf',
          createdAt: now,
        },
      );
    }

    return tips.slice(0, 3);
  }

  // ───────────────────────────────────────────────
  // Private helper methods for insight generation
  // ───────────────────────────────────────────────

  private async generateNewsInsights(): Promise<DynamicInsight[]> {
    const insights: DynamicInsight[] = [];
    const now = new Date().toISOString();

    try {
      const oneDayAgo = new Date();
      oneDayAgo.setHours(oneDayAgo.getHours() - 24);

      const breakingNews = await this.newsItemRepo.find({
        where: {
          impact_level: 'HIGH',
          published_at: MoreThanOrEqual(oneDayAgo),
        },
        order: { published_at: 'DESC' },
        take: 2,
      });

      for (const news of breakingNews) {
        const affectedText =
          news.affected_symbols && news.affected_symbols.length > 0
            ? ` Affected stocks: ${news.affected_symbols.join(', ')}.`
            : '';
        const directionEmoji =
          news.impact_direction === 'POSITIVE'
            ? '\ud83d\udfe2'
            : news.impact_direction === 'NEGATIVE'
              ? '\ud83d\udd34'
              : '\ud83d\udfe1';

        insights.push({
          id: `news-${news.id}`,
          text: `${news.title}.${affectedText}${news.summary ? ' ' + news.summary : ''}`,
          category: 'news',
          relevance: 'HIGH',
          icon: directionEmoji,
          actionText: news.url ? 'Read more' : undefined,
          actionLink: news.url || undefined,
          createdAt: now,
        });
      }
    } catch (error) {
      this.logger.warn(`Error generating news insights: ${String(error)}`);
    }

    return insights;
  }

  private async generatePortfolioInsights(): Promise<DynamicInsight[]> {
    const insights: DynamicInsight[] = [];
    const now = new Date().toISOString();

    try {
      const openPositions = await this.portfolioRepo.find({
        where: { is_open: true },
      });

      if (openPositions.length === 0) return insights;

      // Get live trade data from Redis
      const cached = await this.redisService.getJson<{
        reqTradeSummery?: TradeSummaryItem[];
      }>('cse:trade_summary');
      const tradeData = cached?.reqTradeSummery || [];

      // Build a map of current prices from live data
      const priceMap = new Map<string, number>();
      for (const trade of tradeData) {
        if (trade.symbol && trade.lastTradedPrice) {
          priceMap.set(trade.symbol, trade.lastTradedPrice);
        }
      }

      // Check for new highs among holdings
      for (const position of openPositions) {
        const currentPrice = priceMap.get(position.symbol);
        if (!currentPrice) continue;

        // Get historical high for this stock
        const stock = await this.stockRepo.findOne({
          where: { symbol: position.symbol },
        });
        if (!stock) continue;

        const historicalPrices = await this.dailyPriceRepo.find({
          where: { stock_id: stock.id },
          order: { high: 'DESC' },
          take: 1,
        });

        if (historicalPrices.length > 0) {
          const historicalHigh = Number(historicalPrices[0].high);
          if (currentPrice >= historicalHigh * 0.98) {
            const buyPrice = Number(position.buy_price);
            const returnPercent = (
              ((currentPrice - buyPrice) / buyPrice) *
              100
            ).toFixed(1);

            insights.push({
              id: `high-${position.symbol}-${Date.now()}`,
              text: `${position.symbol} is near its highest price in our records (LKR ${currentPrice.toFixed(2)}). Your position is ${Number(returnPercent) >= 0 ? 'up' : 'down'} ${returnPercent}% from your buy price of LKR ${buyPrice.toFixed(2)}.`,
              category: 'portfolio',
              relevance: 'HIGH',
              icon: '\ud83d\ude80',
              actionLink: `/stocks/${position.symbol}`,
              actionText: 'View stock',
              createdAt: now,
            });
          }
        }
      }

      // Check portfolio concentration
      const totalValue = openPositions.reduce((sum, p) => {
        const price = priceMap.get(p.symbol) || Number(p.buy_price);
        return sum + price * p.quantity;
      }, 0);

      if (totalValue > 0) {
        for (const position of openPositions) {
          const price =
            priceMap.get(position.symbol) || Number(position.buy_price);
          const positionValue = price * position.quantity;
          const concentration = (positionValue / totalValue) * 100;

          if (concentration > 50 && openPositions.length > 1) {
            insights.push({
              id: `concentration-${position.symbol}-${Date.now()}`,
              text: `${concentration.toFixed(0)}% of your portfolio is in ${position.symbol}. Consider adding a stock from a different sector to reduce risk. Diversification protects against single-stock volatility.`,
              category: 'portfolio',
              relevance: 'MEDIUM',
              icon: '\u26a0\ufe0f',
              actionText: 'Explore sectors',
              actionLink: '/sectors',
              createdAt: now,
            });
            break; // Only one concentration warning
          }
        }
      }

      // Check if portfolio is growing overall
      if (totalValue > 0) {
        const totalCost = openPositions.reduce(
          (sum, p) => sum + Number(p.buy_price) * p.quantity,
          0,
        );
        const totalReturn = ((totalValue - totalCost) / totalCost) * 100;

        if (totalReturn > 5) {
          insights.push({
            id: `portfolio-growth-${Date.now()}`,
            text: `Your portfolio is up ${totalReturn.toFixed(1)}% overall (cost: LKR ${totalCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}, value: LKR ${totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}). That's better than a savings account earning ~6%/year. Keep the monthly deposits going!`,
            category: 'portfolio',
            relevance: 'MEDIUM',
            icon: '\ud83d\udcc8',
            createdAt: now,
          });
        }
      }
    } catch (error) {
      this.logger.warn(
        `Error generating portfolio insights: ${String(error)}`,
      );
    }

    return insights;
  }

  private async generateMarketInsights(): Promise<DynamicInsight[]> {
    const insights: DynamicInsight[] = [];
    const now = new Date().toISOString();

    try {
      const recentSummaries = await this.marketSummaryRepo.find({
        order: { summary_date: 'DESC' },
        take: 5,
      });

      if (recentSummaries.length === 0) return insights;

      const latest = recentSummaries[0];
      const changePercent = Number(latest.aspi_change_percent) || 0;

      // Market drop > 2%
      if (changePercent < -2) {
        const absChange = Math.abs(changePercent).toFixed(2);
        // Calculate how much more shares the monthly LKR 10,000 buys
        const extraPercent = Math.abs(changePercent).toFixed(1);

        insights.push({
          id: `market-drop-${Date.now()}`,
          text: `The market dropped ${absChange}% today. Your LKR 10,000 monthly investment now buys roughly ${extraPercent}% more shares than yesterday. Long-term investors see dips as opportunities, not threats.`,
          category: 'market',
          relevance: 'HIGH',
          icon: '\ud83d\udcc9',
          createdAt: now,
        });
      }

      // Market recovery after drop
      if (
        recentSummaries.length >= 3 &&
        changePercent > 0
      ) {
        // Check if there was a drop in the last few days followed by recovery
        const previousDrop = recentSummaries
          .slice(1, 4)
          .find((s) => Number(s.aspi_change_percent) < -1.5);

        if (previousDrop) {
          const dropPercent = Math.abs(
            Number(previousDrop.aspi_change_percent),
          ).toFixed(2);

          insights.push({
            id: `market-recovery-${Date.now()}`,
            text: `The market recovered ${changePercent.toFixed(2)}% today after a ${dropPercent}% drop recently. This pattern is typical — the CSE has historically recovered from similar drops. Staying invested through volatility is key.`,
            category: 'market',
            relevance: 'MEDIUM',
            icon: '\ud83d\udfe2',
            createdAt: now,
          });
        }
      }

      // Market surge > 2%
      if (changePercent > 2) {
        insights.push({
          id: `market-surge-${Date.now()}`,
          text: `The market surged ${changePercent.toFixed(2)}% today! ASPI is at ${Number(latest.aspi_value).toLocaleString('en-US', { maximumFractionDigits: 2 })}. While exciting, remember that consistent monthly investing outperforms chasing rallies.`,
          category: 'market',
          relevance: 'MEDIUM',
          icon: '\ud83d\ude80',
          createdAt: now,
        });
      }
    } catch (error) {
      this.logger.warn(
        `Error generating market insights: ${String(error)}`,
      );
    }

    return insights;
  }

  private async generateMilestoneInsights(): Promise<DynamicInsight[]> {
    const insights: DynamicInsight[] = [];
    const now = new Date().toISOString();

    try {
      // Check deposit consistency
      const openPositions = await this.portfolioRepo.find({
        where: { is_open: true },
        order: { buy_date: 'ASC' },
      });

      if (openPositions.length > 0) {
        const firstBuyDate = new Date(openPositions[0].buy_date);
        const monthsInvesting = Math.floor(
          (Date.now() - firstBuyDate.getTime()) / (1000 * 60 * 60 * 24 * 30),
        );

        if (monthsInvesting >= 3) {
          const totalInvested = openPositions.reduce(
            (sum, p) => sum + Number(p.buy_price) * p.quantity,
            0,
          );

          insights.push({
            id: `milestone-streak-${Date.now()}`,
            text: `You've been investing for ${monthsInvesting} months! Total invested: LKR ${totalInvested.toLocaleString('en-US', { maximumFractionDigits: 0 })}. Consistency is the #1 factor in long-term wealth building. Keep it up!`,
            category: 'milestone',
            relevance: 'LOW',
            icon: '\ud83c\udfc6',
            createdAt: now,
          });
        }
      }
    } catch (error) {
      this.logger.warn(
        `Error generating milestone insights: ${String(error)}`,
      );
    }

    return insights;
  }

  private async generateEducationFallbacks(): Promise<DynamicInsight[]> {
    const now = new Date().toISOString();

    const fallbacks: DynamicInsight[] = [
      {
        id: `edu-txn-${Date.now()}`,
        text: 'Transaction costs on CSE are about 1.12% per trade (broker commission + SEC levy + CSE fee). Your stock needs to go up 2.24% before you break even after a round trip. This is why buy-and-hold beats frequent trading.',
        category: 'education',
        relevance: 'LOW',
        icon: '\ud83d\udcb0',
        createdAt: now,
      },
      {
        id: `edu-rca-${Date.now()}`,
        text: 'Rupee Cost Averaging (investing LKR 10,000 monthly) means you buy more shares when prices are low and fewer when high. Over time, this lowers your average cost and removes the stress of market timing.',
        category: 'education',
        relevance: 'LOW',
        icon: '\ud83d\udcc5',
        createdAt: now,
      },
      {
        id: `edu-shariah-${Date.now()}`,
        text: 'Shariah screening filters stocks by business activity (no alcohol, tobacco, gambling, conventional banking) and financial ratios (debt < 30%, interest income < 5%). This aligns investments with ethical principles while maintaining solid returns.',
        category: 'education',
        relevance: 'LOW',
        icon: '\u2699\ufe0f',
        createdAt: now,
      },
    ];

    // Try to enhance with real data
    try {
      const latestSummary = await this.marketSummaryRepo.find({
        order: { summary_date: 'DESC' },
        take: 1,
      });

      if (latestSummary.length > 0 && latestSummary[0].aspi_value) {
        fallbacks[0] = {
          id: `edu-aspi-${Date.now()}`,
          text: `The ASPI is currently at ${Number(latestSummary[0].aspi_value).toLocaleString('en-US', { maximumFractionDigits: 2 })}. This index tracks all stocks on the CSE, weighted by market cap. When the ASPI rises, it means the overall market value is increasing — but individual stocks can still move differently.`,
          category: 'education',
          relevance: 'LOW',
          icon: '\ud83d\udcca',
          createdAt: now,
        };
      }
    } catch {
      // Use static fallbacks if data query fails
    }

    return fallbacks;
  }
}
