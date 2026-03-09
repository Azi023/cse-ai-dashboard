import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import { HttpModule } from '@nestjs/axios';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CseDataModule } from './modules/cse-data/cse-data.module';
import { StocksModule } from './modules/stocks/stocks.module';
import { ShariahScreeningModule } from './modules/shariah-screening/shariah-screening.module';
import { PortfolioModule } from './modules/portfolio/portfolio.module';
import { CompanyFinancialsModule } from './modules/company-financials/company-financials.module';
import { CbslDataModule } from './modules/cbsl-data/cbsl-data.module';
import { AiEngineModule } from './modules/ai-engine/ai-engine.module';

@Module({
  imports: [
    // Global configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // PostgreSQL via TypeORM
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres' as const,
        host: configService.get<string>('DATABASE_HOST', 'localhost'),
        port: configService.get<number>('DATABASE_PORT', 5432),
        username: configService.get<string>('DATABASE_USER', 'cse_user'),
        password: configService.get<string>(
          'DATABASE_PASSWORD',
          'cse_secure_2026',
        ),
        database: configService.get<string>(
          'DATABASE_NAME',
          'cse_dashboard',
        ),
        autoLoadEntities: true,
        synchronize:
          configService.get<string>('NODE_ENV', 'development') ===
          'development',
      }),
    }),

    // Task scheduling
    ScheduleModule.forRoot(),

    // Bull queue (Redis-backed)
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),

    // HTTP client
    HttpModule,

    // Feature modules
    CseDataModule,
    StocksModule,
    ShariahScreeningModule,
    PortfolioModule,
    CompanyFinancialsModule,
    CbslDataModule,
    AiEngineModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
