import { Controller, Get, Query } from '@nestjs/common';
import { AnalysisService } from './analysis.service';

@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  /** GET /api/analysis/snapshot/latest */
  @Get('snapshot/latest')
  async getLatestSnapshot() {
    return this.analysisService.getLatestMarketSnapshot();
  }

  /** GET /api/analysis/snapshots?days=30 */
  @Get('snapshots')
  async getSnapshots(@Query('days') days?: string) {
    return this.analysisService.getMarketSnapshots(
      days ? parseInt(days, 10) : 30,
    );
  }

  /** GET /api/analysis/portfolio-snapshots?days=30 */
  @Get('portfolio-snapshots')
  async getPortfolioSnapshots(@Query('days') days?: string) {
    return this.analysisService.getPortfolioSnapshots(
      days ? parseInt(days, 10) : 30,
    );
  }

  /** GET /api/analysis/scores?limit=20 */
  @Get('scores')
  async getScores(@Query('limit') limit?: string) {
    return this.analysisService.getTodayScores(
      limit ? parseInt(limit, 10) : 20,
    );
  }

  /** GET /api/analysis/recommendation */
  @Get('recommendation')
  async getRecommendation() {
    return this.analysisService.getLatestRecommendation();
  }

  /** GET /api/analysis/data-status */
  @Get('data-status')
  async getDataStatus() {
    return this.analysisService.getDataStatus();
  }
}
