import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ZakatService } from './zakat.service';
import { ZakatController } from './zakat.controller';
import { Portfolio, Stock, CompanyFinancial } from '../../entities';
import { CseDataModule } from '../cse-data/cse-data.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Portfolio, Stock, CompanyFinancial]),
    CseDataModule,
  ],
  controllers: [ZakatController],
  providers: [ZakatService],
  exports: [ZakatService],
})
export class ZakatModule {}
