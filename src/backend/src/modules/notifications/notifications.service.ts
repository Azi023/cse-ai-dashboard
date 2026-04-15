import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { DailyDigest } from '../../entities/daily-digest.entity';
import { WeeklyBrief } from '../../entities/weekly-brief.entity';
import { Alert, Announcement, MarketSummary } from '../../entities';
import { RedisService } from '../cse-data/redis.service';
import {
  PortfolioService,
  HoldingWithPnL,
} from '../portfolio/portfolio.service';
import { AnalysisService } from '../analysis/analysis.service';
import { AiContextBridgeService } from '../strategy-engine/ai-context-bridge.service';
import { AiUsageService } from '../ai-engine/ai-usage.service';

const DAILY_DIGEST_PREFIX = 'digest:daily:';
const WEEKLY_BRIEF_PREFIX = 'brief:weekly:';

interface TradeItem {
  symbol?: string;
  name?: string;
  price?: number;
  change?: number;
  percentageChange?: number;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(DailyDigest)
    private readonly dailyDigestRepository: Repository<DailyDigest>,
    @InjectRepository(WeeklyBrief)
    private readonly weeklyBriefRepository: Repository<WeeklyBrief>,
    @InjectRepository(Alert)
    private readonly alertRepository: Repository<Alert>,
    @InjectRepository(Announcement)
    private readonly announcementRepository: Repository<Announcement>,
    @InjectRepository(MarketSummary)
    private readonly marketSummaryRepository: Repository<MarketSummary>,
    private readonly redisService: RedisService,
    private readonly portfolioService: PortfolioService,
    private readonly configService: ConfigService,
    private readonly analysisService: AnalysisService,
    private readonly aiContextBridge: AiContextBridgeService,
    private readonly aiUsage: AiUsageService,
  ) {}

  // ---------------------------------------------------------------------------
  // Cron Jobs
  // ---------------------------------------------------------------------------

  /**
   * Daily digest at 2:45 PM SLT on weekdays.
   * VPS timezone is Asia/Colombo — cron times are SLT directly.
   */
  @Cron('45 14 * * 1-5', { name: 'daily-digest-generator' })
  async generateDailyDigest(): Promise<void> {
    const today = this.getTodayDateStr();
    this.logger.log(`Generating daily digest for ${today}`);

    try {
      const content = await this.buildDailyDigestContent(today);
      if (!content) {
        this.logger.warn(
          'Daily digest: no market data available (holiday?), skipping',
        );
        return;
      }

      // Upsert into DB
      const existing = await this.dailyDigestRepository.findOne({
        where: { date: today },
      });
      if (existing) {
        existing.content = content;
        await this.dailyDigestRepository.save(existing);
      } else {
        await this.dailyDigestRepository.save(
          this.dailyDigestRepository.create({ date: today, content }),
        );
      }

      // Cache in Redis for 24 hours
      await this.redisService.set(
        `${DAILY_DIGEST_PREFIX}${today}`,
        content,
        86_400,
      );

      // Create alert for notification bell
      await this.createNotificationAlert(
        'daily_digest',
        `Daily Market Digest — ${today}`,
        content,
      );

      this.logger.log(`Daily digest saved for ${today}`);
    } catch (error) {
      this.logger.error(
        `Failed to generate daily digest: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Weekly strategic brief at 3:00 PM SLT on Fridays.
   * VPS timezone is Asia/Colombo — cron times are SLT directly.
   */
  @Cron('0 15 * * 5', { name: 'weekly-brief-generator' })
  async generateWeeklyBrief(): Promise<void> {
    const { weekStart, weekEnd, weekId } = this.getCurrentWeekRange();
    this.logger.log(`Generating weekly brief for week ${weekId}`);

    try {
      const { content, modelUsed, tokensUsed } =
        await this.buildWeeklyBriefContent(weekStart, weekEnd);
      if (!content) {
        this.logger.warn('Weekly brief: insufficient data, skipping');
        return;
      }

      // Upsert into DB
      const existing = await this.weeklyBriefRepository.findOne({
        where: { week_start: weekStart },
      });
      if (existing) {
        existing.content = content;
        existing.model_used = modelUsed;
        existing.tokens_used = tokensUsed;
        await this.weeklyBriefRepository.save(existing);
      } else {
        await this.weeklyBriefRepository.save(
          this.weeklyBriefRepository.create({
            week_start: weekStart,
            week_end: weekEnd,
            content,
            model_used: modelUsed,
            tokens_used: tokensUsed,
          }),
        );
      }

      // Cache in Redis for 7 days
      await this.redisService.set(
        `${WEEKLY_BRIEF_PREFIX}${weekId}`,
        content,
        7 * 86_400,
      );

      // Create alert for notification bell
      await this.createNotificationAlert(
        'weekly_brief',
        `Weekly CSE Strategic Brief — Week ${weekId}`,
        content,
      );

      this.logger.log(`Weekly brief saved for week ${weekId}`);
    } catch (error) {
      this.logger.error(
        `Failed to generate weekly brief: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Public GET methods
  // ---------------------------------------------------------------------------

  async getLatestDailyDigest(): Promise<DailyDigest | null> {
    const rows = await this.dailyDigestRepository.find({
      order: { date: 'DESC' },
      take: 1,
    });
    return rows[0] ?? null;
  }

  async getDailyDigestByDate(date: string): Promise<DailyDigest | null> {
    return this.dailyDigestRepository.findOneBy({ date });
  }

  async getLatestWeeklyBrief(): Promise<WeeklyBrief | null> {
    const rows = await this.weeklyBriefRepository.find({
      order: { week_start: 'DESC' },
      take: 1,
    });
    return rows[0] ?? null;
  }

  async getWeeklyBriefByWeekId(weekId: string): Promise<WeeklyBrief | null> {
    const parts = weekId.split('-');
    if (parts.length !== 2) return null;
    const year = parseInt(parts[0], 10);
    const week = parseInt(parts[1], 10);
    if (!year || !week) return null;
    const weekStart = this.getISOWeekStartDate(year, week);
    return this.weeklyBriefRepository.findOneBy({ week_start: weekStart });
  }

  async getMonthlyTokenUsage(): Promise<{
    month: string;
    tokens_used: number;
    limit: number;
    pct_used: number;
    model_note: string;
  }> {
    const u = await this.aiUsage.usage();
    return {
      month: u.month,
      tokens_used: u.tokens_used,
      limit: u.limit,
      pct_used: u.pct_used,
      model_note: u.over_budget
        ? 'Budget exceeded — weekly brief switched to Haiku'
        : 'Budget OK — weekly brief uses Sonnet',
    };
  }

  // ---------------------------------------------------------------------------
  // Private: data gathering + Claude calls
  // ---------------------------------------------------------------------------

  private async buildDailyDigestContent(date: string): Promise<string | null> {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      this.logger.warn('No ANTHROPIC_API_KEY — skipping daily digest');
      return null;
    }

    // Gather data in parallel
    const [marketSummary, topGainers, topLosers] = await Promise.all([
      this.redisService.getJson<Record<string, unknown>>('cse:market_summary'),
      this.redisService.getJson<TradeItem[]>('cse:top_gainers'),
      this.redisService.getJson<TradeItem[]>('cse:top_losers'),
    ]);
    const holdings: HoldingWithPnL[] = await this.portfolioService
      .getAllHoldings()
      .catch((): HoldingWithPnL[] => []);

    // If no market summary, the market was probably closed (holiday)
    if (!marketSummary) return null;

    // Portfolio announcements for today
    const portfolioSymbols = holdings.map((h) => h.symbol);
    const todayAnnouncements =
      portfolioSymbols.length > 0
        ? await this.announcementRepository
            .createQueryBuilder('a')
            .where('a.symbol IN (:...symbols)', { symbols: portfolioSymbols })
            .andWhere('DATE(a.announced_at) = :date', { date })
            .orderBy('a.announced_at', 'DESC')
            .getMany()
        : [];

    const totalDailyPnl = holdings.reduce(
      (sum, h) => sum + (h.daily_change ?? 0),
      0,
    );
    const holdingsSummary = holdings.map((h) => ({
      symbol: h.symbol,
      daily_change_lkr:
        h.daily_change != null ? Math.round(h.daily_change) : null,
      daily_change_pct:
        h.current_price != null && h.buy_price > 0
          ? null // daily_change_pct not available on HoldingWithPnL
          : null,
      pnl_pct:
        h.pnl_percent != null ? Math.round(h.pnl_percent * 10) / 10 : null,
    }));

    // Crash flags
    const aspiChangePct = (marketSummary as Record<string, unknown>)
      ?.aspiChangePercent as number | undefined;
    const aspiCrash = aspiChangePct != null && aspiChangePct <= -3;

    const bigDroppers = (topLosers ?? []).filter(
      (s) => s.percentageChange != null && s.percentageChange <= -5,
    );
    const portfolioDroppers = holdings.filter(
      (h) =>
        h.daily_change != null &&
        h.current_price != null &&
        h.current_price > 0 &&
        h.daily_change / (h.current_price * h.quantity) <= -0.05,
    );

    const alerts: string[] = [];
    if (aspiCrash) {
      alerts.push(
        `⚠️ CRASH ALERT: ASPI dropped ${aspiChangePct?.toFixed(2)}% today. Consider reviewing Crash Protocol.`,
      );
    }
    if (portfolioDroppers.length > 0) {
      alerts.push(
        `Holdings alert: ${portfolioDroppers.map((h) => h.symbol).join(', ')} dropped >5% today.`,
      );
    }
    if (bigDroppers.length > 0) {
      alerts.push(
        `Market movers down >5%: ${bigDroppers.map((s) => `${s.symbol ?? ''} (${s.percentageChange?.toFixed(1)}%)`).join(', ')}`,
      );
    }

    // Strategy context (non-blocking — degrade gracefully if unavailable)
    let strategyBlock = '';
    try {
      const engineSummary = await this.aiContextBridge.getEngineSummary();
      if (engineSummary.regime) {
        strategyBlock =
          `\nStrategy Engine: Market regime is ${engineSummary.regime} ` +
          `(${engineSummary.regimeConfidence ?? '?'}% confidence). ` +
          `${engineSummary.todaySignalCount} strategy signal(s) generated today.`;
      }
    } catch {
      // Strategy context unavailable — proceed without it
    }

    const context = [
      `Market Data: ${JSON.stringify(marketSummary)}`,
      `Top 3 Gainers: ${JSON.stringify((topGainers ?? []).slice(0, 3))}`,
      `Top 3 Losers: ${JSON.stringify((topLosers ?? []).slice(0, 3))}`,
      `Portfolio (${holdings.length} holdings, daily P&L: LKR ${totalDailyPnl.toFixed(0)}): ${JSON.stringify(holdingsSummary)}`,
      `Portfolio Announcements Today: ${todayAnnouncements.length > 0 ? todayAnnouncements.map((a) => `${a.symbol}: ${a.title}`).join(' | ') : 'None'}`,
      alerts.length > 0 ? `ALERTS: ${alerts.join(' | ')}` : '',
      strategyBlock || '',
    ]
      .filter(Boolean)
      .join('\n');

    const crashInstruction = aspiCrash
      ? `IMPORTANT: The market dropped >3% today. Include the crash alert in your summary and remind the user to stay calm and stick to their RCA strategy.`
      : '';

    const prompt =
      `You are a concise market analyst. Summarize today's CSE market close in 3-4 sentences. ` +
      `Then summarize the user's portfolio performance in 2 sentences. ` +
      (strategyBlock ? `Mention the current market regime if relevant. ` : '') +
      (crashInstruction ? crashInstruction + ' ' : '') +
      `Keep it under 150 words total. Be factual, not advisory.\n\nContext:\n${context}`;

    const { text, tokensUsed } = await this.callClaude(
      'claude-haiku-4-5-20251001',
      prompt,
      350,
    );
    await this.aiUsage.track(tokensUsed);
    return text || null;
  }

  private async buildWeeklyBriefContent(
    weekStart: string,
    weekEnd: string,
  ): Promise<{
    content: string | null;
    modelUsed: string;
    tokensUsed: number;
  }> {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) return { content: null, modelUsed: '', tokensUsed: 0 };

    // Downgrade model if over monthly budget
    const overBudget = await this.aiUsage.shouldUseHaiku();
    const model = overBudget
      ? 'claude-haiku-4-5-20251001'
      : 'claude-sonnet-4-6';
    if (overBudget) {
      this.logger.warn(
        'Monthly token budget exceeded — using Haiku for weekly brief',
      );
    }

    // Gather weekly market data from DB
    const weekMarketData = await this.marketSummaryRepository.find({
      where: {
        summary_date: Between(
          new Date(weekStart),
          new Date(weekEnd),
        ) as unknown as Date,
      },
      order: { summary_date: 'ASC' },
    });

    const holdings: HoldingWithPnL[] = await this.portfolioService
      .getAllHoldings()
      .catch((): HoldingWithPnL[] => []);
    const sectorData =
      await this.redisService.getJson<unknown[]>('cse:all_sectors');

    const portfolioSymbols = holdings.map((h) => h.symbol);

    // Announcements for portfolio stocks during the week
    const weekAnnouncements =
      portfolioSymbols.length > 0
        ? await this.announcementRepository
            .createQueryBuilder('a')
            .where('a.symbol IN (:...symbols)', { symbols: portfolioSymbols })
            .andWhere('a.announced_at >= :start AND a.announced_at <= :end', {
              start: `${weekStart} 00:00:00`,
              end: `${weekEnd} 23:59:59`,
            })
            .orderBy('a.announced_at', 'DESC')
            .getMany()
        : [];

    const aspiWeek = weekMarketData.map((d) => ({
      date: String(d.summary_date).split('T')[0],
      aspi: d.aspi_value != null ? Number(d.aspi_value) : null,
      chg_pct:
        d.aspi_change_percent != null ? Number(d.aspi_change_percent) : null,
      turnover_m:
        d.total_turnover != null
          ? Math.round(Number(d.total_turnover) / 1_000_000)
          : null,
    }));

    const totalInvested = holdings.reduce(
      (sum, h) => sum + h.invested_value,
      0,
    );
    const totalCurrent = holdings.reduce(
      (sum, h) => sum + (h.current_value ?? 0),
      0,
    );
    const portfolioPnl = totalCurrent - totalInvested;
    const portfolioPnlPct =
      totalInvested > 0
        ? ((portfolioPnl / totalInvested) * 100).toFixed(1)
        : '0';

    // Fetch AI recommendation and top scores for enrichment
    const [latestRec, topScores] = await Promise.all([
      this.analysisService.getLatestRecommendation().catch(() => null),
      this.analysisService
        .getTodayScores(5)
        .catch(
          (): Awaited<
            ReturnType<typeof this.analysisService.getTodayScores>
          > => [],
        ),
    ]);

    const recSection = latestRec
      ? `AI Weekly Pick: ${latestRec.recommended_stock} (${latestRec.confidence} confidence) — ${latestRec.reasoning}`
      : 'AI Weekly Pick: Not yet generated (scoring data accumulating)';

    const scoresSection =
      topScores.length > 0
        ? `Top 5 Shariah stocks by composite score: ${topScores.map((s) => `${s.symbol} (${Number(s.composite_score).toFixed(1)}${s.is_placeholder ? '*' : ''})`).join(', ')}${topScores.some((s) => s.is_placeholder) ? ' (*placeholder — <20d data)' : ''}`
        : 'Stock scores: Accumulating data (need 20 trading days)';

    const context = [
      `Week: ${weekStart} to ${weekEnd}`,
      `ASPI Daily: ${JSON.stringify(aspiWeek)}`,
      `Portfolio: invested LKR ${Math.round(totalInvested).toLocaleString()}, current LKR ${Math.round(totalCurrent).toLocaleString()}, P&L LKR ${Math.round(portfolioPnl).toLocaleString()} (${portfolioPnlPct}%)`,
      `Holdings: ${JSON.stringify(holdings.map((h) => ({ symbol: h.symbol, pnl_pct: h.pnl_percent != null ? Math.round(h.pnl_percent * 10) / 10 : null })))}`,
      `Announcements this week: ${weekAnnouncements.length > 0 ? weekAnnouncements.map((a) => `${a.symbol}: ${a.title}`).join(' | ') : 'None'}`,
      `Sector data: ${sectorData ? JSON.stringify(sectorData).slice(0, 400) : 'Unavailable'}`,
      recSection,
      scoresSection,
      `Upcoming catalysts: Monitor CBSL calendar for rate decisions; watch quarterly earnings season`,
    ].join('\n');

    const prompt =
      `You are an experienced CSE equity analyst advising a Shariah-compliant retail investor ` +
      `with a conservative profile using Rupee Cost Averaging (LKR 10,000/month).\n\n` +
      `Provide a weekly brief covering:\n` +
      `1. Week in review (3-4 sentences on market movement)\n` +
      `2. Portfolio assessment (how did my holdings perform?)\n` +
      `3. AI stock pick of the week (reference the recommendation if provided)\n` +
      `4. Upcoming catalysts (next 1-2 weeks)\n` +
      `5. RCA recommendation: should I stick to my plan, increase, or hold cash next month?\n\n` +
      `Keep it under 450 words. Be specific with numbers. This is educational analysis, not financial advice.\n\nContext:\n${context}`;

    const { text, tokensUsed } = await this.callClaude(model, prompt, 900);
    await this.aiUsage.track(tokensUsed);
    return { content: text || null, modelUsed: model, tokensUsed };
  }

  // ---------------------------------------------------------------------------
  // Private: Claude API + token tracking
  // ---------------------------------------------------------------------------

  private async callClaude(
    model: string,
    prompt: string,
    maxTokens: number,
  ): Promise<{ text: string; tokensUsed: number }> {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Anthropic = (await import('@anthropic-ai/sdk' as any)).default;
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });

    const firstBlock = response.content?.[0];
    const text: string =
      firstBlock?.type === 'text' ? (firstBlock.text as string) : '';
    const tokensUsed: number =
      (response.usage?.input_tokens ?? 0) +
      (response.usage?.output_tokens ?? 0);
    return { text, tokensUsed };
  }

  private async createNotificationAlert(
    alertType: string,
    title: string,
    content: string,
  ): Promise<void> {
    const alert = new Alert();
    alert.symbol = null;
    alert.alert_type = alertType;
    alert.title = title;
    alert.message =
      content.length > 490 ? content.slice(0, 487) + '...' : content;
    alert.is_triggered = true;
    alert.triggered_at = new Date();
    alert.is_active = false;
    alert.is_read = false;
    await this.alertRepository.save(alert);
  }

  // ---------------------------------------------------------------------------
  // Private: date helpers
  // ---------------------------------------------------------------------------

  private getTodayDateStr(): string {
    return new Date().toISOString().split('T')[0];
  }

  private getCurrentWeekRange(): {
    weekStart: string;
    weekEnd: string;
    weekId: string;
  } {
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon, ... 6=Sat
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() + diffToMonday);

    const friday = new Date(monday);
    friday.setUTCDate(monday.getUTCDate() + 4);

    const weekStart = monday.toISOString().split('T')[0];
    const weekEnd = friday.toISOString().split('T')[0];
    const weekNum = this.getISOWeekNumber(monday);
    const weekId = `${monday.getUTCFullYear()}-${String(weekNum).padStart(2, '0')}`;

    return { weekStart, weekEnd, weekId };
  }

  private getISOWeekNumber(date: Date): number {
    const d = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    const dayNum = d.getUTCDay() || 7; // Mon=1 … Sun=7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum); // nearest Thursday
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(
      ((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
    );
  }

  private getISOWeekStartDate(year: number, week: number): string {
    // ISO 8601: week 1 contains the first Thursday of the year
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const dayOfWeek = jan4.getUTCDay() || 7;
    const week1Monday = new Date(jan4);
    week1Monday.setUTCDate(jan4.getUTCDate() - (dayOfWeek - 1));

    const targetMonday = new Date(week1Monday);
    targetMonday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
    return targetMonday.toISOString().split('T')[0];
  }
}
