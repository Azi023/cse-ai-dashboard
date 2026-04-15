import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import * as ccxt from 'ccxt';
import { CryptoPrice } from '../../entities/crypto-price.entity';
import { CryptoOHLCV } from '../../entities/crypto-ohlcv.entity';
import { RedisService } from '../cse-data/redis.service';
import { UserPreferencesService } from '../user-preferences/user-preferences.service';

// ── Shariah Whitelist ──────────────────────────────────────────────────────

const HALAL_WHITELIST = ['BTC/USDT', 'ETH/USDT'] as const;

// ── Paper Trade Types ──────────────────────────────────────────────────────

export interface PaperBalance {
  USDT: number;
  BTC: number;
  ETH: number;
  [key: string]: number;
}

export interface PaperTrade {
  id: string;
  type: 'BUY' | 'SELL';
  symbol: string;
  amount: number;
  price: number;
  total: number;
  timestamp: string;
}

// ── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private readonly exchange: ccxt.binance;

  constructor(
    @InjectRepository(CryptoPrice)
    private readonly cryptoPriceRepo: Repository<CryptoPrice>,
    @InjectRepository(CryptoOHLCV)
    private readonly cryptoOhlcvRepo: Repository<CryptoOHLCV>,
    private readonly redisService: RedisService,
    private readonly userPrefsService: UserPreferencesService,
  ) {
    this.exchange = new ccxt.binance({ enableRateLimit: true });
  }

  // ── Market Data ────────────────────────────────────────────────────────

  async fetchTicker(symbol: string): Promise<{
    symbol: string;
    price: number;
    change24h: number;
    changePct24h: number;
    volume24h: number;
    high24h: number;
    low24h: number;
    timestamp: string;
  }> {
    const ticker = await this.exchange.fetchTicker(symbol);
    return {
      symbol: ticker.symbol,
      price: ticker.last ?? 0,
      change24h: ticker.change ?? 0,
      changePct24h: ticker.percentage ?? 0,
      volume24h: ticker.quoteVolume ?? 0,
      high24h: ticker.high ?? 0,
      low24h: ticker.low ?? 0,
      timestamp: new Date(ticker.timestamp ?? Date.now()).toISOString(),
    };
  }

  async fetchOHLCV(
    symbol: string,
    timeframe: string = '1h',
    limit: number = 100,
  ): Promise<
    {
      time: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }[]
  > {
    const candles = await this.exchange.fetchOHLCV(
      symbol,
      timeframe,
      undefined,
      limit,
    );
    return candles.map((c) => ({
      time: c[0] as number,
      open: c[1] as number,
      high: c[2] as number,
      low: c[3] as number,
      close: c[4] as number,
      volume: c[5] as number,
    }));
  }

  async fetchOrderBook(
    symbol: string,
    limit: number = 20,
  ): Promise<{
    bids: [number, number][];
    asks: [number, number][];
    timestamp: string;
  }> {
    const book = await this.exchange.fetchOrderBook(symbol, limit);
    return {
      bids: book.bids.slice(0, limit) as [number, number][],
      asks: book.asks.slice(0, limit) as [number, number][],
      timestamp: new Date(book.timestamp ?? Date.now()).toISOString(),
    };
  }

  async getAvailableMarkets(): Promise<
    { symbol: string; base: string; quote: string; active: boolean }[]
  > {
    await this.exchange.loadMarkets();
    return Object.values(this.exchange.markets)
      .filter((m) => m.quote === 'USDT' && m.active)
      .map((m) => ({
        symbol: m.symbol,
        base: m.base,
        quote: m.quote,
        active: m.active ?? true,
      }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  // ── Shariah Filter ─────────────────────────────────────────────────────

  getShariahWhitelist(): string[] {
    return [...HALAL_WHITELIST];
  }

  isShariahCompliant(symbol: string): boolean {
    return (HALAL_WHITELIST as readonly string[]).includes(symbol);
  }

  private async validateShariahCompliance(symbol: string): Promise<void> {
    const shariahMode = await this.userPrefsService.getDefaultShariahMode();
    if (!shariahMode) return; // All pairs allowed when Shariah mode is OFF
    if (!this.isShariahCompliant(symbol)) {
      throw new BadRequestException(
        `${symbol} is not Shariah-compliant. Allowed pairs: ${HALAL_WHITELIST.join(', ')}`,
      );
    }
  }

  /**
   * Get top trading pairs by 24h volume from Binance.
   * Returns HALAL_WHITELIST only when Shariah mode is ON.
   */
  async getFilteredMarkets(limit: number = 30): Promise<
    {
      symbol: string;
      base: string;
      quote: string;
      price: number;
      change24h: number;
      volume24h: number;
    }[]
  > {
    const shariahMode = await this.userPrefsService.getDefaultShariahMode();

    if (shariahMode) {
      // Only return whitelisted pairs with live data
      const results = await Promise.all(
        HALAL_WHITELIST.map(async (sym) => {
          try {
            const t = await this.fetchTicker(sym);
            return {
              symbol: t.symbol,
              base: sym.split('/')[0],
              quote: 'USDT',
              price: t.price,
              change24h: t.changePct24h,
              volume24h: t.volume24h,
            };
          } catch {
            return null;
          }
        }),
      );
      return results.filter((r): r is NonNullable<typeof r> => r !== null);
    }

    // Shariah OFF: fetch top pairs by volume
    const cacheKey = 'crypto:top_pairs';
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    await this.exchange.loadMarkets();
    const tickers = await this.exchange.fetchTickers();
    const usdtPairs = Object.values(tickers)
      .filter((t) => t.symbol.endsWith('/USDT') && t.quoteVolume && t.last)
      .sort((a, b) => (b.quoteVolume ?? 0) - (a.quoteVolume ?? 0))
      .slice(0, limit)
      .map((t) => ({
        symbol: t.symbol,
        base: t.symbol.split('/')[0],
        quote: 'USDT',
        price: t.last ?? 0,
        change24h: t.percentage ?? 0,
        volume24h: t.quoteVolume ?? 0,
      }));

    // Cache for 5 minutes
    await this.redisService.set(cacheKey, JSON.stringify(usdtPairs), 300);
    return usdtPairs;
  }

  // ── Paper Trading ──────────────────────────────────────────────────────

  private async getBalance(): Promise<PaperBalance> {
    const cached = await this.redisService.get('crypto:paper:balance');
    if (cached) {
      return JSON.parse(cached);
    }
    const initial: PaperBalance = { USDT: 10000, BTC: 0, ETH: 0 };
    await this.redisService.set(
      'crypto:paper:balance',
      JSON.stringify(initial),
    );
    return initial;
  }

  private async saveBalance(balance: PaperBalance): Promise<void> {
    await this.redisService.set(
      'crypto:paper:balance',
      JSON.stringify(balance),
    );
  }

  private async getTrades(): Promise<PaperTrade[]> {
    const cached = await this.redisService.get('crypto:paper:trades');
    return cached ? JSON.parse(cached) : [];
  }

  private async saveTrade(trade: PaperTrade): Promise<void> {
    const trades = await this.getTrades();
    trades.push(trade);
    await this.redisService.set('crypto:paper:trades', JSON.stringify(trades));
  }

  async paperBuy(
    symbol: string,
    amount: number,
  ): Promise<{ trade: PaperTrade; balance: PaperBalance }> {
    await this.validateShariahCompliance(symbol);

    const ticker = await this.fetchTicker(symbol);
    const price = ticker.price;
    const total = amount * price;
    const base = symbol.split('/')[0];

    const balance = await this.getBalance();

    if (balance.USDT < total) {
      throw new BadRequestException(
        `Insufficient USDT balance. Need ${total.toFixed(2)}, have ${balance.USDT.toFixed(2)}`,
      );
    }

    const newBalance: PaperBalance = {
      ...balance,
      USDT: balance.USDT - total,
      [base]: (balance[base] ?? 0) + amount,
    };

    await this.saveBalance(newBalance);

    const trade: PaperTrade = {
      id: `PT-${Date.now()}`,
      type: 'BUY',
      symbol,
      amount,
      price,
      total,
      timestamp: new Date().toISOString(),
    };

    await this.saveTrade(trade);
    this.logger.log(
      `Paper BUY: ${amount} ${base} @ ${price} = ${total.toFixed(2)} USDT`,
    );

    return { trade, balance: newBalance };
  }

  async paperSell(
    symbol: string,
    amount: number,
  ): Promise<{ trade: PaperTrade; balance: PaperBalance }> {
    await this.validateShariahCompliance(symbol);

    const ticker = await this.fetchTicker(symbol);
    const price = ticker.price;
    const total = amount * price;
    const base = symbol.split('/')[0];

    const balance = await this.getBalance();

    if ((balance[base] ?? 0) < amount) {
      throw new BadRequestException(
        `Insufficient ${base} balance. Need ${amount}, have ${balance[base] ?? 0}`,
      );
    }

    const newBalance: PaperBalance = {
      ...balance,
      USDT: balance.USDT + total,
      [base]: (balance[base] ?? 0) - amount,
    };

    await this.saveBalance(newBalance);

    const trade: PaperTrade = {
      id: `PT-${Date.now()}`,
      type: 'SELL',
      symbol,
      amount,
      price,
      total,
      timestamp: new Date().toISOString(),
    };

    await this.saveTrade(trade);
    this.logger.log(
      `Paper SELL: ${amount} ${base} @ ${price} = ${total.toFixed(2)} USDT`,
    );

    return { trade, balance: newBalance };
  }

  async getPortfolio(): Promise<{
    balance: PaperBalance;
    totalValueUSD: number;
    holdings: {
      asset: string;
      amount: number;
      valueUSD: number;
      price: number;
    }[];
  }> {
    const balance = await this.getBalance();
    const holdings: {
      asset: string;
      amount: number;
      valueUSD: number;
      price: number;
    }[] = [];

    let totalValueUSD = balance.USDT;

    for (const [asset, amount] of Object.entries(balance)) {
      if (asset === 'USDT' || amount <= 0) continue;

      try {
        const ticker = await this.fetchTicker(`${asset}/USDT`);
        const valueUSD = amount * ticker.price;
        totalValueUSD += valueUSD;
        holdings.push({
          asset,
          amount,
          valueUSD,
          price: ticker.price,
        });
      } catch {
        holdings.push({ asset, amount, valueUSD: 0, price: 0 });
      }
    }

    holdings.unshift({
      asset: 'USDT',
      amount: balance.USDT,
      valueUSD: balance.USDT,
      price: 1,
    });

    return { balance, totalValueUSD, holdings };
  }

  async getTradeHistory(): Promise<PaperTrade[]> {
    return this.getTrades();
  }

  // ── OHLCV Persistence ─────────────────────────────────────────────────

  /**
   * Upsert a batch of OHLCV candles into the crypto_ohlcv table.
   *
   * Uses ON CONFLICT (symbol, timeframe, timestamp) DO UPDATE so running
   * the same batch twice is idempotent.
   *
   * @param symbol    Normalized trading pair, e.g. 'BTC/USDT'
   * @param timeframe CCXT timeframe string, e.g. '1d', '1h', '5m'
   * @param candles   Raw CCXT OHLCV array: [timestamp_ms, o, h, l, c, v][]
   */
  async saveOHLCVCandles(
    symbol: string,
    timeframe: string,
    candles: ccxt.OHLCV[],
  ): Promise<void> {
    if (candles.length === 0) return;

    const rows = candles.map((c) => ({
      symbol,
      timeframe,
      timestamp: new Date(c[0] as number),
      open: c[1] as number,
      high: c[2] as number,
      low: c[3] as number,
      close: c[4] as number,
      volume: c[5] as number,
    }));

    await this.cryptoOhlcvRepo
      .createQueryBuilder()
      .insert()
      .into(CryptoOHLCV)
      .values(rows)
      .orUpdate(
        ['open', 'high', 'low', 'close', 'volume'],
        ['symbol', 'timeframe', 'timestamp'],
      )
      .execute();
  }

  /**
   * Read stored OHLCV candles from the database in chronological order.
   *
   * @param symbol    Normalized trading pair, e.g. 'BTC/USDT'
   * @param timeframe Timeframe string, e.g. '1d', '1h', '5m'
   * @param limit     Maximum number of candles to return (default 365)
   */
  async getOHLCVCandles(
    symbol: string,
    timeframe: string,
    limit: number = 365,
  ): Promise<
    {
      time: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }[]
  > {
    const rows = await this.cryptoOhlcvRepo.find({
      where: { symbol, timeframe },
      order: { timestamp: 'DESC' },
      take: limit,
    });

    // Reverse so the result is chronological (oldest → newest)
    return rows.reverse().map((r) => ({
      time: new Date(r.timestamp).getTime(),
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
      volume: Number(r.volume),
    }));
  }

  // ── Daily OHLCV Candle Cron ────────────────────────────────────────────

  /** Save today's daily candle for BTC/USDT and ETH/USDT at midnight SLT. */
  @Cron('0 0 0 * * *') // 00:00:00 every day (SLT on VPS)
  async saveDailyOHLCVCandles(): Promise<void> {
    for (const symbol of HALAL_WHITELIST) {
      try {
        // Fetch the last 2 completed daily candles; take index 0 (yesterday's
        // completed candle) to avoid a partial in-progress bar for today.
        const candles = await this.exchange.fetchOHLCV(
          symbol,
          '1d',
          undefined,
          2,
        );
        const completed = candles.slice(0, 1);
        await this.saveOHLCVCandles(symbol, '1d', completed);
        this.logger.log(`Saved daily OHLCV candle for ${symbol}`);
      } catch (err) {
        this.logger.warn(
          `Failed to save daily OHLCV for ${symbol}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  // ── Price Ingestion Cron ───────────────────────────────────────────────

  @Cron('0 */5 * * * *') // every 5 minutes, 24/7
  async ingestCryptoPrices(): Promise<void> {
    for (const symbol of HALAL_WHITELIST) {
      try {
        const ticker = await this.fetchTicker(symbol);
        await this.cryptoPriceRepo.save(
          this.cryptoPriceRepo.create({
            symbol,
            price: ticker.price,
            volume_24h: ticker.volume24h,
            change_24h_pct: ticker.changePct24h,
          }),
        );
      } catch (err) {
        this.logger.warn(
          `Failed to ingest ${symbol}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}
