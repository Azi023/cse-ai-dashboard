import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyFinancialsController } from './company-financials.controller';
import { CompanyFinancialsService } from './company-financials.service';
import { CseDataModule } from '../cse-data/cse-data.module';
import { CompanyFinancial, Stock } from '../../entities';

@Module({
  imports: [TypeOrmModule.forFeature([CompanyFinancial, Stock]), CseDataModule],
  controllers: [CompanyFinancialsController],
  providers: [CompanyFinancialsService],
  exports: [CompanyFinancialsService],
})
export class CompanyFinancialsModule {}
