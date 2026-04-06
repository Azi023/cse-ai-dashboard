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
import { Public } from '../auth/public.decorator';

@Controller('journey')
export class JourneyController {
  constructor(private readonly journeyService: JourneyService) {}

  /** POST /api/journey/deposit — Record a monthly deposit. Requires JWT. */
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
  @Public()
  @Get()
  async getJourneyData() {
    return this.journeyService.getJourneyData();
  }

  /** GET /api/journey/kpis — Calculated investment KPIs. */
  @Public()
  @Get('kpis')
  async getKPIs() {
    return this.journeyService.getKPIs();
  }

  /** GET /api/journey/health — Portfolio health score. */
  @Public()
  @Get('health')
  async getPortfolioHealthScore() {
    return this.journeyService.getPortfolioHealthScore();
  }

  /** GET /api/journey/goals — All active goals with progress. */
  @Public()
  @Get('goals')
  async getGoals() {
    return this.journeyService.getGoals();
  }

  /** POST /api/journey/goals — Create a new investment goal. Requires JWT. */
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

  /** PUT /api/journey/goals/:id — Update an investment goal. Requires JWT. */
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

  /** DELETE /api/journey/goals/:id — Delete an investment goal. Requires JWT. */
  @Delete('goals/:id')
  async deleteGoal(@Param('id', ParseIntPipe) id: number) {
    return this.journeyService.deleteGoal(id);
  }
}
