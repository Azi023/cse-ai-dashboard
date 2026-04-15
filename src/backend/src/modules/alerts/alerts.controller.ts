import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { Public } from '../auth/public.decorator';
import { CreateAlertDto } from './dto/create-alert.dto';

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  /** GET /api/alerts/notifications — Triggered notifications. */
  @Public()
  @Get('notifications')
  async getNotifications(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    return this.alertsService.getNotifications(limit);
  }

  /** GET /api/alerts/unread-count — Count of unread notifications. */
  @Public()
  @Get('unread-count')
  async getUnreadCount() {
    return this.alertsService.getUnreadCount();
  }

  /** GET /api/alerts/active — Active alert configs. */
  @Public()
  @Get('active')
  async getActiveAlerts() {
    return this.alertsService.getActiveAlerts();
  }

  /** POST /api/alerts — Create a new alert. Requires JWT. */
  @Post()
  async createAlert(@Body() dto: CreateAlertDto) {
    return this.alertsService.createAlert(dto);
  }

  /** POST /api/alerts/mark-read/:id — Mark one notification as read. Requires JWT. */
  @Post('mark-read/:id')
  async markAsRead(@Param('id', ParseIntPipe) id: number) {
    await this.alertsService.markAsRead(id);
    return { success: true };
  }

  /** POST /api/alerts/mark-all-read — Mark all notifications as read. Requires JWT. */
  @Post('mark-all-read')
  async markAllAsRead() {
    await this.alertsService.markAllAsRead();
    return { success: true };
  }

  /** POST /api/alerts/check — Run alert checks now. Requires JWT. */
  @Post('check')
  async checkAlerts() {
    await this.alertsService.checkAlerts();
    return { message: 'Alert check triggered' };
  }

  /** DELETE /api/alerts/:id — Delete an alert. Requires JWT. */
  @Delete(':id')
  async deleteAlert(@Param('id', ParseIntPipe) id: number) {
    await this.alertsService.deleteAlert(id);
    return { success: true };
  }
}
