import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';
import {
  MarketSnapshot,
  PortfolioSnapshot,
  WeeklyMetric,
  StockScore,
  AiRecommendation,
  Stock,
  DailyPrice,
  Alert,
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
    ]),
    CseDataModule,
    PortfolioModule,
  ],
  controllers: [AnalysisController],
  providers: [AnalysisService],
  exports: [AnalysisService],
})
export class AnalysisModule {}
