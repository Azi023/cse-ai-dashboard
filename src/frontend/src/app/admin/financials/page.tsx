'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  stocksApi,
  financialsApi,
  strategyEngineApi,
  type Stock,
  type CompanyFinancial,
  type FinancialsCoverage,
} from '@/lib/api';
import {
  FileSpreadsheet,
  Search,
  Save,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Database,
  TrendingUp,
  X,
  RefreshCw,
  Upload,
  Download,
} from 'lucide-react';
import { safeNum } from '@/lib/format';

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4', 'ANNUAL'] as const;

interface FormData {
  symbol: string;
  fiscal_year: string;
  quarter: string;
  // Income Statement
  total_revenue: string;
  interest_income: string;
  non_compliant_income: string;
  net_profit: string;
  earnings_per_share: string;
  // Balance Sheet
  total_assets: string;
  total_liabilities: string;
  shareholders_equity: string;
  interest_bearing_debt: string;
  interest_bearing_deposits: string;
  receivables: string;
  prepayments: string;
  cash_and_equivalents: string;
  // Ratios (optional, auto-calculated if left blank)
  pe_ratio: string;
  pb_ratio: string;
  debt_to_equity: string;
  return_on_equity: string;
  dividend_yield: string;
  // Metadata
  source: string;
  report_date: string;
}

const emptyForm: FormData = {
  symbol: '',
  fiscal_year: '',
  quarter: 'ANNUAL',
  total_revenue: '',
  interest_income: '',
  non_compliant_income: '',
  net_profit: '',
  earnings_per_share: '',
  total_assets: '',
  total_liabilities: '',
  shareholders_equity: '',
  interest_bearing_debt: '',
  interest_bearing_deposits: '',
  receivables: '',
  prepayments: '',
  cash_and_equivalents: '',
  pe_ratio: '',
  pb_ratio: '',
  debt_to_equity: '',
  return_on_equity: '',
  dividend_yield: '',
  source: 'MANUAL',
  report_date: '',
};

function toFormData(record: CompanyFinancial): FormData {
  return {
    symbol: record.symbol,
    fiscal_year: record.fiscal_year,
    quarter: record.quarter,
    total_revenue: record.total_revenue != null ? String(record.total_revenue) : '',
    interest_income: record.interest_income != null ? String(record.interest_income) : '',
    non_compliant_income: record.non_compliant_income != null ? String(record.non_compliant_income) : '',
    net_profit: record.net_profit != null ? String(record.net_profit) : '',
    earnings_per_share: record.earnings_per_share != null ? String(record.earnings_per_share) : '',
    total_assets: record.total_assets != null ? String(record.total_assets) : '',
    total_liabilities: record.total_liabilities != null ? String(record.total_liabilities) : '',
    shareholders_equity: record.shareholders_equity != null ? String(record.shareholders_equity) : '',
    interest_bearing_debt: record.interest_bearing_debt != null ? String(record.interest_bearing_debt) : '',
    interest_bearing_deposits: record.interest_bearing_deposits != null ? String(record.interest_bearing_deposits) : '',
    receivables: record.receivables != null ? String(record.receivables) : '',
    prepayments: record.prepayments != null ? String(record.prepayments) : '',
    cash_and_equivalents: record.cash_and_equivalents != null ? String(record.cash_and_equivalents) : '',
    pe_ratio: record.pe_ratio != null ? String(record.pe_ratio) : '',
    pb_ratio: record.pb_ratio != null ? String(record.pb_ratio) : '',
    debt_to_equity: record.debt_to_equity != null ? String(record.debt_to_equity) : '',
    return_on_equity: record.return_on_equity != null ? String(record.return_on_equity) : '',
    dividend_yield: record.dividend_yield != null ? String(record.dividend_yield) : '',
    source: record.source,
    report_date: record.report_date ? record.report_date.split('T')[0] : '',
  };
}

function parseNum(val: string): number | null {
  if (!val || val.trim() === '') return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

export default function AdminFinancialsPage() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [coverage, setCoverage] = useState<FinancialsCoverage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Symbol search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  // Form state
  const [form, setForm] = useState<FormData>({ ...emptyForm });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Existing records for selected symbol
  const [existingRecords, setExistingRecords] = useState<CompanyFinancial[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);

  // CSE Auto-Fetch
  const [fetchingCse, setFetchingCse] = useState(false);
  const [cseFetchResult, setCseFetchResult] = useState<{ total: number; fetched: number; failed: number } | null>(null);
  const [cseFetchError, setCseFetchError] = useState<string | null>(null);

  // Strategy Backtests
  const [runningBacktest, setRunningBacktest] = useState(false);

  // CSE Playwright Scraper
  const [scrapingCse, setScrapingCse] = useState(false);
  const [cseScrapeResult, setCseScrapeResult] = useState<{
    total: number;
    success: number;
    partial: number;
    failed: number;
    tier2TriggerStatus: string;
  } | null>(null);
  const [cseScrapeError, setCseScrapeError] = useState<string | null>(null);

  // CSV Import
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importingCsv, setImportingCsv] = useState(false);
  const [csvImportResult, setCsvImportResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);
  const [csvImportError, setCsvImportError] = useState<string | null>(null);

  const fetchInitialData = useCallback(async () => {
    try {
      const [stocksRes, coverageRes] = await Promise.allSettled([
        stocksApi.getAll(),
        financialsApi.getCoverage(),
      ]);

      if (stocksRes.status === 'fulfilled') setStocks(stocksRes.value.data);
      if (coverageRes.status === 'fulfilled') setCoverage(coverageRes.value.data);
    } catch (err) {
      setError('Failed to load initial data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // Filter stocks for the search dropdown
  const filteredStocks = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toUpperCase();
    return stocks
      .filter(
        (s) =>
          s.symbol.toUpperCase().includes(q) ||
          s.name.toUpperCase().includes(q),
      )
      .slice(0, 15);
  }, [searchQuery, stocks]);

  // Load existing records for a symbol
  const loadSymbolRecords = useCallback(async (symbol: string) => {
    setLoadingRecords(true);
    try {
      const res = await financialsApi.getBySymbol(symbol);
      setExistingRecords(res.data);
    } catch {
      setExistingRecords([]);
    } finally {
      setLoadingRecords(false);
    }
  }, []);

  const handleSelectSymbol = (symbol: string) => {
    setSelectedSymbol(symbol);
    setSearchQuery(symbol);
    setShowDropdown(false);
    setForm({ ...emptyForm, symbol });
    setEditingId(null);
    setSuccessMessage(null);
    setFormError(null);
    loadSymbolRecords(symbol);
  };

  const handleEditRecord = (record: CompanyFinancial) => {
    setForm(toFormData(record));
    setEditingId(record.id);
    setSuccessMessage(null);
    setFormError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNewRecord = () => {
    if (selectedSymbol) {
      setForm({ ...emptyForm, symbol: selectedSymbol });
      setEditingId(null);
      setSuccessMessage(null);
      setFormError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    if (!form.symbol || !form.fiscal_year || !form.quarter) {
      setFormError('Symbol, fiscal year, and quarter are required');
      return;
    }

    setSubmitting(true);

    const payload = {
      symbol: form.symbol,
      fiscal_year: form.fiscal_year,
      quarter: form.quarter,
      total_revenue: parseNum(form.total_revenue),
      interest_income: parseNum(form.interest_income),
      non_compliant_income: parseNum(form.non_compliant_income),
      net_profit: parseNum(form.net_profit),
      earnings_per_share: parseNum(form.earnings_per_share),
      total_assets: parseNum(form.total_assets),
      total_liabilities: parseNum(form.total_liabilities),
      shareholders_equity: parseNum(form.shareholders_equity),
      interest_bearing_debt: parseNum(form.interest_bearing_debt),
      interest_bearing_deposits: parseNum(form.interest_bearing_deposits),
      receivables: parseNum(form.receivables),
      prepayments: parseNum(form.prepayments),
      cash_and_equivalents: parseNum(form.cash_and_equivalents),
      pe_ratio: parseNum(form.pe_ratio),
      pb_ratio: parseNum(form.pb_ratio),
      debt_to_equity: parseNum(form.debt_to_equity),
      return_on_equity: parseNum(form.return_on_equity),
      dividend_yield: parseNum(form.dividend_yield),
      source: form.source || 'MANUAL',
      report_date: form.report_date || null,
    };

    try {
      if (editingId != null) {
        const res = await financialsApi.update(editingId, payload);
        setSuccessMessage(
          `Updated financial record for ${res.data.symbol} ${res.data.fiscal_year} ${res.data.quarter}`,
        );
      } else {
        const res = await financialsApi.create(payload);
        setSuccessMessage(
          `Created financial record for ${res.data.symbol} ${res.data.fiscal_year} ${res.data.quarter}`,
        );
      }

      // Refresh records and coverage
      if (selectedSymbol) loadSymbolRecords(selectedSymbol);
      financialsApi.getCoverage().then((r) => setCoverage(r.data)).catch(() => {});
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response
              ?.data?.message ?? 'Failed to save'
          : 'Failed to save';
      setFormError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setSubmitting(false);
    }
  };

  const updateField = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleFetchCse = async () => {
    setFetchingCse(true);
    setCseFetchResult(null);
    setCseFetchError(null);
    try {
      const res = await financialsApi.fetchFromCse();
      setCseFetchResult(res.data);
      financialsApi.getCoverage().then((r) => setCoverage(r.data)).catch(() => {});
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Fetch failed'
        : 'Fetch failed';
      setCseFetchError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setFetchingCse(false);
    }
  };

  const runBacktests = async () => {
    setRunningBacktest(true);
    try {
      await strategyEngineApi.runBacktests();
    } catch { /* silent */ } finally {
      setRunningBacktest(false);
    }
  };

  const handleScrapeCse = async () => {
    setScrapingCse(true);
    setCseScrapeResult(null);
    setCseScrapeError(null);
    try {
      const res = await financialsApi.scrapeCse();
      setCseScrapeResult(res.data);
      financialsApi.getCoverage().then((r) => setCoverage(r.data)).catch(() => {});
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Scrape failed'
        : 'Scrape failed';
      setCseScrapeError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setScrapingCse(false);
    }
  };

  const handleCsvImport = async () => {
    if (!csvFile) return;
    setImportingCsv(true);
    setCsvImportResult(null);
    setCsvImportError(null);
    try {
      const res = await financialsApi.importCsv(csvFile);
      setCsvImportResult(res.data);
      financialsApi.getCoverage().then((r) => setCoverage(r.data)).catch(() => {});
      setCsvFile(null);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Import failed'
        : 'Import failed';
      setCsvImportError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setImportingCsv(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <FileSpreadsheet className="h-6 w-6" />
              Company Financials
            </h2>
            <p className="text-muted-foreground">
              Enter and manage financial data for 272 CSE-listed stocks — Shariah screening and
              fundamental analysis
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={runBacktests} disabled={runningBacktest}>
            <RefreshCw className={`w-4 h-4 mr-1 ${runningBacktest ? 'animate-spin' : ''}`} />
            Run Backtests
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <p className="text-sm text-destructive">{error}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Unable to load data. Please try again later.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Coverage Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Stocks</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">
                {coverage?.total_stocks ?? 0}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              With Financial Data
            </CardTitle>
            <FileSpreadsheet className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-green-500">
                {coverage?.stocks_with_financials ?? 0}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Data Coverage
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-blue-500">
                {safeNum(coverage?.coverage_percent).toFixed(1)}%
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Section A: CSE Auto-Fetch */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Auto-Fetch from CSE API
            </CardTitle>
            <Button onClick={handleFetchCse} disabled={fetchingCse} size="sm" className="gap-1.5">
              {fetchingCse ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {fetchingCse ? 'Fetching...' : 'Fetch All'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Fetches market cap, 52-week high/low, last price, and beta for all Shariah-compliant stocks from the CSE API. Updates stock data and creates financial records where missing.
          </p>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">
              Compliant stocks: <span className="font-medium text-foreground">{coverage?.stocks_with_financials ?? '—'}/{coverage?.total_stocks ?? '—'} with data</span>
            </span>
          </div>
          {cseFetchResult && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-3 text-sm text-green-500">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Fetched {cseFetchResult.fetched} of {cseFetchResult.total} stocks
              {cseFetchResult.failed > 0 && ` (${cseFetchResult.failed} failed)`}
            </div>
          )}
          {cseFetchError && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {cseFetchError}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section B: CSE Website Playwright Scraper */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4" />
              Scrape CSE Fundamentals
            </CardTitle>
            <Button
              onClick={handleScrapeCse}
              disabled={scrapingCse}
              size="sm"
              className="gap-1.5"
            >
              {scrapingCse ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {scrapingCse ? 'Scraping... (may take several minutes)' : 'Scrape CSE Fundamentals'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Launches a headless browser to visit each company&apos;s CSE profile page, opens the{' '}
            <strong>Financials → Fundamental Data</strong> tab, and extracts all TradingView widget
            metrics (valuation, income, balance sheet, cash flow, profitability, dividends) for the{' '}
            <strong>up to 272 CSE-listed stocks</strong> (full market coverage).
            Screenshots and JSON are saved to <code className="text-xs bg-muted px-1 rounded">data/cse-fundamentals/</code>,
            records are upserted into the DB, and Tier 2 Shariah screening is triggered automatically.
          </p>
          {cseScrapeResult && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-3 text-sm text-green-500">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>
                  Scraped {cseScrapeResult.total} stocks — {cseScrapeResult.success} success,{' '}
                  {cseScrapeResult.partial} partial, {cseScrapeResult.failed} failed.{' '}
                  Tier 2 screening: {cseScrapeResult.tier2TriggerStatus}
                </span>
              </div>
            </div>
          )}
          {cseScrapeError && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {cseScrapeError}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section C: CSV Bulk Import */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4" />
            CSV Bulk Import
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Upload a CSV with columns: <code className="text-xs bg-muted px-1 rounded">symbol, period, revenue, net_income, total_assets, total_liabilities, total_equity, eps, interest_bearing_debt</code>
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
              />
              <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm hover:bg-muted/50 transition-colors cursor-pointer">
                <Upload className="h-4 w-4 text-muted-foreground" />
                {csvFile ? csvFile.name : 'Choose File'}
              </div>
            </label>
            <Button
              onClick={handleCsvImport}
              disabled={!csvFile || importingCsv}
              size="sm"
              className="gap-1.5"
            >
              {importingCsv ? 'Importing...' : 'Upload & Import'}
            </Button>
            <a
              href="/api/financials/template-csv"
              download="financials-template.csv"
              onClick={(e) => {
                e.preventDefault();
                fetch(`${process.env.NEXT_PUBLIC_API_URL || '/api'}/financials/template-csv`)
                  .then((r) => r.blob())
                  .then((blob) => {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'financials-template.csv';
                    a.click();
                    URL.revokeObjectURL(url);
                  })
                  .catch(() => {});
              }}
              className="flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <Download className="h-4 w-4" />
              CSV Template
            </a>
          </div>
          {csvImportResult && (
            <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-3 text-sm text-green-500">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>
                Imported {csvImportResult.imported} records
                {csvImportResult.skipped > 0 && `, ${csvImportResult.skipped} skipped`}
                {csvImportResult.errors.length > 0 && (
                  <ul className="mt-1 text-destructive text-xs list-disc ml-4">
                    {csvImportResult.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                )}
              </span>
            </div>
          )}
          {csvImportError && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {csvImportError}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Symbol Search */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" />
            Select Stock Symbol
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative max-w-md">
            <Input
              placeholder="Search by symbol or company name..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
            />
            {selectedSymbol && (
              <button
                onClick={() => {
                  setSelectedSymbol(null);
                  setSearchQuery('');
                  setForm({ ...emptyForm });
                  setEditingId(null);
                  setExistingRecords([]);
                  setSuccessMessage(null);
                  setFormError(null);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}

            {/* Dropdown */}
            {showDropdown && filteredStocks.length > 0 && !selectedSymbol && (
              <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border bg-popover text-popover-foreground shadow-lg">
                {filteredStocks.map((stock) => {
                  const hasData = coverage?.symbols_with_data.includes(
                    stock.symbol,
                  );
                  return (
                    <button
                      key={stock.symbol}
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                      onClick={() => handleSelectSymbol(stock.symbol)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{stock.symbol}</span>
                        <span className="text-muted-foreground truncate max-w-[200px]">
                          {stock.name}
                        </span>
                      </div>
                      {hasData && (
                        <Badge
                          variant="outline"
                          className="border-green-500 text-green-500 text-xs"
                        >
                          Has Data
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selectedSymbol && (
            <div className="mt-3 flex items-center gap-2">
              <Badge className="bg-primary/10 text-primary border-primary/30">
                {selectedSymbol}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {stocks.find((s) => s.symbol === selectedSymbol)?.name ?? ''}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Financial Data Entry Form */}
      {selectedSymbol && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {editingId != null
                  ? `Edit Financial Record - ${form.fiscal_year} ${form.quarter}`
                  : 'New Financial Record'}
              </CardTitle>
              {editingId != null && (
                <Button variant="outline" size="sm" onClick={handleNewRecord}>
                  New Record
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Metadata Row */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Metadata
                </h3>
                <div className="grid gap-4 md:grid-cols-4">
                  <div>
                    <label className="text-xs text-muted-foreground">
                      Fiscal Year *
                    </label>
                    <Input
                      placeholder="e.g. 2024/25"
                      value={form.fiscal_year}
                      onChange={(e) => updateField('fiscal_year', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">
                      Quarter *
                    </label>
                    <select
                      value={form.quarter}
                      onChange={(e) => updateField('quarter', e.target.value)}
                      className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                    >
                      {QUARTERS.map((q) => (
                        <option key={q} value={q}>
                          {q}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">
                      Source
                    </label>
                    <select
                      value={form.source}
                      onChange={(e) => updateField('source', e.target.value)}
                      className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                    >
                      <option value="MANUAL">Manual Entry</option>
                      <option value="CSE_ANNUAL_REPORT">CSE Annual Report</option>
                      <option value="PARSED">Parsed</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">
                      Report Date
                    </label>
                    <Input
                      type="date"
                      value={form.report_date}
                      onChange={(e) => updateField('report_date', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Income Statement */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Income Statement
                </h3>
                <div className="grid gap-4 md:grid-cols-5">
                  <FinancialField
                    label="Total Revenue"
                    value={form.total_revenue}
                    onChange={(v) => updateField('total_revenue', v)}
                    unit="LKR"
                  />
                  <FinancialField
                    label="Interest Income"
                    value={form.interest_income}
                    onChange={(v) => updateField('interest_income', v)}
                    unit="LKR"
                  />
                  <FinancialField
                    label="Non-Compliant Income"
                    value={form.non_compliant_income}
                    onChange={(v) => updateField('non_compliant_income', v)}
                    unit="LKR"
                  />
                  <FinancialField
                    label="Net Profit"
                    value={form.net_profit}
                    onChange={(v) => updateField('net_profit', v)}
                    unit="LKR"
                  />
                  <FinancialField
                    label="Earnings Per Share"
                    value={form.earnings_per_share}
                    onChange={(v) => updateField('earnings_per_share', v)}
                    unit="LKR"
                    step="0.01"
                  />
                </div>
              </div>

              {/* Balance Sheet */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Balance Sheet
                </h3>
                <div className="grid gap-4 md:grid-cols-4">
                  <FinancialField
                    label="Total Assets"
                    value={form.total_assets}
                    onChange={(v) => updateField('total_assets', v)}
                    unit="LKR"
                  />
                  <FinancialField
                    label="Total Liabilities"
                    value={form.total_liabilities}
                    onChange={(v) => updateField('total_liabilities', v)}
                    unit="LKR"
                  />
                  <FinancialField
                    label="Shareholders Equity"
                    value={form.shareholders_equity}
                    onChange={(v) => updateField('shareholders_equity', v)}
                    unit="LKR"
                  />
                  <FinancialField
                    label="Interest Bearing Debt"
                    value={form.interest_bearing_debt}
                    onChange={(v) => updateField('interest_bearing_debt', v)}
                    unit="LKR"
                  />
                  <FinancialField
                    label="Interest Bearing Deposits"
                    value={form.interest_bearing_deposits}
                    onChange={(v) => updateField('interest_bearing_deposits', v)}
                    unit="LKR"
                  />
                  <FinancialField
                    label="Receivables"
                    value={form.receivables}
                    onChange={(v) => updateField('receivables', v)}
                    unit="LKR"
                  />
                  <FinancialField
                    label="Prepayments"
                    value={form.prepayments}
                    onChange={(v) => updateField('prepayments', v)}
                    unit="LKR"
                  />
                  <FinancialField
                    label="Cash & Equivalents"
                    value={form.cash_and_equivalents}
                    onChange={(v) => updateField('cash_and_equivalents', v)}
                    unit="LKR"
                  />
                </div>
              </div>

              {/* Valuation Ratios */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Valuation Ratios
                  <span className="text-xs font-normal ml-2">
                    (leave blank to auto-calculate)
                  </span>
                </h3>
                <div className="grid gap-4 md:grid-cols-5">
                  <FinancialField
                    label="P/E Ratio"
                    value={form.pe_ratio}
                    onChange={(v) => updateField('pe_ratio', v)}
                    step="0.01"
                  />
                  <FinancialField
                    label="P/B Ratio"
                    value={form.pb_ratio}
                    onChange={(v) => updateField('pb_ratio', v)}
                    step="0.01"
                  />
                  <FinancialField
                    label="Debt/Equity"
                    value={form.debt_to_equity}
                    onChange={(v) => updateField('debt_to_equity', v)}
                    step="0.01"
                  />
                  <FinancialField
                    label="Return on Equity"
                    value={form.return_on_equity}
                    onChange={(v) => updateField('return_on_equity', v)}
                    step="0.0001"
                  />
                  <FinancialField
                    label="Dividend Yield"
                    value={form.dividend_yield}
                    onChange={(v) => updateField('dividend_yield', v)}
                    step="0.0001"
                  />
                </div>
              </div>

              {/* Submit */}
              <div className="flex items-center gap-3 pt-2">
                <Button type="submit" disabled={submitting} className="gap-1.5">
                  <Save className="h-4 w-4" />
                  {submitting
                    ? 'Saving...'
                    : editingId != null
                      ? 'Update Record'
                      : 'Save Record'}
                </Button>
                {editingId != null && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleNewRecord}
                  >
                    Cancel Edit
                  </Button>
                )}
              </div>

              {/* Messages */}
              {successMessage && (
                <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-3 text-sm text-green-500">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {successMessage}
                </div>
              )}
              {formError && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {formError}
                </div>
              )}
            </form>
          </CardContent>
        </Card>
      )}

      {/* Existing Records for Selected Symbol */}
      {selectedSymbol && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Existing Records for {selectedSymbol} ({existingRecords.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingRecords ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : existingRecords.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No financial records yet for {selectedSymbol}. Use the form
                above to add data.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Year</TableHead>
                      <TableHead>Quarter</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Net Profit</TableHead>
                      <TableHead className="text-right">EPS</TableHead>
                      <TableHead className="text-right">Total Assets</TableHead>
                      <TableHead className="text-right">P/E</TableHead>
                      <TableHead className="text-right">D/E</TableHead>
                      <TableHead className="text-right">ROE</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {existingRecords.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">
                          {record.fiscal_year}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {record.quarter}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatNum(record.total_revenue)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={
                              record.net_profit != null
                                ? Number(record.net_profit) >= 0
                                  ? 'text-green-500'
                                  : 'text-red-500'
                                : ''
                            }
                          >
                            {formatNum(record.net_profit)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {record.earnings_per_share != null
                            ? Number(record.earnings_per_share).toFixed(2)
                            : '--'}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatNum(record.total_assets)}
                        </TableCell>
                        <TableCell className="text-right">
                          {record.pe_ratio != null
                            ? Number(record.pe_ratio).toFixed(2)
                            : '--'}
                        </TableCell>
                        <TableCell className="text-right">
                          {record.debt_to_equity != null
                            ? Number(record.debt_to_equity).toFixed(2)
                            : '--'}
                        </TableCell>
                        <TableCell className="text-right">
                          {record.return_on_equity != null
                            ? (Number(record.return_on_equity) * 100).toFixed(1) + '%'
                            : '--'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className="text-xs text-muted-foreground"
                          >
                            {record.source}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditRecord(record)}
                          >
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Coverage Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Financial Data Coverage
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : (
            <CoverageTable
              stocks={stocks}
              symbolsWithData={coverage?.symbols_with_data ?? []}
              onSelectSymbol={handleSelectSymbol}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Sub-components ----------

function FinancialField({
  label,
  value,
  onChange,
  unit,
  step = '0.01',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  unit?: string;
  step?: string;
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">
        {label}
        {unit && (
          <span className="text-[10px] ml-1 opacity-60">({unit})</span>
        )}
      </label>
      <Input
        type="number"
        step={step}
        placeholder="--"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function formatNum(value: number | null): string {
  if (value == null) return '--';
  const num = safeNum(value);
  if (Math.abs(num) >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(2) + 'B';
  }
  if (Math.abs(num) >= 1_000_000) {
    return (num / 1_000_000).toFixed(2) + 'M';
  }
  if (Math.abs(num) >= 1_000) {
    return (num / 1_000).toFixed(1) + 'K';
  }
  return num.toFixed(2);
}

function CoverageTable({
  stocks,
  symbolsWithData,
  onSelectSymbol,
}: {
  stocks: Stock[];
  symbolsWithData: string[];
  onSelectSymbol: (symbol: string) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'with_data' | 'missing'>('all');
  const [search, setSearch] = useState('');

  const dataSet = new Set(symbolsWithData);

  const filtered = useMemo(() => {
    let list = stocks.filter((s) => s.is_active);

    if (filter === 'with_data') {
      list = list.filter((s) => dataSet.has(s.symbol));
    } else if (filter === 'missing') {
      list = list.filter((s) => !dataSet.has(s.symbol));
    }

    if (search.trim()) {
      const q = search.toUpperCase();
      list = list.filter(
        (s) =>
          s.symbol.toUpperCase().includes(q) ||
          s.name.toUpperCase().includes(q),
      );
    }

    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stocks, filter, search, symbolsWithData]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Input
          placeholder="Filter stocks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <div className="flex gap-1">
          {(['all', 'with_data', 'missing'] as const).map((f) => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(f)}
            >
              {f === 'all'
                ? 'All'
                : f === 'with_data'
                  ? 'With Data'
                  : 'Missing'}
            </Button>
          ))}
        </div>
        <span className="text-sm text-muted-foreground ml-auto">
          {filtered.length} stocks
        </span>
      </div>

      <div className="max-h-96 overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Sector</TableHead>
              <TableHead>Shariah</TableHead>
              <TableHead className="text-center">Financial Data</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.slice(0, 50).map((stock) => {
              const hasData = dataSet.has(stock.symbol);
              return (
                <TableRow key={stock.symbol}>
                  <TableCell className="font-medium">{stock.symbol}</TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {stock.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {stock.sector ?? '--'}
                  </TableCell>
                  <TableCell>
                    <ShariahBadge status={stock.shariah_status} />
                  </TableCell>
                  <TableCell className="text-center">
                    {hasData ? (
                      <Badge
                        variant="outline"
                        className="border-green-500 text-green-500 text-xs"
                      >
                        Available
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-yellow-500 text-yellow-500 text-xs"
                      >
                        Missing
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onSelectSymbol(stock.symbol)}
                    >
                      {hasData ? 'View/Edit' : 'Add Data'}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {filtered.length > 50 && (
          <p className="text-xs text-muted-foreground text-center py-2">
            Showing first 50 of {filtered.length} stocks. Use the search to
            narrow down.
          </p>
        )}
      </div>
    </div>
  );
}

function ShariahBadge({ status }: { status: string }) {
  switch (status) {
    case 'compliant':
      return (
        <Badge
          variant="outline"
          className="border-green-500 text-green-500 text-xs"
        >
          Compliant
        </Badge>
      );
    case 'non_compliant':
    case 'blacklisted':
      return (
        <Badge
          variant="outline"
          className="border-red-500 text-red-500 text-xs"
        >
          Non-Compliant
        </Badge>
      );
    default:
      return (
        <Badge
          variant="outline"
          className="border-yellow-500 text-yellow-500 text-xs"
        >
          Pending
        </Badge>
      );
  }
}
