import { Controller, Get } from '@nestjs/common';
import {
  InsightsService,
  DynamicInsight,
  MarketExplainer,
} from './insights.service';
import { Public } from '../auth/public.decorator';

@Public()
@Controller('insights')
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  /**
   * GET /api/insights/current — Returns 3-5 most relevant dynamic insights.
   */
  @Get('current')
  async getCurrentInsights(): Promise<DynamicInsight[]> {
    return this.insightsService.getCurrentInsights();
  }

  /**
   * GET /api/insights/explainer — Returns a market explainer or null.
   */
  @Get('explainer')
  async getMarketExplainer(): Promise<MarketExplainer | null> {
    return this.insightsService.getMarketExplainer();
  }

  /**
   * GET /api/insights/tips — Returns 3 data-backed educational tips.
   */
  @Get('tips')
  async getEducationalTips(): Promise<DynamicInsight[]> {
    return this.insightsService.getEducationalTips();
  }
}
