import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DemoAccount } from './entities/demo-account.entity';
import { DemoTrade } from './entities/demo-trade.entity';
import { DemoHolding } from './entities/demo-holding.entity';
import { DemoDailySnapshot } from './entities/demo-daily-snapshot.entity';
import { DemoBenchmark } from './entities/demo-benchmark.entity';
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
    ]),
  ],
  controllers: [DemoController],
  providers: [DemoService],
  exports: [DemoService],
})
export class DemoModule {}
