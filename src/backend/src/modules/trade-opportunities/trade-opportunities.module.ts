import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TradeOpportunitiesController } from './trade-opportunities.controller';
import { TradeOpportunitiesService } from './trade-opportunities.service';
import { StockScore } from '../../entities/stock-score.entity';
import { TechnicalSignal } from '../../entities/technical-signal.entity';
import { CompanyFinancial } from '../../entities/company-financial.entity';
import { Stock } from '../../entities/stock.entity';
import { CseDataModule } from '../cse-data/cse-data.module';
import { DemoModule } from '../../demo/demo.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([StockScore, TechnicalSignal, CompanyFinancial, Stock]),
    CseDataModule,
    DemoModule,
  ],
  controllers: [TradeOpportunitiesController],
  providers: [TradeOpportunitiesService],
})
export class TradeOpportunitiesModule {}
