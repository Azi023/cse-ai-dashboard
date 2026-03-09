import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';

@Injectable()
export class CseApiService {
  private readonly logger = new Logger(CseApiService.name);
  private readonly baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>(
      'CSE_API_BASE_URL',
      'https://www.cse.lk/api/',
    );
  }

  private async post<T = unknown>(
    endpoint: string,
    body: string = '',
  ): Promise<T | null> {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      this.logger.debug(`POST ${url}`);

      const response: AxiosResponse<T> = await firstValueFrom(
        this.httpService.post<T>(url, body, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 15000,
        }),
      );

      return response.data;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `CSE API error for ${endpoint}: ${message}`,
      );
      return null;
    }
  }

  async getMarketStatus(): Promise<unknown> {
    return this.post('marketStatus');
  }

  async getTradeSummary(): Promise<unknown> {
    return this.post('tradeSummary');
  }

  async getMarketSummary(): Promise<unknown> {
    return this.post('marketSummery');
  }

  async getAspiData(): Promise<unknown> {
    return this.post('aspiData');
  }

  async getSnpData(): Promise<unknown> {
    return this.post('snpData');
  }

  async getTopGainers(): Promise<unknown> {
    return this.post('topGainers');
  }

  async getTopLosers(): Promise<unknown> {
    return this.post('topLooses');
  }

  async getMostActive(): Promise<unknown> {
    return this.post('mostActiveTrades');
  }

  async getAllSectors(): Promise<unknown> {
    return this.post('allSectors');
  }

  async getCompanyInfo(symbol: string): Promise<unknown> {
    return this.post('companyInfoSummery', `company=${encodeURIComponent(symbol)}`);
  }

  async getChartData(symbol: string): Promise<unknown> {
    return this.post('chartData', `symbol=${encodeURIComponent(symbol)}`);
  }

  async getDetailedTrades(): Promise<unknown> {
    return this.post('detailedTrades');
  }

  async getFinancialAnnouncements(): Promise<unknown> {
    return this.post('getFinancialAnnouncement');
  }

  async getApprovedAnnouncements(): Promise<unknown> {
    return this.post('approvedAnnouncement');
  }
}
