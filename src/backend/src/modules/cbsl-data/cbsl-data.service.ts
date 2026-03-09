import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { MacroData } from '../../entities';

/** Known CBSL indicator names */
export const CBSL_INDICATORS = {
  SDFR: 'sdfr',
  SLFR: 'slfr',
  AWPLR: 'awplr',
  AWDR: 'awdr',
  TBILL_91D: 'tbill_91d',
  TBILL_182D: 'tbill_182d',
  TBILL_364D: 'tbill_364d',
  USD_LKR: 'usd_lkr',
  INFLATION_CCPI: 'inflation_ccpi_yoy',
  MONEY_SUPPLY_M2: 'money_supply_m2',
} as const;

/** Human-readable labels for display */
export const INDICATOR_LABELS: Record<string, string> = {
  [CBSL_INDICATORS.SDFR]: 'SDFR (Standing Deposit Facility Rate)',
  [CBSL_INDICATORS.SLFR]: 'SLFR (Standing Lending Facility Rate)',
  [CBSL_INDICATORS.AWPLR]: 'AWPLR (Avg Weighted Prime Lending Rate)',
  [CBSL_INDICATORS.AWDR]: 'AWDR (Avg Weighted Deposit Rate)',
  [CBSL_INDICATORS.TBILL_91D]: 'Treasury Bill 91-day',
  [CBSL_INDICATORS.TBILL_182D]: 'Treasury Bill 182-day',
  [CBSL_INDICATORS.TBILL_364D]: 'Treasury Bill 364-day',
  [CBSL_INDICATORS.USD_LKR]: 'USD/LKR Exchange Rate',
  [CBSL_INDICATORS.INFLATION_CCPI]: 'Inflation (CCPI YoY)',
  [CBSL_INDICATORS.MONEY_SUPPLY_M2]: 'Money Supply (M2)',
};

@Injectable()
export class CbslDataService {
  private readonly logger = new Logger(CbslDataService.name);
  private readonly dataDir: string;

  constructor(
    private readonly httpService: HttpService,
    @InjectRepository(MacroData)
    private readonly macroDataRepository: Repository<MacroData>,
  ) {
    // data/cbsl-macro/ at the project root (two levels up from src/backend/src)
    this.dataDir = path.resolve(__dirname, '..', '..', '..', '..', '..', 'data', 'cbsl-macro');
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  // ─── Excel download & parse ──────────────────────────────────

  /**
   * Download a CBSL xlsx file and save it locally.
   * Returns the local file path or null on failure.
   */
  async downloadAndParseExcel(
    url: string,
    filename: string,
  ): Promise<XLSX.WorkBook | null> {
    const filePath = path.join(this.dataDir, filename);

    try {
      this.logger.log(`Downloading CBSL file: ${url}`);

      const response = await firstValueFrom(
        this.httpService.get(url, {
          responseType: 'arraybuffer',
          timeout: 60000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; CSE-Dashboard/1.0)',
            Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
        }),
      );

      fs.writeFileSync(filePath, Buffer.from(response.data));
      this.logger.log(`Saved CBSL file to ${filePath}`);

      const workbook = XLSX.read(response.data, { type: 'buffer' });
      return workbook;
    } catch (error) {
      this.logger.error(`Failed to download CBSL file ${url}: ${String(error)}`);

      // Try reading a previously downloaded copy
      if (fs.existsSync(filePath)) {
        this.logger.log(`Using cached file: ${filePath}`);
        try {
          const data = fs.readFileSync(filePath);
          return XLSX.read(data, { type: 'buffer' });
        } catch (readError) {
          this.logger.error(`Failed to read cached file: ${String(readError)}`);
        }
      }

      return null;
    }
  }

  // ─── Interest rates ingestion ────────────────────────────────

  /**
   * Download and parse the CBSL interest rates Excel.
   * CBSL publishes key rates at:
   * https://www.cbsl.gov.lk/sites/default/files/cbslweb_documents/statistics/Key_Rates.xlsx
   *
   * The Excel has complex multi-row headers. We scan for numeric rows
   * and extract the latest values for key indicators.
   */
  async ingestInterestRates(): Promise<void> {
    const url =
      'https://www.cbsl.gov.lk/sites/default/files/cbslweb_documents/statistics/Key_Rates.xlsx';

    const workbook = await this.downloadAndParseExcel(url, 'Key_Rates.xlsx');

    if (!workbook) {
      this.logger.warn('Could not download interest rates Excel — skipping');
      return;
    }

    try {
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: null,
      }) as unknown as unknown[][];

      this.logger.log(`Interest rates sheet has ${jsonData.length} rows`);

      // Strategy: scan all rows looking for the ones that look like data rows.
      // A data row typically has a date-like first column and numeric values after.
      // We want the LAST (most recent) such row.

      const indicatorMapping: Record<string, string> = {};
      let headerRow: unknown[] | null = null;
      let latestDataRow: unknown[] | null = null;
      let latestDate: string | null = null;

      for (const row of jsonData) {
        if (!row || row.length === 0) continue;

        // Try to identify header rows (contain keywords like SDFR, SLFR, AWPLR, etc.)
        const rowStr = row.map(String).join(' ').toUpperCase();
        if (
          rowStr.includes('SDFR') ||
          rowStr.includes('SLFR') ||
          rowStr.includes('STANDING DEPOSIT') ||
          rowStr.includes('STANDING LENDING') ||
          rowStr.includes('AWPLR') ||
          rowStr.includes('PRIME LENDING')
        ) {
          headerRow = row;
          continue;
        }

        // Check if this is a data row (first cell is date-like or has a year, rest are numbers)
        const firstCell = row[0];
        const isDateLike =
          firstCell instanceof Date ||
          (typeof firstCell === 'number' && firstCell > 40000 && firstCell < 60000) || // Excel serial date
          (typeof firstCell === 'string' && /\d{4}/.test(firstCell));

        if (!isDateLike) continue;

        // Check if there are numeric values in this row
        const numericCount = row
          .slice(1)
          .filter((cell) => typeof cell === 'number' && !isNaN(cell)).length;

        if (numericCount >= 2) {
          latestDataRow = row;

          // Parse date
          if (firstCell instanceof Date) {
            latestDate = firstCell.toISOString().split('T')[0];
          } else if (typeof firstCell === 'number' && firstCell > 40000) {
            // Excel serial date to JS date
            const excelEpoch = new Date(1899, 11, 30);
            const jsDate = new Date(excelEpoch.getTime() + firstCell * 86400000);
            latestDate = jsDate.toISOString().split('T')[0];
          } else if (typeof firstCell === 'string') {
            // Try parsing the string as a date
            const parsed = new Date(firstCell);
            if (!isNaN(parsed.getTime())) {
              latestDate = parsed.toISOString().split('T')[0];
            } else {
              latestDate = new Date().toISOString().split('T')[0];
            }
          }
        }
      }

      if (!latestDataRow || !latestDate) {
        this.logger.warn('Could not find data rows in interest rates Excel');
        return;
      }

      this.logger.log(`Latest interest rate data row date: ${latestDate}`);

      // If we found a header row, map column indices to indicator names
      if (headerRow) {
        for (let i = 0; i < headerRow.length; i++) {
          const header = String(headerRow[i] ?? '').toUpperCase();
          if (header.includes('SDFR') || header.includes('STANDING DEPOSIT')) {
            indicatorMapping[String(i)] = CBSL_INDICATORS.SDFR;
          } else if (header.includes('SLFR') || header.includes('STANDING LENDING')) {
            indicatorMapping[String(i)] = CBSL_INDICATORS.SLFR;
          } else if (header.includes('AWPLR') || header.includes('PRIME LENDING')) {
            indicatorMapping[String(i)] = CBSL_INDICATORS.AWPLR;
          } else if (header.includes('AWDR') || header.includes('DEPOSIT RATE')) {
            indicatorMapping[String(i)] = CBSL_INDICATORS.AWDR;
          } else if (header.includes('91') || header.includes('3 MONTH')) {
            indicatorMapping[String(i)] = CBSL_INDICATORS.TBILL_91D;
          } else if (header.includes('182') || header.includes('6 MONTH')) {
            indicatorMapping[String(i)] = CBSL_INDICATORS.TBILL_182D;
          } else if (header.includes('364') || header.includes('12 MONTH') || header.includes('1 YEAR')) {
            indicatorMapping[String(i)] = CBSL_INDICATORS.TBILL_364D;
          }
        }
      }

      // Extract values from the latest row
      // If we couldn't map headers, try a positional fallback
      if (Object.keys(indicatorMapping).length === 0) {
        // Common CBSL layout: Date | SDFR | SLFR | Repo | Rev.Repo | AWPLR | AWDR | 91d | 182d | 364d
        const positionalIndicators = [
          null, // date column
          CBSL_INDICATORS.SDFR,
          CBSL_INDICATORS.SLFR,
          null, // repo
          null, // reverse repo
          CBSL_INDICATORS.AWPLR,
          CBSL_INDICATORS.AWDR,
          CBSL_INDICATORS.TBILL_91D,
          CBSL_INDICATORS.TBILL_182D,
          CBSL_INDICATORS.TBILL_364D,
        ];

        for (let i = 1; i < latestDataRow.length && i < positionalIndicators.length; i++) {
          const indicator = positionalIndicators[i];
          const value = latestDataRow[i];
          if (indicator && typeof value === 'number' && !isNaN(value)) {
            await this.upsertMacroData(indicator, latestDate, value, 'cbsl');
          }
        }
      } else {
        // Use mapped headers
        for (const [colIndex, indicator] of Object.entries(indicatorMapping)) {
          const value = latestDataRow[parseInt(colIndex)];
          if (typeof value === 'number' && !isNaN(value)) {
            await this.upsertMacroData(indicator, latestDate, value, 'cbsl');
          }
        }
      }

      this.logger.log('Interest rates ingestion complete');
    } catch (error) {
      this.logger.error(`Error parsing interest rates Excel: ${String(error)}`);
    }
  }

  // ─── USD/LKR exchange rate ───────────────────────────────────

  /**
   * Fetch USD/LKR rate from the free exchange rate API.
   */
  async fetchUsdLkrRate(): Promise<void> {
    try {
      this.logger.log('Fetching USD/LKR exchange rate...');

      const response = await firstValueFrom(
        this.httpService.get<{ result: string; rates: Record<string, number> }>(
          'https://open.er-api.com/v6/latest/USD',
          { timeout: 15000 },
        ),
      );

      const lkrRate = response.data?.rates?.LKR;

      if (lkrRate && typeof lkrRate === 'number') {
        const today = new Date().toISOString().split('T')[0];
        await this.upsertMacroData(CBSL_INDICATORS.USD_LKR, today, lkrRate, 'er-api.com');
        this.logger.log(`USD/LKR rate saved: ${lkrRate}`);
      } else {
        this.logger.warn('USD/LKR rate not found in API response');
      }
    } catch (error) {
      this.logger.error(`Failed to fetch USD/LKR rate: ${String(error)}`);
    }
  }

  // ─── Data access methods ─────────────────────────────────────

  /**
   * Get the latest value for all indicators.
   */
  async getLatestIndicators(): Promise<
    Array<{
      indicator: string;
      label: string;
      value: number;
      data_date: string;
      source: string | null;
    }>
  > {
    // Use a subquery to get the latest data_date per indicator,
    // then join back to get the full row.
    const results = await this.macroDataRepository
      .createQueryBuilder('md')
      .where(
        `(md.indicator, md.data_date) IN (
          SELECT md2.indicator, MAX(md2.data_date)
          FROM macro_data md2
          GROUP BY md2.indicator
        )`,
      )
      .orderBy('md.indicator', 'ASC')
      .getMany();

    return results.map((row) => ({
      indicator: row.indicator,
      label: INDICATOR_LABELS[row.indicator] ?? row.indicator,
      value: typeof row.value === 'string' ? parseFloat(row.value) : Number(row.value),
      data_date:
        row.data_date instanceof Date
          ? row.data_date.toISOString().split('T')[0]
          : String(row.data_date),
      source: row.source,
    }));
  }

  /**
   * Get time series for a specific indicator.
   */
  async getIndicatorHistory(
    indicator: string,
    limit = 365,
  ): Promise<
    Array<{
      indicator: string;
      value: number;
      data_date: string;
      source: string | null;
    }>
  > {
    const results = await this.macroDataRepository
      .createQueryBuilder('md')
      .where('md.indicator = :indicator', { indicator })
      .orderBy('md.data_date', 'DESC')
      .limit(limit)
      .getMany();

    return results.map((row) => ({
      indicator: row.indicator,
      value: typeof row.value === 'string' ? parseFloat(row.value) : Number(row.value),
      data_date:
        row.data_date instanceof Date
          ? row.data_date.toISOString().split('T')[0]
          : String(row.data_date),
      source: row.source,
    }));
  }

  // ─── Full refresh ────────────────────────────────────────────

  /**
   * Run all ingestion methods. Returns a summary of what was updated.
   */
  async refreshAll(): Promise<{ message: string; errors: string[] }> {
    const errors: string[] = [];

    try {
      await this.ingestInterestRates();
    } catch (error) {
      errors.push(`Interest rates: ${String(error)}`);
    }

    try {
      await this.fetchUsdLkrRate();
    } catch (error) {
      errors.push(`USD/LKR: ${String(error)}`);
    }

    return {
      message:
        errors.length === 0
          ? 'All CBSL data refreshed successfully'
          : `Refresh completed with ${errors.length} error(s)`,
      errors,
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────

  /**
   * Upsert a macro data row by indicator + date.
   */
  async upsertMacroData(
    indicator: string,
    dateStr: string,
    value: number,
    source: string,
  ): Promise<void> {
    try {
      const existing = await this.macroDataRepository
        .createQueryBuilder('md')
        .where('md.indicator = :indicator', { indicator })
        .andWhere('md.data_date = :date', { date: dateStr })
        .getOne();

      if (existing) {
        existing.value = value;
        existing.source = source;
        await this.macroDataRepository.save(existing);
      } else {
        const macroData = new MacroData();
        macroData.indicator = indicator;
        macroData.data_date = new Date(dateStr);
        macroData.value = value;
        macroData.source = source;
        await this.macroDataRepository.save(macroData);
      }

      this.logger.debug(`Upserted ${indicator} = ${value} on ${dateStr}`);
    } catch (error) {
      this.logger.error(
        `Error upserting macro data ${indicator}: ${String(error)}`,
      );
    }
  }
}
