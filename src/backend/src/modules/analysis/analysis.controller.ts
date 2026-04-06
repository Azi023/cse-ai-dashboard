import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AnalysisService } from './analysis.service';
import { TechnicalService } from './technical.service';
import { RiskService } from './risk.service';
import { LearningService } from './learning.service';
import { Public } from '../auth/public.decorator';

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
  @Public()
  @Get('snapshot/latest')
  async getLatestSnapshot() {
    return this.analysisService.getLatestMarketSnapshot();
  }

  /** GET /api/analysis/snapshots?days=30 */
  @Public()
  @Get('snapshots')
  async getSnapshots(@Query('days') days?: string) {
    return this.analysisService.getMarketSnapshots(
      days ? parseInt(days, 10) : 30,
    );
  }

  /** GET /api/analysis/portfolio-snapshots?days=30 */
  @Public()
  @Get('portfolio-snapshots')
  async getPortfolioSnapshots(@Query('days') days?: string) {
    return this.analysisService.getPortfolioSnapshots(
      days ? parseInt(days, 10) : 30,
    );
  }

  /** GET /api/analysis/scores?limit=20 */
  @Public()
  @Get('scores')
  async getScores(@Query('limit') limit?: string) {
    return this.analysisService.getTodayScores(
      limit ? parseInt(limit, 10) : 20,
    );
  }

  /** GET /api/analysis/recommendation */
  @Public()
  @Get('recommendation')
  async getRecommendation() {
    return this.analysisService.getLatestRecommendation();
  }

  /** GET /api/analysis/data-status */
  @Public()
  @Get('data-status')
  async getDataStatus() {
    return this.analysisService.getDataStatus();
  }

  /** POST /api/analysis/run-snapshot — Requires JWT. */
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @Post('run-snapshot')
  async runSnapshot() {
    await this.analysisService.saveDailySnapshots();
    return { message: 'Daily snapshot triggered' };
  }

  /** POST /api/analysis/run-scoring — Requires JWT. */
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @Post('run-scoring')
  async runScoring() {
    await this.analysisService.runStockScoring();
    return { message: 'Stock scoring triggered' };
  }

  // ---------------------------------------------------------------------------
  // Technical Analysis endpoints
  // ---------------------------------------------------------------------------

  /** GET /api/analysis/technicals?limit=20 */
  @Public()
  @Get('technicals')
  async getTechnicals(@Query('limit') limit?: string) {
    return this.technicalService.getLatestSignals(
      limit ? parseInt(limit, 10) : 20,
    );
  }

  /** POST /api/analysis/run-technicals — Requires JWT. */
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @Post('run-technicals')
  async runTechnicals() {
    await this.technicalService.runTechnicalAnalysis();
    return { message: 'Technical analysis triggered' };
  }

  /** POST /api/analysis/run-technicals/:symbol — Requires JWT. */
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('run-technicals/:symbol')
  async runTechnicalsForSymbol(@Param('symbol') symbol: string) {
    const result = await this.technicalService.runForSymbol(symbol);
    return result ?? { message: `No data for ${symbol}` };
  }

  /** GET /api/analysis/technicals/:symbol */
  @Public()
  @Get('technicals/:symbol')
  async getTechnicalForSymbol(@Param('symbol') symbol: string) {
    return this.technicalService.getLatestSignalForSymbol(symbol);
  }

  // ---------------------------------------------------------------------------
  // Risk Management endpoints
  // ---------------------------------------------------------------------------

  /** GET /api/analysis/risk */
  @Public()
  @Get('risk')
  async getRisk() {
    return this.riskService.getPositionRisks();
  }

  /** POST /api/analysis/run-risk — Requires JWT. */
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @Post('run-risk')
  async runRisk() {
    await this.riskService.runRiskAnalysis();
    return { message: 'Risk analysis triggered' };
  }

  /** GET /api/analysis/risk/portfolio */
  @Public()
  @Get('risk/portfolio')
  async getPortfolioRisk() {
    return this.riskService.getPortfolioRiskSummary();
  }

  /** GET /api/analysis/risk/:symbol */
  @Public()
  @Get('risk/:symbol')
  async getRiskForSymbol(@Param('symbol') symbol: string) {
    return this.riskService.getPositionRiskForSymbol(symbol);
  }

  // ---------------------------------------------------------------------------
  // Learning / Model Performance endpoints
  // ---------------------------------------------------------------------------

  /** GET /api/analysis/model-performance */
  @Public()
  @Get('model-performance')
  async getModelPerformance() {
    return this.learningService.getModelPerformance();
  }

  /** GET /api/analysis/outcomes */
  @Public()
  @Get('outcomes')
  async getOutcomes() {
    return this.learningService.getAllOutcomes();
  }

  /** POST /api/analysis/run-outcomes — Requires JWT. */
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @Post('run-outcomes')
  async runOutcomes() {
    await this.learningService.runUpdateNow();
    return { message: 'Outcome update triggered' };
  }

  /** POST /api/analysis/run-recommendation — Requires JWT. Triggers billable Claude API call. */
  @Throttle({ default: { ttl: 60_000, limit: 2 } })
  @Post('run-recommendation')
  async runRecommendation() {
    await this.analysisService.generateWeeklyRecommendation();
    return { message: 'AI recommendation generation triggered' };
  }

  /** POST /api/analysis/run-exit-signals — Requires JWT. */
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @Post('run-exit-signals')
  async runExitSignals() {
    return this.riskService.checkExitSignals();
  }
}
