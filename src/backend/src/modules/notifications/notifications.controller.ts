import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { NotificationsService } from './notifications.service';
import { DailyDigest } from '../../entities/daily-digest.entity';
import { WeeklyBrief } from '../../entities/weekly-brief.entity';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('daily-digest')
  async getLatestDailyDigest(): Promise<DailyDigest | null> {
    return this.notificationsService.getLatestDailyDigest();
  }

  @Get('daily-digest/:date')
  async getDailyDigestByDate(
    @Param('date') date: string,
  ): Promise<DailyDigest | null> {
    return this.notificationsService.getDailyDigestByDate(date);
  }

  @Get('weekly-brief')
  async getLatestWeeklyBrief(): Promise<WeeklyBrief | null> {
    return this.notificationsService.getLatestWeeklyBrief();
  }

  /** weekId format: YYYY-WW (e.g. 2026-12) */
  @Get('weekly-brief/:weekId')
  async getWeeklyBriefByWeekId(
    @Param('weekId') weekId: string,
  ): Promise<WeeklyBrief | null> {
    return this.notificationsService.getWeeklyBriefByWeekId(weekId);
  }

  /** Token usage for current month */
  @Get('usage')
  async getTokenUsage() {
    return this.notificationsService.getMonthlyTokenUsage();
  }

  /** Manually trigger daily digest generation for testing */
  @UseGuards(ApiKeyGuard)
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @Post('test-digest')
  async testDigest(): Promise<{ message: string; content: string | null }> {
    await this.notificationsService.generateDailyDigest();
    const digest = await this.notificationsService.getLatestDailyDigest();
    return {
      message: digest
        ? 'Daily digest generated successfully'
        : 'Generation skipped (no market data or no API key)',
      content: digest?.content ?? null,
    };
  }

  /** Manually trigger weekly brief generation for testing */
  @UseGuards(ApiKeyGuard)
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @Post('test-brief')
  async testBrief(): Promise<{ message: string; content: string | null }> {
    await this.notificationsService.generateWeeklyBrief();
    const brief = await this.notificationsService.getLatestWeeklyBrief();
    return {
      message: brief
        ? 'Weekly brief generated successfully'
        : 'Generation skipped (insufficient data or no API key)',
      content: brief?.content ?? null,
    };
  }
}
