import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiEngineController } from './ai-engine.controller';
import { AiEngineService } from './ai-engine.service';
import { MockGenerator } from './mock-generator';
import { CseDataModule } from '../cse-data/cse-data.module';
import { SignalTrackingModule } from '../signal-tracking/signal-tracking.module';
import { StrategyEngineModule } from '../strategy-engine/strategy-engine.module';
import { Stock, MacroData } from '../../entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([Stock, MacroData]),
    CseDataModule,
    SignalTrackingModule,
    StrategyEngineModule,
  ],
  controllers: [AiEngineController],
  providers: [AiEngineService, MockGenerator],
  exports: [AiEngineService],
})
export class AiEngineModule {}
