import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CseApiService } from './cse-api.service';
import { CseDataService } from './cse-data.service';
import { RedisService } from './redis.service';
import {
  Stock,
  DailyPrice,
  Announcement,
  MarketSummary,
  MacroData,
} from '../../entities';

@Module({
  imports: [
    HttpModule.register({
      timeout: 15000,
      maxRedirects: 3,
    }),
    TypeOrmModule.forFeature([
      Stock,
      DailyPrice,
      Announcement,
      MarketSummary,
      MacroData,
    ]),
  ],
  providers: [CseApiService, CseDataService, RedisService],
  exports: [CseApiService, CseDataService, RedisService],
})
export class CseDataModule {}
