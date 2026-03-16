import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NewsItem } from '../../entities';
import * as crypto from 'crypto';

interface RssFeedItem {
  title: string;
  link: string;
  pubDate: string;
  contentSnippet?: string;
  content?: string;
}

interface RssFeed {
  items: RssFeedItem[];
}

const RSS_FEEDS = [
  {
    name: 'daily_ft',
    label: 'Daily FT',
    url: 'https://www.ft.lk/RSS',
    category: 'LOCAL',
  },
  {
    name: 'economy_next',
    label: 'Economy Next',
    url: 'https://economynext.com/feed/',
    category: 'LOCAL',
  },
  {
    name: 'google_news_sl',
    label: 'Google News - Sri Lanka Economy',
    url: 'https://news.google.com/rss/search?q=Sri+Lanka+economy+stock+market&hl=en-US&gl=US&ceid=US:en',
    category: 'LOCAL',
  },
  {
    name: 'google_news_cse',
    label: 'Google News - Colombo Stock Exchange',
    url: 'https://news.google.com/rss/search?q=Colombo+Stock+Exchange&hl=en-US&gl=US&ceid=US:en',
    category: 'LOCAL',
  },
  {
    name: 'reuters_asia',
    label: 'Reuters - Asia Markets',
    url: 'https://news.google.com/rss/search?q=site:reuters.com+Sri+Lanka+OR+Asia+markets&hl=en-US&gl=US&ceid=US:en',
    category: 'GLOBAL',
  },
  {
    name: 'cnbc_asia',
    label: 'CNBC - Asia',
    url: 'https://news.google.com/rss/search?q=site:cnbc.com+Asia+markets+emerging&hl=en-US&gl=US&ceid=US:en',
    category: 'GLOBAL',
  },
];

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private ParserClass: any = null;

  constructor(
    @InjectRepository(NewsItem)
    private readonly newsRepo: Repository<NewsItem>,
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getParser(): Promise<any> {
    if (!this.ParserClass) {
      const mod = await import('rss-parser');
      this.ParserClass = mod.default || mod;
    }
    return new this.ParserClass({
      timeout: 10000,
      headers: {
        'User-Agent': 'CSE-Dashboard/1.0',
      },
    });
  }

  /**
   * True only on Mon-Fri between 8:00 AM and 8:00 PM SLT (UTC+5:30).
   * Zero RSS polling on weekends or late at night.
   */
  private isNewsHours(): boolean {
    const now = new Date();
    const sltOffset = 5.5 * 60;
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const sltTotalMinutes = utcMinutes + sltOffset;
    const sltHours = Math.floor(sltTotalMinutes / 60) % 24;
    const dayOfWeek = now.getUTCDay();
    const sltDay = sltTotalMinutes >= 24 * 60 ? (dayOfWeek + 1) % 7 : dayOfWeek;
    if (sltDay === 0 || sltDay === 6) return false;
    return sltHours >= 8 && sltHours < 20;
  }

  // Fetch RSS feeds every 30 minutes — weekdays 8 AM–8 PM SLT only.
  @Cron('0 */30 * * * *')
  async fetchAllFeeds(): Promise<{ fetched: number; errors: string[] }> {
    if (!this.isNewsHours()) return { fetched: 0, errors: [] };
    this.logger.log('Starting RSS feed fetch...');
    let totalFetched = 0;
    const errors: string[] = [];

    for (const feed of RSS_FEEDS) {
      try {
        const count = await this.fetchFeed(feed);
        totalFetched += count;
      } catch (error) {
        const msg = `Failed to fetch ${feed.name}: ${error}`;
        this.logger.warn(msg);
        errors.push(msg);
      }
      // Rate limit between feeds
      await new Promise((r) => setTimeout(r, 1000));
    }

    this.logger.log(
      `RSS fetch complete: ${totalFetched} new items, ${errors.length} errors`,
    );
    return { fetched: totalFetched, errors };
  }

  private async fetchFeed(feed: {
    name: string;
    label: string;
    url: string;
    category: string;
  }): Promise<number> {
    const parser = await this.getParser();
    let parsed: RssFeed;
    try {
      parsed = (await parser.parseURL(feed.url)) as RssFeed;
    } catch {
      this.logger.warn(`RSS parse failed for ${feed.name}`);
      return 0;
    }

    let saved = 0;
    for (const item of (parsed.items || []).slice(0, 15)) {
      const guid = crypto
        .createHash('md5')
        .update(item.link || item.title || '')
        .digest('hex');

      const exists = await this.newsRepo.findOne({ where: { guid } });
      if (exists) continue;

      const newsItem = this.newsRepo.create({
        title: (item.title || 'Untitled').slice(0, 500),
        summary:
          (item.contentSnippet || item.content || '').slice(0, 2000) || null,
        source: feed.name,
        url: item.link || null,
        published_at: item.pubDate ? new Date(item.pubDate) : new Date(),
        guid,
        category: this.categorizeNews(item.title || '', feed.category),
        impact_level: this.assessImpact(item.title || ''),
        impact_direction: 'MIXED',
        affected_symbols: this.extractSymbols(
          item.title || '',
          item.contentSnippet || '',
        ),
        affected_sectors: this.extractSectors(
          item.title || '',
          item.contentSnippet || '',
        ),
      });

      try {
        await this.newsRepo.save(newsItem);
        saved++;
      } catch (error) {
        // Duplicate guid — skip silently
      }
    }

    return saved;
  }

  private categorizeNews(title: string, feedCategory: string): string {
    const lower = title.toLowerCase();
    if (
      lower.includes('cbsl') ||
      lower.includes('central bank') ||
      lower.includes('interest rate') ||
      lower.includes('monetary')
    )
      return 'MONETARY_POLICY';
    if (
      lower.includes('budget') ||
      lower.includes('tax') ||
      lower.includes('imf') ||
      lower.includes('fiscal') ||
      lower.includes('government')
    )
      return 'FISCAL_POLICY';
    if (
      lower.includes('earnings') ||
      lower.includes('profit') ||
      lower.includes('dividend') ||
      lower.includes('agm') ||
      lower.includes('quarterly')
    )
      return 'CORPORATE';
    if (
      lower.includes('oil') ||
      lower.includes('gold') ||
      lower.includes('tea') ||
      lower.includes('rubber') ||
      lower.includes('commodity')
    )
      return 'COMMODITY';
    if (
      lower.includes('fed') ||
      lower.includes('wall street') ||
      lower.includes('nasdaq') ||
      lower.includes('global')
    )
      return 'GLOBAL';
    if (
      lower.includes('election') ||
      lower.includes('political') ||
      lower.includes('parliament')
    )
      return 'POLITICAL';
    if (
      lower.includes('sector') ||
      lower.includes('industry') ||
      lower.includes('regulatory')
    )
      return 'SECTOR';
    return feedCategory === 'GLOBAL' ? 'GLOBAL' : 'SECTOR';
  }

  private assessImpact(title: string): string {
    const lower = title.toLowerCase();
    const highImpactKeywords = [
      'cbsl',
      'central bank',
      'interest rate',
      'imf',
      'default',
      'crisis',
      'crash',
      'surge',
      'plunge',
      'emergency',
      'devaluation',
    ];
    const mediumImpactKeywords = [
      'earnings',
      'profit',
      'revenue',
      'dividend',
      'acquisition',
      'merger',
      'regulation',
      'policy',
      'export',
      'import',
      'inflation',
    ];

    if (highImpactKeywords.some((k) => lower.includes(k))) return 'HIGH';
    if (mediumImpactKeywords.some((k) => lower.includes(k))) return 'MEDIUM';
    return 'LOW';
  }

  private extractSymbols(title: string, content: string): string[] | null {
    const text = `${title} ${content}`;
    const knownPatterns: Record<string, string> = {
      'john keells': 'JKH.N0000',
      jkh: 'JKH.N0000',
      'dialog axiata': 'DIAL.N0000',
      dialog: 'DIAL.N0000',
      'commercial bank': 'COMB.N0000',
      'hatton national': 'HNB.N0000',
      sampath: 'SAMP.N0000',
      'sri lanka telecom': 'SLTL.N0000',
      'ceylon tobacco': 'CTC.N0000',
      hayleys: 'HAYL.N0000',
      'expo lanka': 'EXPO.N0000',
      cargills: 'CARG.N0000',
      'tokyo cement': 'TKYO.N0000',
    };

    const found: string[] = [];
    const lower = text.toLowerCase();
    for (const [keyword, symbol] of Object.entries(knownPatterns)) {
      if (lower.includes(keyword) && !found.includes(symbol)) {
        found.push(symbol);
      }
    }

    // Also match ticker patterns
    const tickerMatch = text.match(/\b([A-Z]{2,10})\.N\d{4}\b/g);
    if (tickerMatch) {
      for (const m of tickerMatch) {
        if (!found.includes(m)) found.push(m);
      }
    }

    return found.length > 0 ? found : null;
  }

  private extractSectors(title: string, content: string): string[] | null {
    const text = `${title} ${content}`.toLowerCase();
    const sectorMap: Record<string, string> = {
      bank: 'Banking',
      banking: 'Banking',
      finance: 'Finance',
      insurance: 'Insurance',
      hotel: 'Hotels & Tourism',
      tourism: 'Hotels & Tourism',
      plantation: 'Plantations',
      tea: 'Plantations',
      rubber: 'Plantations',
      manufacturing: 'Manufacturing',
      construction: 'Construction',
      telecom: 'Telecommunications',
      power: 'Power & Energy',
      energy: 'Power & Energy',
      diversified: 'Diversified Holdings',
      food: 'Food & Beverage',
      beverage: 'Food & Beverage',
      property: 'Real Estate',
    };

    const found: string[] = [];
    for (const [keyword, sector] of Object.entries(sectorMap)) {
      if (text.includes(keyword) && !found.includes(sector)) {
        found.push(sector);
      }
    }

    return found.length > 0 ? found : null;
  }

  async getNews(params: {
    limit?: number;
    source?: string;
    category?: string;
    impact?: string;
    search?: string;
  }): Promise<NewsItem[]> {
    const qb = this.newsRepo
      .createQueryBuilder('n')
      .orderBy('n.published_at', 'DESC');

    if (params.source) {
      qb.andWhere('n.source = :source', { source: params.source });
    }
    if (params.category) {
      qb.andWhere('n.category = :category', { category: params.category });
    }
    if (params.impact) {
      qb.andWhere('n.impact_level = :impact', { impact: params.impact });
    }
    if (params.search) {
      qb.andWhere('LOWER(n.title) LIKE :search', {
        search: `%${params.search.toLowerCase()}%`,
      });
    }

    qb.take(params.limit || 50);
    return qb.getMany();
  }

  async getNewsById(id: number): Promise<NewsItem | null> {
    return this.newsRepo.findOne({ where: { id } });
  }

  async getSources(): Promise<
    Array<{ name: string; label: string; count: number }>
  > {
    const results = await this.newsRepo
      .createQueryBuilder('n')
      .select('n.source', 'name')
      .addSelect('COUNT(*)', 'count')
      .groupBy('n.source')
      .getRawMany();

    return results.map((r) => {
      const feed = RSS_FEEDS.find((f) => f.name === r.name);
      return {
        name: r.name,
        label: feed?.label || r.name,
        count: parseInt(r.count, 10),
      };
    });
  }

  async getHighImpactNews(hours: number = 24): Promise<NewsItem[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.newsRepo.find({
      where: {
        impact_level: 'HIGH',
        published_at: MoreThan(since),
      },
      order: { published_at: 'DESC' },
      take: 10,
    });
  }
}
