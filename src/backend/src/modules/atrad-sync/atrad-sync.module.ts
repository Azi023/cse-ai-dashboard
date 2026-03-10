import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ATradSyncController } from './atrad-sync.controller';
import { ATradSyncService } from './atrad-sync.service';
import { CseDataModule } from '../cse-data/cse-data.module';
import { Portfolio, Stock, MonthlyDeposit } from '../../entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([Portfolio, Stock, MonthlyDeposit]),
    CseDataModule,
  ],
  controllers: [ATradSyncController],
  providers: [ATradSyncService],
  exports: [ATradSyncService],
})
export class ATradSyncModule {}
