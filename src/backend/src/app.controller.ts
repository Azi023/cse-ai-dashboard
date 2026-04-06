import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RedisService } from './modules/cse-data/redis.service';
import { Public } from './modules/auth/public.decorator';

@Controller()
export class AppController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
  ) {}

  @Public()
  @Get()
  getHello(): string {
    return 'CSE AI Dashboard API';
  }

  /**
   * Public health check — returns only status (ok/degraded).
   * Full details available at GET /api/health/details (JWT required).
   */
  @Public()
  @Get('health')
  async getHealth(): Promise<{ status: 'ok' | 'degraded' }> {
    let dbOk = true;
    let redisOk = true;

    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      dbOk = false;
    }

    try {
      await this.redisService.get('healthcheck:ping');
    } catch {
      redisOk = false;
    }

    return { status: dbOk && redisOk ? 'ok' : 'degraded' };
  }

  /**
   * Detailed health check — requires JWT authentication.
   * Exposes infrastructure details: db, Redis, last sync times, uptime.
   */
  @Get('health/details')
  async getHealthDetails(): Promise<{
    status: 'ok' | 'degraded';
    db: string;
    redis: string;
    lastMarketPoll: string | null;
    lastAtradSync: string | null;
    lastDailyDigest: string | null;
    uptime: number;
    timestamp: string;
  }> {
    let dbStatus = 'ok';
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      dbStatus = 'error';
    }

    let redisStatus = 'ok';
    let lastMarketPoll: string | null = null;
    let lastAtradSync: string | null = null;
    let lastDailyDigest: string | null = null;
    try {
      const tradeSummary = await this.redisService.getJson<{
        fetchedAt?: string;
      }>('cse:trade_summary');
      lastMarketPoll = tradeSummary?.fetchedAt ?? null;

      const atradSync = await this.redisService.getJson<{ syncedAt?: string }>(
        'atrad:last_sync',
      );
      lastAtradSync = atradSync?.syncedAt ?? null;

      const digest = await this.redisService.get(
        'notifications:last_digest_at',
      );
      lastDailyDigest = digest ?? null;
    } catch {
      redisStatus = 'error';
    }

    const overall =
      dbStatus === 'ok' && redisStatus === 'ok' ? 'ok' : 'degraded';

    return {
      status: overall,
      db: dbStatus,
      redis: redisStatus,
      lastMarketPoll,
      lastAtradSync,
      lastDailyDigest,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
