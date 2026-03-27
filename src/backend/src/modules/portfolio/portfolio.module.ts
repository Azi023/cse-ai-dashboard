import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';
import { CseDataModule } from '../cse-data/cse-data.module';
import { Portfolio, Stock, MonthlyDeposit } from '../../entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([Portfolio, Stock, MonthlyDeposit]),
    CseDataModule,
  ],
  controllers: [PortfolioController],
  providers: [PortfolioService],
  exports: [PortfolioService],
})
export class PortfolioModule {}
