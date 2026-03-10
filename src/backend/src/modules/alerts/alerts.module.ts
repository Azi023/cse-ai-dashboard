import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertsService } from './alerts.service';
import { AlertsController } from './alerts.controller';
import { Alert, Stock, Portfolio } from '../../entities';
import { CseDataModule } from '../cse-data/cse-data.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Alert, Stock, Portfolio]),
    CseDataModule,
  ],
  controllers: [AlertsController],
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}
