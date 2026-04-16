'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Scale,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api';

interface HoldingZakat {
  symbol: string;
  name: string;
  quantity: number;
  current_price: number | null;
  current_value: number | null;
  shares_outstanding: number | null;
  zakatable_per_share: number | null;
  zakatable_value: number | null;
  zakat_due: number | null;
  has_financial_data: boolean;
  method: string;
  financial_period: string | null;
}

interface ZakatResult {
  nisab_threshold: number;
  total_portfolio_value: number;
  total_zakatable_value: number;
  total_zakat_due: number;
  is_above_nisab: boolean;
  holdings: HoldingZakat[];
  holdings_without_data: string[];
  calculation_method: string;
  nisab_note: string;
}

function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null) return '—';
  return n.toLocaleString('en-LK', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function NisabInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
        Nisab Threshold (LKR)
      </label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-48 px-3 py-2 rounded-lg bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
          min={0}
          step={1000}
        />
        <span className="text-xs text-muted-foreground/70">≈ 85g gold</span>
      </div>
      <p className="text-xs text-muted-foreground/70">
        Update daily to match current gold price. LKR 1,638,000 = gold at USD 2,000/oz × LKR 300.
      </p>
    </div>
  );
}

function SummaryCard({ result }: { result: ZakatResult }) {
  const aboveNisab = result.is_above_nisab;
  return (
    <div
      className={`rounded-xl border p-5 ${
        aboveNisab
          ? 'border-emerald-500/40 bg-emerald-500/5'
          : 'border-border bg-card'
      }`}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
            Total Zakat Due
          </p>
          <p
            className={`text-3xl font-bold font-mono ${
              aboveNisab ? 'text-emerald-400' : 'text-foreground'
            }`}
          >
            LKR {fmt(result.total_zakat_due)}
          </p>
          {!aboveNisab && result.total_zakatable_value > 0 && (
            <p className="text-xs text-muted-foreground/70 mt-1">
              Portfolio zakatable value ({fmt(result.total_zakatable_value)} LKR) is
              below Nisab threshold ({fmt(result.nisab_threshold)} LKR). Zakat not
              yet obligatory on these holdings.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-right">
          <div>
            <p className="text-xs text-muted-foreground/70">Portfolio Value</p>
            <p className="text-sm font-mono font-semibold text-foreground">
              LKR {fmt(result.total_portfolio_value)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground/70">Zakatable Value</p>
            <p className="text-sm font-mono font-semibold text-foreground">
              LKR {fmt(result.total_zakatable_value)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground/70">Nisab Threshold</p>
            <p className="text-sm font-mono font-semibold text-foreground">
              LKR {fmt(result.nisab_threshold)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground/70">Zakat Rate</p>
            <p className="text-sm font-mono font-semibold text-foreground">
              2.5%
            </p>
          </div>
        </div>
      </div>

      {aboveNisab && (
        <div className="mt-4 flex items-center gap-2 text-emerald-400 text-xs">
          <CheckCircle2 size={14} />
          <span>
            Zakatable value exceeds Nisab — Zakat is obligatory on these holdings.
          </span>
        </div>
      )}

      {result.holdings_without_data.length > 0 && (
        <div className="mt-3 flex items-start gap-2 text-amber-400/80 text-xs">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span>
            Financial data not available for{' '}
            <span className="font-semibold">
              {result.holdings_without_data.join(', ')}
            </span>
            . Import quarterly financials via{' '}
            <a href="/admin/financials" className="underline hover:text-amber-300">
              Admin → Financials
            </a>{' '}
            to include these in the calculation.
          </span>
        </div>
      )}
    </div>
  );
}

function HoldingRow({ h }: { h: HoldingZakat }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr
        className="border-b border-border hover:bg-muted/50 cursor-pointer transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-foreground">
              {h.symbol}
            </span>
            {h.has_financial_data ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-medium">
                AAOIFI
              </span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-medium">
                NO DATA
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground/70 mt-0.5">{h.name}</p>
        </td>
        <td className="px-4 py-3 text-right font-mono text-sm text-foreground">
          {h.quantity.toLocaleString()}
        </td>
        <td className="px-4 py-3 text-right font-mono text-sm text-foreground">
          {h.current_value != null ? `LKR ${fmt(h.current_value)}` : '—'}
        </td>
        <td className="px-4 py-3 text-right font-mono text-sm text-muted-foreground">
          {h.zakatable_value != null ? `LKR ${fmt(h.zakatable_value)}` : '—'}
        </td>
        <td className="px-4 py-3 text-right">
          <span
            className={`font-mono text-sm font-semibold ${
              h.zakat_due != null
                ? 'text-emerald-400'
                : 'text-muted-foreground/70'
            }`}
          >
            {h.zakat_due != null ? `LKR ${fmt(h.zakat_due)}` : '—'}
          </span>
        </td>
        <td className="px-4 py-3 text-center text-muted-foreground/70">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </td>
      </tr>

      {expanded && (
        <tr className="bg-muted/30">
          <td colSpan={6} className="px-6 py-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div>
                <p className="text-muted-foreground/70 mb-0.5">Zakatable / Share</p>
                <p className="font-mono text-foreground">
                  {h.zakatable_per_share != null
                    ? `LKR ${fmt(h.zakatable_per_share, 4)}`
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground/70 mb-0.5">Shares Outstanding</p>
                <p className="font-mono text-foreground">
                  {h.shares_outstanding != null
                    ? Number(h.shares_outstanding).toLocaleString()
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground/70 mb-0.5">Financial Period</p>
                <p className="font-mono text-foreground">
                  {h.financial_period ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground/70 mb-0.5">Method</p>
                <p className="font-mono text-foreground">
                  {h.method === 'AAOIFI_BALANCE_SHEET'
                    ? 'AAOIFI (cash + receivables + prepayments) / shares'
                    : 'No financial data — import via Admin'}
                </p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function MethodExplainer() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <div className="flex items-center gap-2">
          <Info size={14} />
          <span>How is Zakat calculated? (AAOIFI method)</span>
        </div>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div className="px-5 pb-5 text-xs text-muted-foreground space-y-3 border-t border-border pt-4">
          <p>
            This calculator uses the{' '}
            <strong className="text-foreground">
              AAOIFI (Accounting and Auditing Organisation for Islamic Financial
              Institutions)
            </strong>{' '}
            standard for Zakat on listed stocks.
          </p>

          <div>
            <p className="font-semibold text-foreground mb-1">Formula</p>
            <div className="font-mono bg-muted rounded p-3 space-y-1">
              <p>Zakatable assets per share =</p>
              <p className="pl-4">
                (Cash + Receivables + Prepayments) ÷ Shares Outstanding
              </p>
              <p className="mt-2">Zakat due per holding =</p>
              <p className="pl-4">Zakatable per share × Your shares × 2.5%</p>
            </div>
          </div>

          <div>
            <p className="font-semibold text-foreground mb-1">
              Why these fields?
            </p>
            <ul className="space-y-1 list-disc list-inside">
              <li>
                <strong>Cash & equivalents</strong> — directly zakatable (like cash
                in hand)
              </li>
              <li>
                <strong>Receivables</strong> — money owed that the company expects to
                collect
              </li>
              <li>
                <strong>Prepayments</strong> — advance payments for future expenses
                (zakatable as current assets)
              </li>
              <li>
                <strong>Fixed assets / investments</strong> — NOT zakatable (they
                generate income, not held for trade)
              </li>
            </ul>
          </div>

          <div>
            <p className="font-semibold text-foreground mb-1">Nisab</p>
            <p>
              Nisab is the minimum threshold for Zakat obligation — equal to the
              value of 85 grams of gold. If your total zakatable value is below
              Nisab, Zakat is not yet obligatory. Update the Nisab field daily to
              reflect the current gold price.
            </p>
          </div>

          <div>
            <p className="font-semibold text-foreground mb-1">
              Data requirement
            </p>
            <p>
              This calculator requires quarterly financial data (balance sheet) for
              each stock. Import data via{' '}
              <a href="/admin/financials" className="underline hover:text-primary">
                Admin → Financials
              </a>
              . Without data, the holding is listed but excluded from the
              calculation.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ZakatPage() {
  const [nisab, setNisab] = useState('1638000');
  const [result, setResult] = useState<ZakatResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchZakat = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/zakat/calculate?nisab=${nisab}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResult(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load Zakat data');
    } finally {
      setLoading(false);
    }
  }, [nisab]);

  // Load on mount with default nisab
  useEffect(() => {
    fetchZakat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Scale size={20} className="text-primary" />
            <h1 className="text-xl font-bold text-foreground">
              Zakat Calculator
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            AAOIFI-standard Zakat calculation on your Shariah-compliant stock
            holdings.
          </p>
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          <NisabInput value={nisab} onChange={setNisab} />
          <button
            onClick={fetchZakat}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Calculating...' : 'Recalculate'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl border border-red-500/40 bg-red-500/5 text-red-400 text-sm">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Summary */}
      {result && !loading && <SummaryCard result={result} />}

      {/* Holdings Table */}
      {result && !loading && result.holdings.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">
              Holdings Breakdown
            </h2>
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              Click any row to expand calculation details.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground/70 uppercase tracking-wide">
                    Stock
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground/70 uppercase tracking-wide">
                    Qty
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground/70 uppercase tracking-wide">
                    Current Value
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground/70 uppercase tracking-wide">
                    Zakatable Value
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground/70 uppercase tracking-wide">
                    Zakat Due
                  </th>
                  <th className="px-4 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {result.holdings.map((h) => (
                  <HoldingRow key={h.symbol} h={h} />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/30">
                  <td
                    colSpan={3}
                    className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    Total
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-foreground">
                    LKR {fmt(result.total_zakatable_value)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm font-bold text-emerald-400">
                    LKR {fmt(result.total_zakat_due)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {result && !loading && result.holdings.length === 0 && (
        <div className="text-center py-16 text-muted-foreground/70">
          <Scale size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No open holdings found.</p>
          <p className="text-xs mt-1">
            Add holdings in the{' '}
            <a href="/portfolio" className="underline hover:text-primary">
              Portfolio
            </a>{' '}
            page.
          </p>
        </div>
      )}

      {/* Method explainer */}
      <MethodExplainer />
    </div>
  );
}
