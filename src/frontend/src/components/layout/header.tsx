'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { format } from 'date-fns';
import {
  Activity,
  TrendingUp,
  BarChart3,
  ShieldCheck,
  Wallet,
  Menu,
  X,
  Zap,
  Sparkles,
  FileSpreadsheet,
  Megaphone,
  Bell,
  CalendarDays,
  Target,
  GitCompare,
  PieChart,
  ChevronDown,
  Newspaper,
  FlaskConical,
  Star,
  Settings,
  Sun,
  Moon,
} from 'lucide-react';
import { marketApi, alertsApi } from '@/lib/api';
import { useDisplayMode } from '@/contexts/display-mode-context';

function checkMarketHours(): boolean {
  const now = new Date();
  const sltOffset = 5.5 * 60;
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const sltMinutes = utcMinutes + sltOffset;
  const day = now.getUTCDay();

  const sltDay = sltMinutes >= 1440 ? (day + 1) % 7 : day;
  const adjustedMinutes = sltMinutes >= 1440 ? sltMinutes - 1440 : sltMinutes;

  const marketOpen = 9 * 60 + 30;
  const marketClose = 14 * 60 + 30;

  return sltDay >= 1 && sltDay <= 5 && adjustedMinutes >= marketOpen && adjustedMinutes <= marketClose;
}

interface NavLink {
  href: string;
  label: string;
  icon: React.ElementType;
}

interface NavGroup {
  label: string;
  icon: React.ElementType;
  links: NavLink[];
}

const topLinks: NavLink[] = [
  { href: '/journey', label: 'My Journey', icon: Star },
  { href: '/', label: 'Dashboard', icon: TrendingUp },
  { href: '/stocks', label: 'Stocks', icon: BarChart3 },
  { href: '/portfolio', label: 'Portfolio', icon: Wallet },
  { href: '/signals', label: 'Signals', icon: Zap },
];

const analysisGroup: NavGroup = {
  label: 'Analysis',
  icon: PieChart,
  links: [
    { href: '/sectors', label: 'Sectors', icon: PieChart },
    { href: '/compare', label: 'Compare', icon: GitCompare },
    { href: '/shariah', label: 'Shariah', icon: ShieldCheck },
    { href: '/performance', label: 'AI Performance', icon: Target },
    { href: '/backtest', label: 'Backtester', icon: FlaskConical },
  ],
};

const intelligenceGroup: NavGroup = {
  label: 'Intelligence',
  icon: Newspaper,
  links: [
    { href: '/news', label: 'News Feed', icon: Newspaper },
    { href: '/announcements', label: 'Announcements', icon: Megaphone },
    { href: '/chat', label: 'Strategy Chat', icon: Sparkles },
  ],
};

const toolsGroup: NavGroup = {
  label: 'Tools',
  icon: FileSpreadsheet,
  links: [
    { href: '/dividends', label: 'Dividends', icon: CalendarDays },
    { href: '/admin/financials', label: 'Financials', icon: FileSpreadsheet },
    { href: '/settings', label: 'Settings', icon: Settings },
  ],
};

const dropdownGroups = [analysisGroup, intelligenceGroup, toolsGroup];

function DropdownMenu({ group, pathname }: { group: NavGroup; pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const groupIsActive = group.links.some((link) =>
    link.href === '/' ? pathname === '/' : pathname.startsWith(link.href),
  );

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
          groupIsActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        }`}
      >
        {group.label}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-48 rounded-md border bg-popover shadow-lg z-50">
          {group.links.map((link) => {
            const Icon = link.icon;
            const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {link.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Header() {
  const pathname = usePathname();
  const { mode, toggleMode } = useDisplayMode();
  const [mounted, setMounted] = useState(false);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [marketOpen, setMarketOpen] = useState(false);
  const [aspiValue, setAspiValue] = useState<number | null>(null);
  const [aspiChange, setAspiChange] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadAlerts, setUnreadAlerts] = useState(0);

  useEffect(() => {
    setMounted(true);
    setCurrentTime(new Date());
    setMarketOpen(checkMarketHours());

    const timer = setInterval(() => {
      setCurrentTime(new Date());
      setMarketOpen(checkMarketHours());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchAlerts = () => {
      alertsApi.getUnreadCount().then((res) => {
        setUnreadAlerts(res.data.count);
      }).catch(() => {});
    };
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchAspi = () => {
      marketApi.getSummary().then((res) => {
        setAspiValue(res.data.aspi_value);
        setAspiChange(res.data.aspi_change_percent);
      }).catch(() => {});
    };
    fetchAspi();
    const interval = setInterval(fetchAspi, 60000);
    return () => clearInterval(interval);
  }, []);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between px-4">
        {/* Logo + Nav */}
        <div className="flex items-center gap-6">
          <Link href={mode === 'simple' ? '/journey' : '/'} className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold hidden sm:block">CSE Dashboard</h1>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {topLinks.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {link.label}
                </Link>
              );
            })}

            {/* Dropdown groups */}
            {dropdownGroups.map((group) => (
              <DropdownMenu
                key={group.label}
                group={group}
                pathname={pathname}
              />
            ))}
          </nav>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3 text-sm">
          {/* Simple/Pro Mode Toggle */}
          {mounted && (
            <button
              onClick={toggleMode}
              className="hidden sm:flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors hover:bg-muted/50"
              title={mode === 'simple' ? 'Switch to Pro Mode' : 'Switch to Simple Mode'}
            >
              {mode === 'simple' ? (
                <>
                  <Sun className="h-3 w-3 text-yellow-500" />
                  <span>Simple</span>
                </>
              ) : (
                <>
                  <Moon className="h-3 w-3 text-blue-400" />
                  <span>Pro</span>
                </>
              )}
            </button>
          )}

          {/* Alert bell */}
          <Link
            href="/alerts"
            className="relative p-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Bell className="h-4 w-4" />
            {unreadAlerts > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {unreadAlerts > 99 ? '99+' : unreadAlerts}
              </span>
            )}
          </Link>

          {/* ASPI ticker */}
          {aspiValue != null && (
            <div className="hidden sm:flex items-center gap-1.5 rounded-md border px-2.5 py-1">
              <span className="text-xs text-muted-foreground">ASPI</span>
              <span className="font-medium">{aspiValue.toFixed(2)}</span>
              {aspiChange != null && (
                <span
                  className={`text-xs ${
                    aspiChange > 0
                      ? 'text-green-500'
                      : aspiChange < 0
                        ? 'text-red-500'
                        : 'text-muted-foreground'
                  }`}
                >
                  {aspiChange > 0 ? '+' : ''}
                  {aspiChange.toFixed(2)}%
                </span>
              )}
            </div>
          )}

          {/* Market status */}
          {mounted && (
            <div className="hidden sm:flex items-center gap-1.5">
              <Activity
                className={`h-3 w-3 ${marketOpen ? 'text-green-500' : 'text-red-500'}`}
              />
              <span className="text-xs text-muted-foreground">
                {marketOpen ? 'Open' : 'Closed'}
              </span>
            </div>
          )}

          {/* Time */}
          <span
            className="hidden lg:block text-xs text-muted-foreground"
            suppressHydrationWarning
          >
            {currentTime ? format(currentTime, 'EEE, MMM d HH:mm:ss') : ''}
          </span>

          {/* Mobile menu toggle */}
          <button
            className="md:hidden p-1 text-muted-foreground hover:text-foreground"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileMenuOpen && (
        <nav className="md:hidden border-t px-4 py-2 space-y-0.5 max-h-[70vh] overflow-y-auto">
          {/* Mode toggle (mobile) */}
          <div className="flex items-center justify-between px-3 py-2 border-b mb-1 pb-2">
            <span className="text-xs text-muted-foreground">Display Mode</span>
            <button
              onClick={toggleMode}
              className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs hover:bg-muted/50"
            >
              {mode === 'simple' ? (
                <>
                  <Sun className="h-3 w-3 text-yellow-500" /> Simple
                </>
              ) : (
                <>
                  <Moon className="h-3 w-3 text-blue-400" /> Pro
                </>
              )}
            </button>
          </div>

          <p className="text-[10px] text-muted-foreground uppercase tracking-wider px-3 pt-1 pb-0.5">
            Main
          </p>
          {topLinks.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}

          {dropdownGroups.map((group) => (
            <div key={group.label}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider px-3 pt-2 pb-0.5 border-t mt-1">
                {group.label}
              </p>
              {group.links.map((link) => {
                const Icon = link.icon;
                const active = isActive(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {link.label}
                  </Link>
                );
              })}
            </div>
          ))}

          {/* Mobile-only: ASPI + status */}
          <div className="flex items-center gap-4 px-3 py-2 text-xs text-muted-foreground border-t mt-1 pt-2">
            {aspiValue != null && (
              <span>
                ASPI {aspiValue.toFixed(2)}{' '}
                {aspiChange != null && (
                  <span
                    className={
                      aspiChange > 0
                        ? 'text-green-500'
                        : aspiChange < 0
                          ? 'text-red-500'
                          : ''
                    }
                  >
                    ({aspiChange > 0 ? '+' : ''}
                    {aspiChange.toFixed(2)}%)
                  </span>
                )}
              </span>
            )}
            {mounted && (
              <span>Market {marketOpen ? 'Open' : 'Closed'}</span>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
