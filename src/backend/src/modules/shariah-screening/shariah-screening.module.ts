import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShariahScreeningController } from './shariah-screening.controller';
import { ShariahScreeningService } from './shariah-screening.service';
import { Stock, ShariahScreening } from '../../entities';
import { CseDataModule } from '../cse-data/cse-data.module';

@Module({
  imports: [TypeOrmModule.forFeature([Stock, ShariahScreening]), CseDataModule],
  controllers: [ShariahScreeningController],
  providers: [ShariahScreeningService],
  exports: [ShariahScreeningService],
})
export class ShariahScreeningModule {}
