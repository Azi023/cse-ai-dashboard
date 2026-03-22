import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyFinancialsController } from './company-financials.controller';
import { CompanyFinancialsService } from './company-financials.service';
import { CseFundamentalsScraperService } from './cse-fundamentals-scraper.service';
import { CseDataModule } from '../cse-data/cse-data.module';
import { CompanyFinancial, Stock } from '../../entities';

@Module({
  imports: [TypeOrmModule.forFeature([CompanyFinancial, Stock]), CseDataModule],
  controllers: [CompanyFinancialsController],
  providers: [CompanyFinancialsService, CseFundamentalsScraperService],
  exports: [CompanyFinancialsService, CseFundamentalsScraperService],
})
export class CompanyFinancialsModule {}
