import { Injectable, Logger } from '@nestjs/common';

/**
 * Sri Lankan trading calendar.
 *
 * Source: CBSL Bank Holidays 2026
 *   https://www.cbsl.gov.lk/en/about/about-the-bank/bank-holidays-2026
 * Cross-referenced: publicholidays.lk/2026-dates
 *
 * CSE is closed on weekends (Sat/Sun) and all CBSL bank holidays.
 * Keep this list updated yearly — bank holidays are gazetted annually.
 */
const SL_BANK_HOLIDAYS_2026: ReadonlyArray<{ date: string; name: string }> = [
  { date: '2026-01-03', name: 'Duruthu Full Moon Poya Day' },
  { date: '2026-01-15', name: 'Tamil Thai Pongal Day' },
  { date: '2026-02-01', name: 'Nawam Full Moon Poya Day' },
  { date: '2026-02-04', name: 'Independence Day' },
  { date: '2026-02-15', name: 'Maha Sivarathri Day' },
  { date: '2026-03-02', name: 'Medin Full Moon Poya Day' },
  { date: '2026-03-21', name: 'Id-Ul-Fitr (Ramazan Festival Day)' },
  { date: '2026-04-01', name: 'Special Bank Holiday (financial year-end)' },
  { date: '2026-04-03', name: 'Good Friday' },
  { date: '2026-04-13', name: 'Day prior to Sinhala & Tamil New Year' },
  { date: '2026-04-14', name: 'Sinhala & Tamil New Year Day' },
  { date: '2026-05-01', name: 'May Day / Bak Full Moon Poya' },
  { date: '2026-05-02', name: 'Day following May Day' },
  { date: '2026-05-28', name: 'Vesak Full Moon Poya Day' },
  { date: '2026-05-30', name: 'Day following Vesak' },
  { date: '2026-06-29', name: 'Poson Full Moon Poya Day' },
  { date: '2026-07-29', name: 'Esala Full Moon Poya Day' },
  { date: '2026-08-26', name: 'Nikini Full Moon Poya Day' },
  { date: '2026-08-27', name: 'Id-Ul-Alha (Hajj Festival Day)' },
  { date: '2026-09-26', name: 'Binara Full Moon Poya Day' },
  { date: '2026-10-25', name: 'Vap Full Moon Poya Day' },
  { date: '2026-11-08', name: 'Milad-Un-Nabi (Holy Prophet\u2019s Birthday)' },
  { date: '2026-11-24', name: 'Il Full Moon Poya Day' },
  { date: '2026-12-23', name: 'Unduvap Full Moon Poya Day' },
  { date: '2026-12-25', name: 'Christmas Day' },
];

const HOLIDAY_MAP: ReadonlyMap<string, string> = new Map(
  SL_BANK_HOLIDAYS_2026.map((h) => [h.date, h.name]),
);

export interface NonTradingReason {
  reason: 'weekend' | 'holiday';
  detail: string;
}

@Injectable()
export class TradingCalendarService {
  private readonly logger = new Logger(TradingCalendarService.name);

  /**
   * Return the non-trading reason for the given date, or null if it IS a trading day.
   * Uses VPS local time (Asia/Colombo) — do not pass UTC dates.
   */
  getNonTradingReason(date: Date = new Date()): NonTradingReason | null {
    const day = date.getDay();
    if (day === 0) return { reason: 'weekend', detail: 'Sunday' };
    if (day === 6) return { reason: 'weekend', detail: 'Saturday' };

    const iso = this.toIsoDate(date);
    const holidayName = HOLIDAY_MAP.get(iso);
    if (holidayName) return { reason: 'holiday', detail: holidayName };

    return null;
  }

  isTradingDay(date: Date = new Date()): boolean {
    return this.getNonTradingReason(date) === null;
  }

  /**
   * Log-and-skip helper for cron jobs. Returns true if the caller should skip.
   * Usage:
   *   if (this.calendar.skipIfNonTrading(this.logger, 'runStockScoring')) return;
   */
  skipIfNonTrading(callerLogger: Logger, jobName: string, date: Date = new Date()): boolean {
    const reason = this.getNonTradingReason(date);
    if (!reason) return false;
    callerLogger.log(
      `Skipping ${jobName} \u2014 non-trading day (${reason.reason}: ${reason.detail})`,
    );
    return true;
  }

  private toIsoDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
