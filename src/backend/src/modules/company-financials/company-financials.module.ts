import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyFinancialsController } from './company-financials.controller';
import { CompanyFinancialsService } from './company-financials.service';
import { CseFundamentalsScraperService } from './cse-fundamentals-scraper.service';
import { CseHistoricalBackfillService } from './cse-historical-backfill.service';
import { CseDataModule } from '../cse-data/cse-data.module';
import { CompanyFinancial, Stock, DailyPrice } from '../../entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([CompanyFinancial, Stock, DailyPrice]),
    CseDataModule,
  ],
  controllers: [CompanyFinancialsController],
  providers: [
    CompanyFinancialsService,
    CseFundamentalsScraperService,
    CseHistoricalBackfillService,
  ],
  exports: [
    CompanyFinancialsService,
    CseFundamentalsScraperService,
    CseHistoricalBackfillService,
  ],
})
export class CompanyFinancialsModule {}
