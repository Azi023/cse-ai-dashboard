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
  Crosshair,
  Scale,
  LogOut,
  Bitcoin,
} from 'lucide-react';
import { marketApi, alertsApi } from '@/lib/api';
import { useDisplayMode } from '@/contexts/display-mode-context';
import { useTheme } from '@/contexts/theme-context';
import { useAuth } from '@/contexts/auth-context';
import { useShariahMode } from '@/contexts/shariah-mode-context';

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

/* ─── Navigation Structure ──────────────────────────────────────────────── */

const topLinks: NavLink[] = [
  { href: '/', label: 'Dashboard', icon: TrendingUp },
  { href: '/portfolio', label: 'Portfolio', icon: Wallet },
  { href: '/stocks', label: 'Stocks', icon: BarChart3 },
  { href: '/signals', label: 'Signals', icon: Zap },
];

const tradingGroup: NavGroup = {
  label: 'Trading',
  icon: ClipboardList,
  links: [
    { href: '/orders', label: 'Orders', icon: ClipboardList },
    { href: '/opportunities', label: 'Opportunities', icon: Crosshair },
    { href: '/demo', label: 'Demo Trading', icon: FlaskConical },
    { href: '/backtest', label: 'Backtester', icon: FlaskConical },
  ],
};

const researchGroup: NavGroup = {
  label: 'Research',
  icon: PieChart,
  links: [
    { href: '/journey', label: 'Journey', icon: Star },
    { href: '/sectors', label: 'Sectors', icon: PieChart },
    { href: '/compare', label: 'Compare', icon: GitCompare },
    { href: '/crypto', label: 'Crypto', icon: Bitcoin },
  ],
};

const moreGroup: NavGroup = {
  label: 'More',
  icon: Settings,
  links: [
    { href: '/news', label: 'News', icon: Newspaper },
    { href: '/announcements', label: 'Announcements', icon: Megaphone },
    { href: '/chat', label: 'AI Chat', icon: Sparkles },
    { href: '/shariah', label: 'Shariah', icon: ShieldCheck },
    { href: '/dividends', label: 'Dividends', icon: CalendarDays },
    { href: '/zakat', label: 'Zakat', icon: Scale },
    { href: '/performance', label: 'AI Performance', icon: Target },
    { href: '/settings', label: 'Settings', icon: Settings },
  ],
};

const dropdownGroups = [tradingGroup, researchGroup, moreGroup];

/* ─── Simple Mode Navigation ────────────────────────────────────────────── */

const simpleTopLinks: NavLink[] = [
  { href: '/journey', label: 'Journey', icon: Star },
  { href: '/', label: 'Dashboard', icon: TrendingUp },
  { href: '/portfolio', label: 'Portfolio', icon: Wallet },
];

const simpleMoreGroup: NavGroup = {
  label: 'More',
  icon: Settings,
  links: [
    { href: '/stocks', label: 'Stocks', icon: BarChart3 },
    { href: '/news', label: 'News', icon: Newspaper },
    { href: '/settings', label: 'Settings', icon: Settings },
  ],
};

/* ─── Desktop Dropdown ──────────────────────────────────────────────────── */

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
        className={`flex items-center gap-1 shrink-0 whitespace-nowrap rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors ${
          groupIsActive
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

/* ─── Header Component ──────────────────────────────────────────────────── */

export function Header() {
  const pathname = usePathname();
  const { mode, toggleMode } = useDisplayMode();
  const { theme, toggleTheme } = useTheme();
  const { logout } = useAuth();
  const { shariahMode, toggleShariahMode } = useShariahMode();
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

  // Close mobile menu on navigation
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const isSimple = mode === 'simple';

  // Filter Shariah-specific nav items when shariahMode is OFF
  const filterShariahLinks = (links: NavLink[]): NavLink[] => {
    if (shariahMode) return links;
    return links.filter((l) => l.href !== '/shariah' && l.href !== '/zakat');
  };

  const activeTopLinks = isSimple ? simpleTopLinks : topLinks;
  const activeDropdownGroups = (isSimple ? [simpleMoreGroup] : dropdownGroups).map((g) => ({
    ...g,
    links: filterShariahLinks(g.links),
  }));

  // Collect all nav links for mobile menu
  const allMobileLinks: { section: string; links: NavLink[]; badge?: string }[] = [
    { section: 'Main', links: activeTopLinks },
    ...activeDropdownGroups.map((g) => ({ section: g.label, links: g.links, badge: g.badge })),
  ];

  return (
    <>
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center gap-3 px-4 max-w-[1400px] mx-auto">
          {/* Logo + Nav */}
          <div className="flex items-center gap-5 min-w-0 flex-1">
            <Link href={isSimple ? '/journey' : '/'} className="flex items-center gap-2 group shrink-0">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm font-semibold tracking-tight hidden sm:block">CSE Dashboard</span>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-px min-w-0 flex-1 overflow-visible" aria-label="Main navigation">
              {activeTopLinks.map((link) => {
                const active = isActive(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`shrink-0 whitespace-nowrap rounded-md px-2 py-1.5 text-[13px] font-medium transition-all duration-150 ${
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}

              {activeDropdownGroups.map((group) => (
                <DropdownMenu key={group.label} group={group} pathname={pathname} />
              ))}
            </nav>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2 text-sm shrink-0">
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
                        ? 'text-profit'
                        : Number(aspiChange) < 0
                          ? 'text-loss'
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
                  className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${marketOpen ? 'bg-profit' : 'bg-loss/70'}`}
                  style={marketOpen ? { boxShadow: '0 0 6px oklch(0.696 0.172 162)' } : undefined}
                />
                <span className="text-xs text-muted-foreground">
                  {marketOpen ? 'Live' : 'Closed'}
                </span>
                {!marketOpen && currentTime && (
                  <span className="text-[10px] text-muted-foreground/60 border-l pl-1.5 ml-0.5">
                    Last close
                  </span>
                )}
              </div>
            )}

            {/* Time */}
            <span
              className="hidden lg:block text-xs text-muted-foreground num"
              suppressHydrationWarning
            >
              {currentTime ? format(currentTime, 'EEE, MMM d HH:mm:ss') : ''}
            </span>

            {/* Theme toggle */}
            {mounted && (
              <button
                onClick={toggleTheme}
                className="flex items-center justify-center h-8 w-8 rounded-md border text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
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
                aria-label={isSimple ? 'Switch to Pro mode' : 'Switch to Beginner mode'}
              >
                {isSimple ? '● Beginner' : '◈ Pro'}
              </button>
            )}

            {/* Shariah toggle */}
            {mounted && (
              <button
                onClick={toggleShariahMode}
                className={`hidden sm:flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-all duration-150 ${
                  shariahMode
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
                aria-label={shariahMode ? 'Disable Shariah screening' : 'Enable Shariah screening'}
                title="Filter stocks and recommendations for Islamic finance compliance (AAOIFI standards)"
              >
                <ShieldCheck className="h-3 w-3" />
                {shariahMode ? 'Shariah' : 'All'}
              </button>
            )}

            {/* Alert bell */}
            <Link
              href="/alerts"
              className="relative flex items-center justify-center h-8 w-8 rounded-md border text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
              aria-label={`Notifications${unreadAlerts > 0 ? ` (${unreadAlerts} unread)` : ''}`}
            >
              <Bell className={`h-3.5 w-3.5 ${unreadAlerts > 0 ? 'bell-pulse' : ''}`} />
              {unreadAlerts > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-white leading-none">
                  {unreadAlerts > 99 ? '99+' : unreadAlerts}
                </span>
              )}
            </Link>

            {/* Logout */}
            <button
              onClick={() => logout()}
              className="flex items-center justify-center h-8 w-8 rounded-md border text-muted-foreground hover:text-destructive hover:border-destructive/30 hover:bg-destructive/5 transition-all duration-150"
              aria-label="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>

            {/* Mobile menu toggle */}
            <button
              className="md:hidden flex items-center justify-center h-8 w-8 rounded-md border text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* ─── Full-Screen Mobile Drawer ─────────────────────────────────────── */}
      {mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          {/* Drawer */}
          <nav
            className="fixed inset-y-0 right-0 z-50 w-[280px] bg-background border-l shadow-2xl md:hidden flex flex-col"
            aria-label="Mobile navigation"
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 h-14 border-b flex-shrink-0">
              <span className="text-sm font-semibold">Menu</span>
              <div className="flex items-center gap-2">
                {mounted && (
                  <button
                    onClick={toggleTheme}
                    className="flex items-center justify-center h-8 w-8 rounded-md border text-muted-foreground hover:text-foreground hover:bg-accent"
                    aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  >
                    {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                  </button>
                )}
                <button
                  onClick={toggleMode}
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent"
                  aria-label={isSimple ? 'Switch to Pro mode' : 'Switch to Beginner mode'}
                >
                  {isSimple ? 'Simple' : 'Pro'}
                </button>
                <button
                  onClick={toggleShariahMode}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium ${
                    shariahMode
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                  aria-label={shariahMode ? 'Disable Shariah screening' : 'Enable Shariah screening'}
                >
                  <ShieldCheck className="h-3 w-3" />
                  {shariahMode ? 'Shariah' : 'All'}
                </button>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
                  aria-label="Close menu"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Drawer body — scrollable */}
            <div className="flex-1 overflow-y-auto py-2">
              {allMobileLinks.map(({ section, links, badge }) => (
                <div key={section}>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider px-4 pt-3 pb-1 flex items-center gap-1.5">
                    {section}
                    {badge && (
                      <span className="text-[9px] font-bold bg-amber-500/20 text-amber-500 border border-amber-500/30 rounded px-1 py-px leading-none normal-case">
                        {badge}
                      </span>
                    )}
                  </p>
                  {links.map((link) => {
                    const Icon = link.icon;
                    const active = isActive(link.href);
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={`flex items-center gap-3 mx-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                          active
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                        }`}
                      >
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        {link.label}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Drawer footer — market status */}
            <div className="flex-shrink-0 border-t px-4 py-3 space-y-2">
              {aspiValue != null && (
                <div className="flex items-center gap-2 text-xs num">
                  <span className="text-muted-foreground">ASPI</span>
                  <span className="font-semibold text-foreground">{Number(aspiValue).toFixed(2)}</span>
                  {aspiChange != null && (
                    <span className={Number(aspiChange) > 0 ? 'text-profit' : Number(aspiChange) < 0 ? 'text-loss' : 'text-muted-foreground'}>
                      ({Number(aspiChange) > 0 ? '+' : ''}{Number(aspiChange).toFixed(2)}%)
                    </span>
                  )}
                </div>
              )}
              {mounted && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={`h-1.5 w-1.5 rounded-full ${marketOpen ? 'bg-profit' : 'bg-loss/70'}`} />
                  Market {marketOpen ? 'Open' : 'Closed'}
                </div>
              )}
            </div>
          </nav>
        </>
      )}
    </>
  );
}
