import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Alert, Stock, Portfolio } from '../../entities';
import { RedisService } from '../cse-data/redis.service';

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    @InjectRepository(Alert)
    private readonly alertRepository: Repository<Alert>,
    @InjectRepository(Stock)
    private readonly stockRepository: Repository<Stock>,
    @InjectRepository(Portfolio)
    private readonly portfolioRepository: Repository<Portfolio>,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Check all active alerts against current data.
   * Runs every 60 seconds during market hours.
   */
  @Cron('0 */1 4-9 * * 1-5', { name: 'alert-checker' }) // UTC: 4-9 = SLT 9:30-14:30 approx
  async checkAlerts(): Promise<void> {
    const activeAlerts = await this.alertRepository.find({
      where: { is_active: true, is_triggered: false },
    });

    if (activeAlerts.length === 0) return;

    for (const alert of activeAlerts) {
      try {
        if (!alert.symbol) continue;

        const stock = await this.stockRepository.findOne({
          where: { symbol: alert.symbol },
        });
        if (!stock || !stock.last_price) continue;

        const price = Number(stock.last_price);
        const threshold = alert.threshold ? Number(alert.threshold) : null;

        let triggered = false;

        if (alert.alert_type === 'price_above' && threshold && price >= threshold) {
          triggered = true;
          alert.message = `${alert.symbol} reached Rs. ${price.toFixed(2)} (above ${threshold.toFixed(2)})`;
        } else if (alert.alert_type === 'price_below' && threshold && price <= threshold) {
          triggered = true;
          alert.message = `${alert.symbol} dropped to Rs. ${price.toFixed(2)} (below ${threshold.toFixed(2)})`;
        } else if (alert.alert_type === 'volume_spike') {
          // Check if volume > 3x average (simplified)
          const volume = Number(stock.market_cap) || 0; // proxy
          if (volume > 0 && threshold && volume > threshold * 3) {
            triggered = true;
            alert.message = `${alert.symbol} unusual volume detected`;
          }
        }

        if (triggered) {
          alert.is_triggered = true;
          alert.triggered_at = new Date();
          await this.alertRepository.save(alert);
          this.logger.log(`Alert triggered: ${alert.title}`);
        }
      } catch (error) {
        this.logger.error(`Error checking alert ${alert.id}: ${String(error)}`);
      }
    }

    // Auto-generate portfolio drop alerts
    await this.checkPortfolioDropAlerts();
  }

  /**
   * Check if any portfolio stock dropped >5% today.
   */
  private async checkPortfolioDropAlerts(): Promise<void> {
    const holdings = await this.portfolioRepository.find();

    for (const holding of holdings) {
      const stock = await this.stockRepository.findOne({
        where: { symbol: holding.symbol },
      });
      if (!stock) continue;

      const changePercent = Number(stock.change_percent) || 0;
      if (changePercent <= -5) {
        // Check if we already generated this alert today
        const today = new Date().toISOString().split('T')[0];
        const existing = await this.alertRepository
          .createQueryBuilder('a')
          .where('a.symbol = :symbol', { symbol: holding.symbol })
          .andWhere('a.alert_type = :type', { type: 'auto_generated' })
          .andWhere('a.created_at >= :today', { today })
          .getOne();

        if (!existing) {
          const alert = new Alert();
          alert.symbol = holding.symbol;
          alert.alert_type = 'auto_generated';
          alert.title = `${holding.symbol} dropped ${changePercent.toFixed(1)}% today`;
          alert.message = `Your portfolio stock ${holding.symbol} fell ${changePercent.toFixed(1)}% today. Current price: Rs. ${Number(stock.last_price).toFixed(2)}`;
          alert.is_triggered = true;
          alert.triggered_at = new Date();
          await this.alertRepository.save(alert);
        }
      }
    }
  }

  /**
   * Get all notifications (triggered alerts), most recent first.
   */
  async getNotifications(limit = 50): Promise<Alert[]> {
    return this.alertRepository.find({
      where: { is_triggered: true },
      order: { triggered_at: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get unread notification count.
   */
  async getUnreadCount(): Promise<number> {
    return this.alertRepository.count({
      where: { is_triggered: true, is_read: false },
    });
  }

  /**
   * Get all active (untriggered) alerts.
   */
  async getActiveAlerts(): Promise<Alert[]> {
    return this.alertRepository.find({
      where: { is_active: true, is_triggered: false },
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Mark notification as read.
   */
  async markAsRead(id: number): Promise<void> {
    await this.alertRepository.update(id, { is_read: true });
  }

  /**
   * Mark all notifications as read.
   */
  async markAllAsRead(): Promise<void> {
    await this.alertRepository.update(
      { is_triggered: true, is_read: false },
      { is_read: true },
    );
  }

  /**
   * Create a price alert.
   */
  async createAlert(data: {
    symbol: string;
    alert_type: string;
    title: string;
    threshold?: number;
  }): Promise<Alert> {
    const alert = new Alert();
    alert.symbol = data.symbol.toUpperCase();
    alert.alert_type = data.alert_type;
    alert.title = data.title;
    alert.threshold = data.threshold ?? null;
    alert.is_active = true;
    return this.alertRepository.save(alert);
  }

  /**
   * Delete an alert.
   */
  async deleteAlert(id: number): Promise<void> {
    const result = await this.alertRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Alert ${id} not found`);
    }
  }
}
