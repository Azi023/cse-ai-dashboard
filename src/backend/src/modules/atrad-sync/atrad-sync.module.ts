import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ATradSyncController } from './atrad-sync.controller';
import { ATradSyncService } from './atrad-sync.service';
import { OrderService } from './order.service';
import { ATradOrderExecutor } from './atrad-order-executor';
import { CseDataModule } from '../cse-data/cse-data.module';
import { Portfolio, Stock, MonthlyDeposit, Alert } from '../../entities';
import { PendingOrder } from '../../entities/pending-order.entity';
import { PositionRisk } from '../../entities/position-risk.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Portfolio, Stock, MonthlyDeposit, Alert, PendingOrder, PositionRisk]),
    CseDataModule,
  ],
  controllers: [ATradSyncController],
  providers: [ATradSyncService, OrderService, ATradOrderExecutor],
  exports: [ATradSyncService, OrderService],
})
export class ATradSyncModule {}
