import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GlobalDataService } from './global-data.service';
import { GlobalDataController } from './global-data.controller';
import { MacroData } from '../../entities';
import { CseDataModule } from '../cse-data/cse-data.module';

@Module({
  imports: [
    HttpModule.register({
      timeout: 15000,
      maxRedirects: 3,
    }),
    TypeOrmModule.forFeature([MacroData]),
    CseDataModule, // For RedisService
  ],
  controllers: [GlobalDataController],
  providers: [GlobalDataService],
  exports: [GlobalDataService],
})
export class GlobalDataModule {}
