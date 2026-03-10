import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DividendsService } from './dividends.service';
import { DividendsController } from './dividends.controller';
import { Dividend, Stock, Portfolio } from '../../entities';

@Module({
  imports: [TypeOrmModule.forFeature([Dividend, Stock, Portfolio])],
  controllers: [DividendsController],
  providers: [DividendsService],
  exports: [DividendsService],
})
export class DividendsModule {}
