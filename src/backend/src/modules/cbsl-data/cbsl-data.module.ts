import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CbslDataService } from './cbsl-data.service';
import { CbslDataController } from './cbsl-data.controller';
import { MacroData } from '../../entities';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 3,
    }),
    TypeOrmModule.forFeature([MacroData]),
  ],
  controllers: [CbslDataController],
  providers: [CbslDataService],
  exports: [CbslDataService],
})
export class CbslDataModule {}
