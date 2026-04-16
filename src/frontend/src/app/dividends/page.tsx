'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  dividendsApi,
  type DividendRecord,
  type PortfolioDividendIncome,
} from '@/lib/api';
import { CalendarDays, DollarSign, Plus, Trash2 } from 'lucide-react';
import { safeNum } from '@/lib/format';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--';
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export default function DividendsPage() {
  const [upcoming, setUpcoming] = useState<DividendRecord[]>([]);
  const [portfolioIncome, setPortfolioIncome] = useState<PortfolioDividendIncome | null>(null);
  const [searchSymbol, setSearchSymbol] = useState('');
  const [symbolDividends, setSymbolDividends] = useState<DividendRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form state
  const [formSymbol, setFormSymbol] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formExDate, setFormExDate] = useState('');
  const [formDeclDate, setFormDeclDate] = useState('');
  const [formPayDate, setFormPayDate] = useState('');
  const [formType, setFormType] = useState('cash');
  const [formYear, setFormYear] = useState('');

  useEffect(() => {
    Promise.allSettled([
      dividendsApi.getUpcoming(),
      dividendsApi.getPortfolioIncome(),
    ]).then(([upRes, incRes]) => {
      if (upRes.status === 'fulfilled') setUpcoming(upRes.value.data);
      if (incRes.status === 'fulfilled') setPortfolioIncome(incRes.value.data);
      setLoading(false);
    });
  }, []);

  const handleSearch = async () => {
    if (!searchSymbol.trim()) return;
    try {
      const res = await dividendsApi.getBySymbol(searchSymbol.trim());
      setSymbolDividends(res.data);
    } catch {
      setSymbolDividends([]);
    }
  };

  const handleAdd = async () => {
    if (!formSymbol || !formAmount || !formExDate) return;
    try {
      await dividendsApi.add({
        symbol: formSymbol,
        amount_per_share: parseFloat(formAmount),
        ex_date: formExDate,
        declaration_date: formDeclDate || undefined,
        payment_date: formPayDate || undefined,
        type: formType,
        fiscal_year: formYear || undefined,
      });
      // Reset and refresh
      setFormSymbol('');
      setFormAmount('');
      setFormExDate('');
      setFormDeclDate('');
      setFormPayDate('');
      setFormType('cash');
      setFormYear('');
      setShowAddForm(false);
      // Refresh upcoming
      const res = await dividendsApi.getUpcoming();
      setUpcoming(res.data);
    } catch {
      // silent
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await dividendsApi.delete(id);
      setSymbolDividends((prev) => prev.filter((d) => d.id !== id));
      setUpcoming((prev) => prev.filter((d) => d.id !== id));
    } catch {
      // silent
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dividend Tracker</h2>
          <p className="text-muted-foreground">
            Dividend history, upcoming ex-dates & portfolio income
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Dividend
        </button>
      </div>

      {/* Add Dividend Form */}
      {showAddForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Add Dividend Record</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <input
                type="text"
                placeholder="Symbol *"
                value={formSymbol}
                onChange={(e) => setFormSymbol(e.target.value)}
                className="rounded-md border bg-background px-3 py-2 text-sm"
              />
              <input
                type="number"
                placeholder="Amount/share *"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                step="0.01"
                className="rounded-md border bg-background px-3 py-2 text-sm"
              />
              <div>
                <label className="text-xs text-muted-foreground">Ex-Date *</label>
                <input
                  type="date"
                  value={formExDate}
                  onChange={(e) => setFormExDate(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Declaration Date</label>
                <input
                  type="date"
                  value={formDeclDate}
                  onChange={(e) => setFormDeclDate(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Payment Date</label>
                <input
                  type="date"
                  value={formPayDate}
                  onChange={(e) => setFormPayDate(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                className="rounded-md border bg-background px-3 py-2 text-sm"
                aria-label="Dividend type"
              >
                <option value="cash">Cash</option>
                <option value="stock">Stock</option>
                <option value="special">Special</option>
              </select>
              <input
                type="text"
                placeholder="Fiscal Year"
                value={formYear}
                onChange={(e) => setFormYear(e.target.value)}
                className="rounded-md border bg-background px-3 py-2 text-sm"
              />
              <button
                onClick={handleAdd}
                disabled={!formSymbol || !formAmount || !formExDate}
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                Save
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="upcoming" className="space-y-4">
        <TabsList>
          <TabsTrigger value="upcoming" className="gap-1">
            <CalendarDays className="h-3 w-3" /> Upcoming
          </TabsTrigger>
          <TabsTrigger value="portfolio" className="gap-1">
            <DollarSign className="h-3 w-3" /> Portfolio Income
          </TabsTrigger>
          <TabsTrigger value="search">History Search</TabsTrigger>
        </TabsList>

        {/* Upcoming Ex-Dates */}
        <TabsContent value="upcoming">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Upcoming Ex-Dividend Dates</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-12 rounded bg-muted/30 animate-pulse" />
                  ))}
                </div>
              ) : upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No upcoming ex-dividend dates. Add dividend records to track them.
                </p>
              ) : (
                <div className="space-y-2">
                  {upcoming.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-center border rounded-lg p-2 min-w-[60px]">
                          <div className="text-xs text-muted-foreground">
                            {new Date(d.ex_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
                          </div>
                          <div className="text-lg font-bold">
                            {new Date(d.ex_date + 'T00:00:00').getDate()}
                          </div>
                        </div>
                        <div>
                          <span className="font-medium text-sm">{d.symbol}</span>
                          <div className="text-xs text-muted-foreground">
                            LKR {Number(d.amount_per_share).toFixed(2)} per share
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {d.type}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Portfolio Income */}
        <TabsContent value="portfolio">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Portfolio Dividend Income</CardTitle>
                {portfolioIncome && (
                  <Badge variant="outline" className="text-sm">
                    Total: LKR {safeNum(portfolioIncome.total_portfolio_income).toLocaleString()}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-24 rounded bg-muted/30 animate-pulse" />
              ) : !portfolioIncome || portfolioIncome.holdings.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No dividend income recorded for portfolio holdings.
                </p>
              ) : (
                <div className="space-y-3">
                  {portfolioIncome.holdings.map((h) => (
                    <div key={h.symbol} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm">{h.symbol}</span>
                        <span className="text-sm font-medium text-green-500">
                          LKR {safeNum(h.total_income).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {h.quantity} shares &middot; {h.dividends.length} dividend payment{h.dividends.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Search */}
        <TabsContent value="search">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Dividend History Search</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchSymbol}
                  onChange={(e) => setSearchSymbol(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Enter stock symbol..."
                  className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                />
                <button
                  onClick={handleSearch}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Search
                </button>
              </div>

              {symbolDividends.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Ex-Date</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Amount</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Type</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Payment</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Year</th>
                        <th className="px-3 py-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {symbolDividends.map((d) => (
                        <tr key={d.id} className="border-t hover:bg-muted/20">
                          <td className="px-3 py-2">{formatDate(d.ex_date)}</td>
                          <td className="px-3 py-2">LKR {Number(d.amount_per_share).toFixed(2)}</td>
                          <td className="px-3 py-2">
                            <Badge variant="secondary" className="text-xs">{d.type}</Badge>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{formatDate(d.payment_date)}</td>
                          <td className="px-3 py-2 text-muted-foreground">{d.fiscal_year ?? '--'}</td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() => handleDelete(d.id)}
                              className="text-muted-foreground hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
