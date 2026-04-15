import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { DailyDigest } from '../../entities/daily-digest.entity';
import { WeeklyBrief } from '../../entities/weekly-brief.entity';
import { Alert, Announcement, MarketSummary } from '../../entities';
import { CseDataModule } from '../cse-data/cse-data.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { AnalysisModule } from '../analysis/analysis.module';
import { StrategyEngineModule } from '../strategy-engine/strategy-engine.module';
import { AiEngineModule } from '../ai-engine/ai-engine.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DailyDigest,
      WeeklyBrief,
      Alert,
      Announcement,
      MarketSummary,
    ]),
    CseDataModule,
    PortfolioModule,
    forwardRef(() => AnalysisModule),
    StrategyEngineModule,
    forwardRef(() => AiEngineModule),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
