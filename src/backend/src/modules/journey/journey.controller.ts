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
import { RecordDepositDto } from './dto/record-deposit.dto';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';

@Controller('journey')
export class JourneyController {
  constructor(private readonly journeyService: JourneyService) {}

  /** POST /api/journey/deposit — Record a monthly deposit. Requires JWT. */
  @Post('deposit')
  async recordDeposit(@Body() dto: RecordDepositDto) {
    return this.journeyService.recordDeposit(dto);
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
  async createGoal(@Body() dto: CreateGoalDto) {
    return this.journeyService.createGoal(dto);
  }

  /** PUT /api/journey/goals/:id — Update an investment goal. Requires JWT. */
  @Put('goals/:id')
  async updateGoal(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateGoalDto,
  ) {
    return this.journeyService.updateGoal(id, dto);
  }

  /** DELETE /api/journey/goals/:id — Delete an investment goal. Requires JWT. */
  @Delete('goals/:id')
  async deleteGoal(@Param('id', ParseIntPipe) id: number) {
    return this.journeyService.deleteGoal(id);
  }
}
