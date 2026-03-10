import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { Portfolio, Stock, ShariahScreening, DailyPrice } from '../../entities';

@Module({
  imports: [TypeOrmModule.forFeature([Portfolio, Stock, ShariahScreening, DailyPrice])],
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportModule {}
