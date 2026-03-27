import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AnalysisService } from './analysis.service';
import { TechnicalService } from './technical.service';
import { RiskService } from './risk.service';
import { LearningService } from './learning.service';

@Controller('analysis')
export class AnalysisController {
  constructor(
    private readonly analysisService: AnalysisService,
    private readonly technicalService: TechnicalService,
    private readonly riskService: RiskService,
    private readonly learningService: LearningService,
  ) {}

  // ---------------------------------------------------------------------------
  // Existing analysis endpoints
  // ---------------------------------------------------------------------------

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

  /** POST /api/analysis/run-snapshot — manual trigger for daily market+portfolio snapshots */
  @Post('run-snapshot')
  async runSnapshot() {
    await this.analysisService.saveDailySnapshots();
    return { message: 'Daily snapshot triggered' };
  }

  /** POST /api/analysis/run-scoring — manual trigger for stock scoring */
  @Post('run-scoring')
  async runScoring() {
    await this.analysisService.runStockScoring();
    return { message: 'Stock scoring triggered' };
  }

  // ---------------------------------------------------------------------------
  // Technical Analysis endpoints
  // IMPORTANT: fixed routes must come before :symbol param routes
  // ---------------------------------------------------------------------------

  /** GET /api/analysis/technicals?limit=20 */
  @Get('technicals')
  async getTechnicals(@Query('limit') limit?: string) {
    return this.technicalService.getLatestSignals(
      limit ? parseInt(limit, 10) : 20,
    );
  }

  /** POST /api/analysis/run-technicals — manual trigger for testing */
  @Post('run-technicals')
  async runTechnicals() {
    await this.technicalService.runTechnicalAnalysis();
    return { message: 'Technical analysis triggered' };
  }

  /** POST /api/analysis/run-technicals/:symbol — manual trigger for one symbol */
  @Post('run-technicals/:symbol')
  async runTechnicalsForSymbol(@Param('symbol') symbol: string) {
    const result = await this.technicalService.runForSymbol(symbol);
    return result ?? { message: `No data for ${symbol}` };
  }

  /** GET /api/analysis/technicals/:symbol */
  @Get('technicals/:symbol')
  async getTechnicalForSymbol(@Param('symbol') symbol: string) {
    return this.technicalService.getLatestSignalForSymbol(symbol);
  }

  // ---------------------------------------------------------------------------
  // Risk Management endpoints
  // IMPORTANT: 'portfolio' fixed route before :symbol param route
  // ---------------------------------------------------------------------------

  /** GET /api/analysis/risk */
  @Get('risk')
  async getRisk() {
    return this.riskService.getPositionRisks();
  }

  /** POST /api/analysis/run-risk — manual trigger for testing */
  @Post('run-risk')
  async runRisk() {
    await this.riskService.runRiskAnalysis();
    return { message: 'Risk analysis triggered' };
  }

  /** GET /api/analysis/risk/portfolio */
  @Get('risk/portfolio')
  async getPortfolioRisk() {
    return this.riskService.getPortfolioRiskSummary();
  }

  /** GET /api/analysis/risk/:symbol */
  @Get('risk/:symbol')
  async getRiskForSymbol(@Param('symbol') symbol: string) {
    return this.riskService.getPositionRiskForSymbol(symbol);
  }

  // ---------------------------------------------------------------------------
  // Learning / Model Performance endpoints
  // ---------------------------------------------------------------------------

  /** GET /api/analysis/model-performance */
  @Get('model-performance')
  async getModelPerformance() {
    return this.learningService.getModelPerformance();
  }

  /** GET /api/analysis/outcomes */
  @Get('outcomes')
  async getOutcomes() {
    return this.learningService.getAllOutcomes();
  }

  /** POST /api/analysis/run-outcomes — manual trigger */
  @Post('run-outcomes')
  async runOutcomes() {
    await this.learningService.runUpdateNow();
    return { message: 'Outcome update triggered' };
  }
}
