import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ATradSyncController } from './atrad-sync.controller';
import { ATradSyncService } from './atrad-sync.service';
import { OrderService } from './order.service';
import { ATradOrderExecutor } from './atrad-order-executor';
import { TradeController } from './trade.controller';
import { CseDataModule } from '../cse-data/cse-data.module';
import { Portfolio, Stock, Alert } from '../../entities';
import { PendingOrder } from '../../entities/pending-order.entity';
import { PositionRisk } from '../../entities/position-risk.entity';
import { StrategySignal } from '../../entities/strategy-signal.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Portfolio,
      Stock,
      Alert,
      PendingOrder,
      PositionRisk,
      StrategySignal, // needed by OrderService for trade queue processing
    ]),
    CseDataModule, // provides RedisService
  ],
  controllers: [ATradSyncController, TradeController],
  providers: [ATradSyncService, OrderService, ATradOrderExecutor],
  exports: [ATradSyncService, OrderService],
})
export class ATradSyncModule {}
