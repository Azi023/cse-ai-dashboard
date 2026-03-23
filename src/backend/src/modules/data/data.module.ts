import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Stock, DailyPrice } from '../../entities';
import { DataController } from './data.controller';
import { DataService } from './data.service';

@Module({
  imports: [TypeOrmModule.forFeature([Stock, DailyPrice])],
  controllers: [DataController],
  providers: [DataService],
  exports: [DataService],
})
export class DataModule {}
