import { Controller, Get, Post, Delete, Param, Body, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { AlertsService } from './alerts.service';

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  /** GET /api/alerts/notifications — Triggered notifications. */
  @Get('notifications')
  async getNotifications(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.alertsService.getNotifications(limit);
  }

  /** GET /api/alerts/unread-count — Unread notification count. */
  @Get('unread-count')
  async getUnreadCount() {
    return { count: await this.alertsService.getUnreadCount() };
  }

  /** GET /api/alerts/active — Active (untriggered) alerts. */
  @Get('active')
  async getActiveAlerts() {
    return this.alertsService.getActiveAlerts();
  }

  /** POST /api/alerts — Create a new alert. */
  @Post()
  async createAlert(
    @Body() body: { symbol: string; alert_type: string; title: string; threshold?: number },
  ) {
    return this.alertsService.createAlert(body);
  }

  /** POST /api/alerts/mark-read/:id — Mark one notification as read. */
  @Post('mark-read/:id')
  async markAsRead(@Param('id', ParseIntPipe) id: number) {
    await this.alertsService.markAsRead(id);
    return { message: 'Marked as read' };
  }

  /** POST /api/alerts/mark-all-read — Mark all notifications as read. */
  @Post('mark-all-read')
  async markAllAsRead() {
    await this.alertsService.markAllAsRead();
    return { message: 'All marked as read' };
  }

  /** POST /api/alerts/check — Manually trigger alert check. */
  @Post('check')
  async checkAlerts() {
    await this.alertsService.checkAlerts();
    return { message: 'Alert check completed' };
  }

  /** DELETE /api/alerts/:id — Delete an alert. */
  @Delete(':id')
  async deleteAlert(@Param('id', ParseIntPipe) id: number) {
    await this.alertsService.deleteAlert(id);
    return { message: 'Alert deleted' };
  }
}
