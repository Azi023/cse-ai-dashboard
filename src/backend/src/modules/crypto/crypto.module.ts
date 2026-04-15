import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CryptoPrice } from '../../entities/crypto-price.entity';
import { CryptoOHLCV } from '../../entities/crypto-ohlcv.entity';
import { CryptoTechnicalSignal } from '../../entities/crypto-technical-signal.entity';
import { CryptoDCAConfig } from '../../entities/crypto-dca-config.entity';
import { CryptoDCAExecution } from '../../entities/crypto-dca-execution.entity';
import { CseDataModule } from '../cse-data/cse-data.module';
import { UserPreferencesModule } from '../user-preferences/user-preferences.module';
import { CryptoController } from './crypto.controller';
import { CryptoService } from './crypto.service';
import { CryptoTechnicalService } from './crypto-technical.service';
import { CryptoDCAService } from './crypto-dca.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CryptoPrice,
      CryptoOHLCV,
      CryptoTechnicalSignal,
      CryptoDCAConfig,
      CryptoDCAExecution,
    ]),
    CseDataModule,
    UserPreferencesModule,
  ],
  controllers: [CryptoController],
  providers: [CryptoService, CryptoTechnicalService, CryptoDCAService],
  exports: [CryptoService, CryptoTechnicalService, CryptoDCAService],
})
export class CryptoModule {}
