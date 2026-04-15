import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaperPortfolio } from '../../entities/paper-portfolio.entity';
import { PaperTrade } from '../../entities/paper-trade.entity';
import { Stock, DailyPrice } from '../../entities';
import { CseDataModule } from '../cse-data/cse-data.module';
import { UserPreferencesModule } from '../user-preferences/user-preferences.module';
import { PaperTradingController } from './paper-trading.controller';
import { PaperTradingService } from './paper-trading.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaperPortfolio, PaperTrade, Stock, DailyPrice]),
    CseDataModule,
    UserPreferencesModule,
  ],
  controllers: [PaperTradingController],
  providers: [PaperTradingService],
  exports: [PaperTradingService],
})
export class PaperTradingModule {}
