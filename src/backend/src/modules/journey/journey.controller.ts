import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import { JourneyService } from './journey.service';

@Controller('journey')
export class JourneyController {
  constructor(private readonly journeyService: JourneyService) {}

  /** POST /api/journey/deposit — Record a monthly deposit. */
  @Post('deposit')
  async recordDeposit(
    @Body()
    body: {
      month: string;
      depositAmount: number;
      depositDate: string;
      notes?: string;
    },
  ) {
    return this.journeyService.recordDeposit(body);
  }

  /** GET /api/journey — Full journey timeline data. */
  @Get()
  async getJourneyData() {
    return this.journeyService.getJourneyData();
  }

  /** GET /api/journey/kpis — Calculated investment KPIs. */
  @Get('kpis')
  async getKPIs() {
    return this.journeyService.getKPIs();
  }

  /** GET /api/journey/health — Portfolio health score. */
  @Get('health')
  async getPortfolioHealthScore() {
    return this.journeyService.getPortfolioHealthScore();
  }

  /** GET /api/journey/goals — All active goals with progress. */
  @Get('goals')
  async getGoals() {
    return this.journeyService.getGoals();
  }

  /** POST /api/journey/goals — Create a new investment goal. */
  @Post('goals')
  async createGoal(
    @Body()
    body: {
      targetAmount: number;
      targetDate?: string;
      label?: string;
    },
  ) {
    return this.journeyService.createGoal(body);
  }

  /** PUT /api/journey/goals/:id — Update an investment goal. */
  @Put('goals/:id')
  async updateGoal(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      targetAmount?: number;
      targetDate?: string;
      label?: string;
      is_active?: boolean;
    },
  ) {
    return this.journeyService.updateGoal(id, body);
  }

  /** DELETE /api/journey/goals/:id — Delete an investment goal. */
  @Delete('goals/:id')
  async deleteGoal(@Param('id', ParseIntPipe) id: number) {
    return this.journeyService.deleteGoal(id);
  }
}
