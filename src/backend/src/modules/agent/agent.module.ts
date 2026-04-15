import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PendingOrder } from '../../entities/pending-order.entity';
import { Portfolio } from '../../entities';
import { Alert } from '../../entities/alert.entity';
import { CseDataModule } from '../cse-data/cse-data.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PendingOrder, Portfolio, Alert]),
    CseDataModule, // provides RedisService
  ],
  controllers: [AgentController],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
