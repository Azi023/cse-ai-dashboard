import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AiDebate,
  Stock,
  StrategySignal,
  TechnicalSignal,
  CompanyFinancial,
} from '../../entities';
import { AiEngineModule } from '../ai-engine/ai-engine.module';
import { CseDataModule } from '../cse-data/cse-data.module';
import { DebateController } from './debate.controller';
import { DebateService } from './debate.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AiDebate,
      Stock,
      StrategySignal,
      TechnicalSignal,
      CompanyFinancial,
    ]),
    AiEngineModule, // AiProviderFactory + AiUsageService
    CseDataModule, // TradingCalendarService
  ],
  controllers: [DebateController],
  providers: [DebateService],
  exports: [DebateService],
})
export class DebateModule {}
