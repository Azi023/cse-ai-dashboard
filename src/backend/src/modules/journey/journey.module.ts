import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JourneyController } from './journey.controller';
import { JourneyService } from './journey.service';
import { CseDataModule } from '../cse-data/cse-data.module';
import {
  MonthlyDeposit,
  InvestmentGoal,
  Portfolio,
  Stock,
  MarketSummary,
} from '../../entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MonthlyDeposit,
      InvestmentGoal,
      Portfolio,
      Stock,
      MarketSummary,
    ]),
    CseDataModule,
  ],
  controllers: [JourneyController],
  providers: [JourneyService],
  exports: [JourneyService],
})
export class JourneyModule {}
