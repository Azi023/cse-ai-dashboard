import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';
import { TechnicalService } from './technical.service';
import { RiskService } from './risk.service';
import { LearningService } from './learning.service';
import { AiDemoTradingService } from './ai-demo-trading.service';
import { StrategySignal } from '../../entities/strategy-signal.entity';
import { PaperTradingModule } from '../paper-trading/paper-trading.module';
import {
  MarketSnapshot,
  PortfolioSnapshot,
  WeeklyMetric,
  StockScore,
  AiRecommendation,
  Stock,
  DailyPrice,
  Alert,
  CompanyFinancial,
  NewsItem,
  Portfolio,
  TechnicalSignal,
  PositionRisk,
  RecommendationOutcome,
} from '../../entities';
import { CseDataModule } from '../cse-data/cse-data.module';
import { PortfolioModule } from '../portfolio/portfolio.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MarketSnapshot,
      PortfolioSnapshot,
      WeeklyMetric,
      StockScore,
      AiRecommendation,
      Stock,
      DailyPrice,
      Alert,
      CompanyFinancial,
      NewsItem,
      Portfolio,
      TechnicalSignal,
      PositionRisk,
      RecommendationOutcome,
      StrategySignal,
    ]),
    CseDataModule,
    PortfolioModule,
    PaperTradingModule,
  ],
  controllers: [AnalysisController],
  providers: [
    AnalysisService,
    TechnicalService,
    RiskService,
    LearningService,
    AiDemoTradingService,
  ],
  exports: [AnalysisService, TechnicalService, RiskService, LearningService],
})
export class AnalysisModule {}
