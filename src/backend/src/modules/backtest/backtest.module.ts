import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BacktestController } from './backtest.controller';
import { BacktestService } from './backtest.service';
import { DailyPrice, Stock } from '../../entities';

@Module({
  imports: [TypeOrmModule.forFeature([DailyPrice, Stock])],
  controllers: [BacktestController],
  providers: [BacktestService],
})
export class BacktestModule {}
