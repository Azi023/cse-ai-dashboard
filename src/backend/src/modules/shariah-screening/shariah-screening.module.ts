import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShariahScreeningController } from './shariah-screening.controller';
import { ShariahScreeningService } from './shariah-screening.service';
import { Stock, ShariahScreening } from '../../entities';

@Module({
  imports: [TypeOrmModule.forFeature([Stock, ShariahScreening])],
  controllers: [ShariahScreeningController],
  providers: [ShariahScreeningService],
  exports: [ShariahScreeningService],
})
export class ShariahScreeningModule {}
