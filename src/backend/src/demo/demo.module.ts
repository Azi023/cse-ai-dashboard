import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DemoAccount } from './entities/demo-account.entity';
import { DemoTrade } from './entities/demo-trade.entity';
import { DemoHolding } from './entities/demo-holding.entity';
import { DemoDailySnapshot } from './entities/demo-daily-snapshot.entity';
import { DemoBenchmark } from './entities/demo-benchmark.entity';
import { Stock } from '../entities/stock.entity';
import { DailyPrice } from '../entities/daily-price.entity';
import { CseDataModule } from '../modules/cse-data/cse-data.module';
import { DemoService } from './demo.service';
import { DemoController } from './demo.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DemoAccount,
      DemoTrade,
      DemoHolding,
      DemoDailySnapshot,
      DemoBenchmark,
      Stock,
      DailyPrice,
    ]),
    CseDataModule,
  ],
  controllers: [DemoController],
  providers: [DemoService],
  exports: [DemoService],
})
export class DemoModule {}
