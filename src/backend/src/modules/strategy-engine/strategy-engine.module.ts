import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketRegimeRecord } from '../../entities/market-regime.entity';
import { StrategySignal } from '../../entities/strategy-signal.entity';
import { StrategyBacktestResult } from '../../entities/strategy-backtest-result.entity';
import {
  Stock,
  TechnicalSignal,
  CompanyFinancial,
  Dividend,
  Announcement,
  MacroData,
  DailyPrice,
  MarketSnapshot,
} from '../../entities';
import { CseDataModule } from '../cse-data/cse-data.module';
import { MarketRegimeService } from './market-regime.service';
import { StrategySelectorService } from './strategy-selector.service';
import { SignalGeneratorService } from './signal-generator.service';
import { AiContextBridgeService } from './ai-context-bridge.service';
import { StrategyBacktesterService } from './strategy-backtester.service';
import { StrategyEngineController } from './strategy-engine.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MarketRegimeRecord,
      StrategySignal,
      StrategyBacktestResult,
      Stock,
      TechnicalSignal,
      CompanyFinancial,
      Dividend,
      Announcement,
      MacroData,
      DailyPrice,
      MarketSnapshot,
    ]),
    CseDataModule, // provides RedisService
  ],
  controllers: [StrategyEngineController],
  providers: [
    MarketRegimeService,
    StrategySelectorService,
    SignalGeneratorService,
    AiContextBridgeService,
    StrategyBacktesterService,
  ],
  exports: [
    MarketRegimeService,
    StrategySelectorService,
    SignalGeneratorService,
    AiContextBridgeService,
    StrategyBacktesterService,
  ],
})
export class StrategyEngineModule {}
