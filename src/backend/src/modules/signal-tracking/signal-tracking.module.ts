import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SignalTrackingService } from './signal-tracking.service';
import { SignalTrackingController } from './signal-tracking.controller';
import { SignalRecord, Stock } from '../../entities';

@Module({
  imports: [TypeOrmModule.forFeature([SignalRecord, Stock])],
  controllers: [SignalTrackingController],
  providers: [SignalTrackingService],
  exports: [SignalTrackingService],
})
export class SignalTrackingModule {}
