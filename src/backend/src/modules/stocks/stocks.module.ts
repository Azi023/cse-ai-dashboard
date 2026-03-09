import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StocksController } from './stocks.controller';
import { StocksService } from './stocks.service';
import { CseDataModule } from '../cse-data/cse-data.module';
import {
  Stock,
  DailyPrice,
  Announcement,
  MarketSummary,
} from '../../entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Stock,
      DailyPrice,
      Announcement,
      MarketSummary,
    ]),
    CseDataModule,
  ],
  controllers: [StocksController],
  providers: [StocksService],
  exports: [StocksService],
})
export class StocksModule {}
