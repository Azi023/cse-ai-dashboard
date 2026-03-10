import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';
import { CseDataModule } from '../cse-data/cse-data.module';
import {
  Stock,
  MarketSummary,
  Portfolio,
  NewsItem,
  DailyPrice,
} from '../../entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Stock,
      MarketSummary,
      Portfolio,
      NewsItem,
      DailyPrice,
    ]),
    CseDataModule,
  ],
  controllers: [InsightsController],
  providers: [InsightsService],
  exports: [InsightsService],
})
export class InsightsModule {}
