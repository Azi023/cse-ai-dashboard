'use client';

import { useState, useEffect } from 'react';
import {
  Settings,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  MonitorSmartphone,
  Bot,
  ShieldCheck,
  Bell,
  User,
  Plug,
  Pencil,
  Save,
  X,
} from 'lucide-react';
import { atradApi, aiApi, type ATradSyncStatus, type AiStatus } from '@/lib/api';
import { useDisplayMode } from '@/contexts/display-mode-context';
import { useShariahMode } from '@/contexts/shariah-mode-context';
import { safeNum } from '@/lib/format';

const PROFILE_KEY = 'cse_investment_profile';

interface InvestmentProfile {
  monthlyContribution: number;
  riskTolerance: 'Conservative' | 'Moderate' | 'Aggressive';
  strategy: 'Rupee Cost Averaging' | 'Lump Sum' | 'Value Averaging';
  journeyStartDate: string;
}

const DEFAULT_PROFILE: InvestmentProfile = {
  monthlyContribution: 10000,
  riskTolerance: 'Conservative',
  strategy: 'Rupee Cost Averaging',
  journeyStartDate: new Date().toISOString().slice(0, 10),
};

export function getInvestmentProfile(): InvestmentProfile {
  if (typeof window === 'undefined') return DEFAULT_PROFILE;
  try {
    const saved = localStorage.getItem(PROFILE_KEY);
    return saved ? { ...DEFAULT_PROFILE, ...JSON.parse(saved) } : DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
}

export default function SettingsPage() {
  const { mode, setMode } = useDisplayMode();
  const { shariahMode, setShariahMode } = useShariahMode();
  const [atradStatus, setAtradStatus] = useState<ATradSyncStatus | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Investment profile editing
  const [profile, setProfile] = useState<InvestmentProfile>(DEFAULT_PROFILE);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editProfile, setEditProfile] = useState<InvestmentProfile>(DEFAULT_PROFILE);
  const [profileSaved, setProfileSaved] = useState(false);

  useEffect(() => {
    const fetchStatuses = async () => {
      setLoading(true);
      const [atrad, ai] = await Promise.allSettled([
        atradApi.getStatus(),
        aiApi.getStatus(),
      ]);
      if (atrad.status === 'fulfilled') setAtradStatus(atrad.value.data);
      if (ai.status === 'fulfilled') setAiStatus(ai.value.data);
      setLoading(false);
    };
    fetchStatuses();
    // Load saved investment profile
    const saved = getInvestmentProfile();
    setProfile(saved);
    setEditProfile(saved);
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await atradApi.sync();
      setSyncResult(res.data.message || 'Sync triggered successfully');
      const statusRes = await atradApi.getStatus();
      setAtradStatus(statusRes.data);
    } catch {
      setSyncResult('Sync failed. Check backend logs.');
    } finally {
      setSyncing(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await atradApi.testConnection();
      setTestResult(res.data);
    } catch {
      setTestResult({ success: false, message: 'Connection test failed. Check credentials in .env' });
    } finally {
      setTesting(false);
    }
  };

  const timeSince = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ${mins % 60}m ago`;
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6 text-muted-foreground" />
          Settings
        </h1>
        <p className="text-muted-foreground mt-1">Configure your dashboard preferences</p>
      </div>

      {/* ATrad Connection */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Plug className="h-5 w-5 text-primary" />
          ATrad Connection
        </h2>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading status...
          </div>
        ) : atradStatus?.configured ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              {atradStatus.syncSuccess ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              <span>
                Status:{' '}
                <span className={atradStatus.syncSuccess ? 'text-green-400' : 'text-red-400'}>
                  {atradStatus.syncSuccess ? 'Connected' : 'Last sync failed'}
                </span>
              </span>
            </div>

            {atradStatus.lastSynced && (
              <p className="text-sm text-muted-foreground">
                Last sync: {timeSince(atradStatus.lastSynced)}
              </p>
            )}

            <p className="text-sm text-muted-foreground">
              Holdings: {atradStatus.holdingsCount} stocks &middot; Buying Power: LKR{' '}
              {safeNum(atradStatus.buyingPower).toLocaleString()}
            </p>

            <p className="text-sm text-muted-foreground">
              Auto-sync: Every 15 min during market hours (9:30 AM – 2:30 PM SLT)
            </p>

            <div className="flex gap-3">
              <button
                onClick={handleTest}
                disabled={testing}
                className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm hover:bg-muted/50 transition-colors disabled:opacity-50"
              >
                {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Test Connection
              </button>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Sync Now
              </button>
            </div>

            {testResult && (
              <div
                className={`rounded-lg p-3 text-sm ${
                  testResult.success
                    ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                    : 'bg-red-500/10 border border-red-500/20 text-red-400'
                }`}
              >
                {testResult.success ? '✅' : '❌'} {testResult.message}
              </div>
            )}

            {syncResult && (
              <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-3 text-sm text-blue-400">
                {syncResult}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Credentials stored in <code className="bg-muted px-1 rounded">src/backend/.env</code> — edit
              that file to change them. Never sent to any external server.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-5 text-center space-y-3">
            <Plug className="h-8 w-8 text-muted-foreground mx-auto" />
            <div>
              <p className="text-sm font-medium">Connect your ATrad account</p>
              <p className="text-xs text-muted-foreground mt-1">
                Auto-sync your portfolio by adding ATrad credentials to your .env file.
              </p>
            </div>
            <div className="text-left rounded-lg bg-muted/30 p-3 text-xs font-mono">
              <p className="text-muted-foreground"># Add to src/backend/.env</p>
              <p>ATRAD_USERNAME=your_username</p>
              <p>ATRAD_PASSWORD=your_password</p>
              <p>ATRAD_URL=https://trade.hnbstockbrokers.lk/atsweb/login</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Your credentials are stored locally on YOUR computer only. They are never sent to any server.
            </p>
          </div>
        )}
      </div>

      {/* Display Mode */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <MonitorSmartphone className="h-5 w-5 text-primary" />
          Display Mode
        </h2>
        <div className="space-y-3">
          <label
            className={`flex items-center gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
              mode === 'simple' ? 'border-primary bg-primary/5' : 'hover:bg-muted/30'
            }`}
          >
            <input
              type="radio"
              name="displayMode"
              checked={mode === 'simple'}
              onChange={() => setMode('simple')}
              className="sr-only"
            />
            <div
              className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                mode === 'simple' ? 'border-primary' : 'border-muted-foreground'
              }`}
            >
              {mode === 'simple' && <div className="h-2 w-2 rounded-full bg-primary" />}
            </div>
            <div>
              <p className="text-sm font-medium">🌟 Simple Mode</p>
              <p className="text-xs text-muted-foreground">
                Plain language, no jargon. Journey page as home. Recommended for beginners.
              </p>
            </div>
          </label>

          <label
            className={`flex items-center gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
              mode === 'pro' ? 'border-primary bg-primary/5' : 'hover:bg-muted/30'
            }`}
          >
            <input
              type="radio"
              name="displayMode"
              checked={mode === 'pro'}
              onChange={() => setMode('pro')}
              className="sr-only"
            />
            <div
              className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                mode === 'pro' ? 'border-primary' : 'border-muted-foreground'
              }`}
            >
              {mode === 'pro' && <div className="h-2 w-2 rounded-full bg-primary" />}
            </div>
            <div>
              <p className="text-sm font-medium">📊 Pro Mode</p>
              <p className="text-xs text-muted-foreground">
                Full technical dashboard with charts, indicators, and advanced analysis.
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Shariah Screening */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Shariah Screening
        </h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">
              {shariahMode ? 'Active — Filtering for Islamic compliance' : 'Inactive — Showing all stocks'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              When active, stocks, crypto pairs, and AI recommendations are filtered for AAOIFI-standard Shariah compliance.
            </p>
          </div>
          <button
            onClick={() => setShariahMode(!shariahMode)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              shariahMode ? 'bg-emerald-500' : 'bg-muted'
            }`}
            role="switch"
            aria-checked={shariahMode}
            aria-label="Shariah screening toggle"
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                shariahMode ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        {!shariahMode && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-sm text-amber-400">
            Shariah screening is disabled. All stocks and crypto pairs are visible. AI recommendations will use generic value investing context.
          </div>
        )}
      </div>

      {/* AI Mode */}
      <div className="rounded-xl border bg-card p-6 space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          AI Mode
        </h2>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <p>
              Current:{' '}
              <span className={aiStatus?.mode === 'live' ? 'text-green-400' : 'text-yellow-400'}>
                {aiStatus?.mode === 'live' ? '🟢 Live Mode' : '🟡 Mock Mode'}
              </span>
            </p>
            {aiStatus?.model && (
              <p className="text-muted-foreground">Model: {aiStatus.model}</p>
            )}
            {aiStatus?.mode !== 'live' && (
              <p className="text-xs text-muted-foreground">
                To enable live AI: Add <code className="bg-muted px-1 rounded">ANTHROPIC_API_KEY</code> to{' '}
                <code className="bg-muted px-1 rounded">src/backend/.env</code>
              </p>
            )}
          </div>
        )}
      </div>

      {/* Investment Profile */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Investment Profile
          </h2>
          {!editingProfile ? (
            <button
              onClick={() => { setEditProfile(profile); setEditingProfile(true); setProfileSaved(false); }}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  localStorage.setItem(PROFILE_KEY, JSON.stringify(editProfile));
                  setProfile(editProfile);
                  setEditingProfile(false);
                  setProfileSaved(true);
                  setTimeout(() => setProfileSaved(false), 3000);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Save className="h-3.5 w-3.5" /> Save
              </button>
              <button
                onClick={() => { setEditingProfile(false); setEditProfile(profile); }}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors"
              >
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
            </div>
          )}
        </div>

        {profileSaved && (
          <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3 text-sm text-green-400">
            ✅ Investment profile saved successfully.
          </div>
        )}

        {editingProfile ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Monthly Contribution (LKR)</label>
              <input
                type="number"
                value={editProfile.monthlyContribution}
                onChange={(e) => setEditProfile(p => ({ ...p, monthlyContribution: Number(e.target.value) }))}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Risk Tolerance</label>
              <select
                value={editProfile.riskTolerance}
                onChange={(e) => setEditProfile(p => ({ ...p, riskTolerance: e.target.value as InvestmentProfile['riskTolerance'] }))}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option>Conservative</option>
                <option>Moderate</option>
                <option>Aggressive</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Investment Strategy</label>
              <select
                value={editProfile.strategy}
                onChange={(e) => setEditProfile(p => ({ ...p, strategy: e.target.value as InvestmentProfile['strategy'] }))}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option>Rupee Cost Averaging</option>
                <option>Lump Sum</option>
                <option>Value Averaging</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Journey Start Date</label>
              <input
                type="date"
                value={editProfile.journeyStartDate}
                onChange={(e) => setEditProfile(p => ({ ...p, journeyStartDate: e.target.value }))}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="rounded-lg bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Shariah Filter</p>
              <button
                onClick={() => setShariahMode(!shariahMode)}
                className={`font-medium mt-0.5 ${shariahMode ? 'text-green-400' : 'text-muted-foreground'}`}
              >
                {shariahMode ? 'ON — Shariah Compliant' : 'OFF — All Stocks'}
              </button>
              <p className="text-xs text-muted-foreground mt-1">
                {shariahMode
                  ? 'Only Shariah-compliant stocks and crypto pairs are shown.'
                  : 'All stocks and crypto pairs are visible. Shariah badges hidden.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Monthly Contribution</p>
              <p className="font-medium mt-0.5">LKR {safeNum(profile.monthlyContribution).toLocaleString()}</p>
            </div>
            <div className="rounded-lg bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Strategy</p>
              <p className="font-medium mt-0.5">{profile.strategy}</p>
            </div>
            <div className="rounded-lg bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Risk Tolerance</p>
              <p className="font-medium mt-0.5">{profile.riskTolerance}</p>
            </div>
            <div className="rounded-lg bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Journey Start Date</p>
              <p className="font-medium mt-0.5">{profile.journeyStartDate}</p>
            </div>
            <div className="rounded-lg bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Shariah Filter</p>
              <p className="font-medium mt-0.5 text-green-400">Always ON ✅</p>
            </div>
          </div>
        )}
      </div>

      {/* Notifications */}
      <div className="rounded-xl border bg-card p-6 space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          Notifications
        </h2>
        <div className="space-y-2 text-sm">
          {[
            { label: 'Market drop alerts', detail: '> 3% drop', enabled: true },
            { label: 'Portfolio stock alerts', detail: '> 5% move', enabled: true },
            { label: 'Announcement alerts', detail: 'For portfolio stocks', enabled: true },
            { label: 'Shariah status changes', detail: 'Compliance updates', enabled: true },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between rounded-lg bg-muted/30 p-3"
            >
              <div>
                <p className="font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.detail}</p>
              </div>
              <span className={`text-xs font-medium ${item.enabled ? 'text-green-400' : 'text-muted-foreground'}`}>
                {item.enabled ? 'ON' : 'OFF'}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Notification preferences will be configurable in a future update.
        </p>
      </div>

      {/* Data */}
      <div className="rounded-xl border bg-card p-6 space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Data & Privacy
        </h2>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>All data is stored locally on your machine in PostgreSQL.</p>
          <p>No data is sent to external servers (except CSE API for market data and ATrad for portfolio sync).</p>
          <p>AI analysis uses the Anthropic API when enabled — your market data context is sent for analysis.</p>
          <p>ATrad credentials are stored in <code className="bg-muted px-1 rounded">.env</code> and never committed to git.</p>
        </div>
      </div>
    </div>
  );
}
