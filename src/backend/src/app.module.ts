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
import { GlobalDataModule } from './modules/global-data/global-data.module';
import { DividendsModule } from './modules/dividends/dividends.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { SignalTrackingModule } from './modules/signal-tracking/signal-tracking.module';
import { NewsModule } from './modules/news/news.module';
import { ExportModule } from './modules/export/export.module';
import { BacktestModule } from './modules/backtest/backtest.module';
import { ATradSyncModule } from './modules/atrad-sync/atrad-sync.module';
import { JourneyModule } from './modules/journey/journey.module';
import { InsightsModule } from './modules/insights/insights.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AnalysisModule } from './modules/analysis/analysis.module';
import { DataModule } from './modules/data/data.module';
import { DemoModule } from './demo/demo.module';
import { TradeOpportunitiesModule } from './modules/trade-opportunities/trade-opportunities.module';

@Module({
  imports: [
    // Global configuration — load project root .env first, then backend .env (overrides)
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
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
        database: configService.get<string>('DATABASE_NAME', 'cse_dashboard'),
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
    GlobalDataModule,
    DividendsModule,
    AlertsModule,
    SignalTrackingModule,
    NewsModule,
    ExportModule,
    BacktestModule,
    ATradSyncModule,
    JourneyModule,
    InsightsModule,
    NotificationsModule,
    AnalysisModule,
    DataModule,
    DemoModule,
    TradeOpportunitiesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
