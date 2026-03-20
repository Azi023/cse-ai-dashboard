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
  ClipboardList,
} from 'lucide-react';
import { marketApi, alertsApi } from '@/lib/api';
import { useDisplayMode } from '@/contexts/display-mode-context';
import { useTheme } from '@/contexts/theme-context';

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
  badge?: string;
}

const topLinks: NavLink[] = [
  { href: '/journey', label: 'My Journey', icon: Star },
  { href: '/', label: 'Dashboard', icon: TrendingUp },
  { href: '/stocks', label: 'Stocks', icon: BarChart3 },
  { href: '/portfolio', label: 'Portfolio', icon: Wallet },
  { href: '/signals', label: 'Signals', icon: Zap },
  { href: '/orders', label: 'Orders', icon: ClipboardList },
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

const demoGroup: NavGroup = {
  label: 'Demo',
  icon: FlaskConical,
  badge: 'DEMO',
  links: [
    { href: '/demo', label: 'Demo Portfolio', icon: FlaskConical },
    { href: '/demo/performance', label: 'Performance', icon: TrendingUp },
  ],
};

const dropdownGroups = [analysisGroup, intelligenceGroup, toolsGroup, demoGroup];

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
          group.badge
            ? groupIsActive
              ? 'bg-amber-500/10 text-amber-500'
              : 'text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10'
            : groupIsActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        }`}
      >
        {group.label}
        {group.badge && (
          <span className="text-[9px] font-bold bg-amber-500/20 text-amber-500 border border-amber-500/30 rounded px-1 py-px leading-none">
            {group.badge}
          </span>
        )}
        <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-48 rounded-lg border bg-popover shadow-xl z-50 overflow-hidden">
          {group.links.map((link) => {
            const Icon = link.icon;
            const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors ${
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                <Icon className="h-3.5 w-3.5 flex-shrink-0" />
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
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [marketOpen, setMarketOpen] = useState(false);
  const [aspiValue, setAspiValue] = useState<number | null>(null);
  const [aspiChange, setAspiChange] = useState<number | null>(null);
  const [aspiFlash, setAspiFlash] = useState<'up' | 'down' | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const prevAspiRef = useRef<number | null>(null);

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
        const newVal = Number(res.data.aspi_value) || null;
        const newChg = Number(res.data.aspi_change_percent) || null;

        if (newVal !== null && prevAspiRef.current !== null && newVal !== prevAspiRef.current) {
          const direction = newVal > prevAspiRef.current ? 'up' : 'down';
          setAspiFlash(direction);
          setTimeout(() => setAspiFlash(null), 700);
        }
        prevAspiRef.current = newVal;
        setAspiValue(newVal);
        setAspiChange(newChg);
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
      <div className="container flex h-14 items-center justify-between px-4 max-w-[1400px] mx-auto">
        {/* Logo + Nav */}
        <div className="flex items-center gap-5">
          <Link href={mode === 'simple' ? '/journey' : '/'} className="flex items-center gap-2 group">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm font-semibold tracking-tight hidden sm:block">CSE Dashboard</span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-0.5">
            {topLinks
              .filter((link) => !(mode === 'simple' && link.href === '/signals'))
              .filter((link) => !(mode === 'simple' && link.href === '/'))
              .map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-all duration-150 ${
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {link.label}
                </Link>
              );
            })}

            {dropdownGroups
              .filter((group) => !(mode === 'simple' && group.label === 'Analysis'))
              .map((group) => (
              <DropdownMenu
                key={group.label}
                group={group}
                pathname={pathname}
              />
            ))}
          </nav>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 text-sm">
          {/* ASPI ticker */}
          {aspiValue != null && (
            <div
              className={`hidden sm:flex items-center gap-1.5 rounded-md border px-2.5 py-1 transition-colors num ${
                aspiFlash === 'up'
                  ? 'price-flash-up'
                  : aspiFlash === 'down'
                  ? 'price-flash-down'
                  : ''
              }`}
            >
              <span className="text-[10px] text-muted-foreground font-medium tracking-wider">ASPI</span>
              <span className="text-sm font-semibold">{Number(aspiValue).toFixed(2)}</span>
              {aspiChange != null && (
                <span
                  className={`text-xs font-medium ${
                    Number(aspiChange) > 0
                      ? 'text-emerald-500'
                      : Number(aspiChange) < 0
                        ? 'text-red-500'
                        : 'text-muted-foreground'
                  }`}
                >
                  {Number(aspiChange) > 0 ? '+' : ''}
                  {Number(aspiChange).toFixed(2)}%
                </span>
              )}
            </div>
          )}

          {/* Market status */}
          {mounted && (
            <div className="hidden sm:flex items-center gap-1.5 rounded-md border px-2.5 py-1">
              <span
                className={`h-1.5 w-1.5 rounded-full ${marketOpen ? 'bg-emerald-500' : 'bg-red-500'}`}
                style={marketOpen ? { boxShadow: '0 0 6px oklch(0.696 0.172 162)' } : undefined}
              />
              <span className="text-xs text-muted-foreground">
                {marketOpen ? 'Open' : 'Closed'}
              </span>
            </div>
          )}

          {/* Time */}
          <span
            className="hidden lg:block text-xs text-muted-foreground num"
            suppressHydrationWarning
          >
            {currentTime ? format(currentTime, 'EEE, MMM d HH:mm:ss') : ''}
          </span>

          {/* Theme toggle (dark/light) */}
          {mounted && (
            <button
              onClick={toggleTheme}
              className="flex items-center justify-center h-8 w-8 rounded-md border text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? (
                <Sun className="h-3.5 w-3.5" />
              ) : (
                <Moon className="h-3.5 w-3.5" />
              )}
            </button>
          )}

          {/* Simple/Pro mode toggle */}
          {mounted && (
            <button
              onClick={toggleMode}
              className="hidden sm:flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs text-muted-foreground transition-all duration-150 hover:text-foreground hover:bg-accent"
              title={mode === 'simple' ? 'Switch to Pro Mode' : 'Switch to Simple Mode'}
            >
              {mode === 'simple' ? 'Simple' : 'Pro'}
            </button>
          )}

          {/* Alert bell */}
          <Link
            href="/alerts"
            className="relative flex items-center justify-center h-8 w-8 rounded-md border text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
          >
            <Bell className={`h-3.5 w-3.5 ${unreadAlerts > 0 ? 'bell-pulse' : ''}`} />
            {unreadAlerts > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white leading-none">
                {unreadAlerts > 99 ? '99+' : unreadAlerts}
              </span>
            )}
          </Link>

          {/* Mobile menu toggle */}
          <button
            className="md:hidden flex items-center justify-center h-8 w-8 rounded-md border text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileMenuOpen && (
        <nav className="md:hidden border-t px-4 py-2 space-y-0.5 max-h-[70vh] overflow-y-auto bg-background/98">
          {/* Controls row */}
          <div className="flex items-center justify-between px-3 py-2 border-b mb-1 pb-2 gap-2">
            <span className="text-xs text-muted-foreground">Display</span>
            <div className="flex items-center gap-2">
              {mounted && (
                <button
                  onClick={toggleTheme}
                  className="flex items-center justify-center h-7 w-7 rounded-md border text-muted-foreground hover:text-foreground hover:bg-accent"
                >
                  {theme === 'dark' ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
                </button>
              )}
              <button
                onClick={toggleMode}
                className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                {mode === 'simple' ? 'Simple' : 'Pro'}
              </button>
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground uppercase tracking-wider px-3 pt-1 pb-0.5">
            Main
          </p>
          {topLinks
            .filter((link) => !(mode === 'simple' && link.href === '/signals'))
            .filter((link) => !(mode === 'simple' && link.href === '/'))
            .map((link) => {
            const Icon = link.icon;
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}

          {dropdownGroups
            .filter((group) => !(mode === 'simple' && group.label === 'Analysis'))
            .map((group) => (
            <div key={group.label}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider px-3 pt-2 pb-0.5 border-t mt-1 flex items-center gap-1.5">
                {group.label}
                {group.badge && (
                  <span className="text-[9px] font-bold bg-amber-500/20 text-amber-500 border border-amber-500/30 rounded px-1 py-px leading-none normal-case">
                    {group.badge}
                  </span>
                )}
              </p>
              {group.links.map((link) => {
                const Icon = link.icon;
                const active = isActive(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {link.label}
                  </Link>
                );
              })}
            </div>
          ))}

          {/* Mobile ASPI + status */}
          <div className="flex items-center gap-4 px-3 py-2 text-xs text-muted-foreground border-t mt-1 pt-2 num">
            {aspiValue != null && (
              <span>
                ASPI <span className="font-medium text-foreground">{Number(aspiValue).toFixed(2)}</span>{' '}
                {aspiChange != null && (
                  <span
                    className={
                      Number(aspiChange) > 0
                        ? 'text-emerald-500'
                        : Number(aspiChange) < 0
                          ? 'text-red-500'
                          : ''
                    }
                  >
                    ({Number(aspiChange) > 0 ? '+' : ''}
                    {Number(aspiChange).toFixed(2)}%)
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
