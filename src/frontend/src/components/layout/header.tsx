'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { format } from 'date-fns';
import { Activity, TrendingUp, BarChart3, ShieldCheck, Wallet, Menu, X, Zap, Sparkles } from 'lucide-react';
import { marketApi } from '@/lib/api';

function checkMarketHours(): boolean {
  const now = new Date();
  const sltOffset = 5.5 * 60; // UTC+5:30 in minutes
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const sltMinutes = utcMinutes + sltOffset;
  const day = now.getUTCDay();

  const sltDay = sltMinutes >= 1440 ? (day + 1) % 7 : day;
  const adjustedMinutes = sltMinutes >= 1440 ? sltMinutes - 1440 : sltMinutes;

  const marketOpen = 9 * 60 + 30; // 9:30
  const marketClose = 14 * 60 + 30; // 14:30

  return sltDay >= 1 && sltDay <= 5 && adjustedMinutes >= marketOpen && adjustedMinutes <= marketClose;
}

const navLinks = [
  { href: '/', label: 'Dashboard', icon: TrendingUp },
  { href: '/stocks', label: 'Stocks', icon: BarChart3 },
  { href: '/shariah', label: 'Shariah', icon: ShieldCheck },
  { href: '/portfolio', label: 'Portfolio', icon: Wallet },
  { href: '/signals', label: 'Signals', icon: Zap },
  { href: '/chat', label: 'Strategy', icon: Sparkles },
];

export function Header() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [marketOpen, setMarketOpen] = useState(false);
  const [aspiValue, setAspiValue] = useState<number | null>(null);
  const [aspiChange, setAspiChange] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  // Fetch ASPI data
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
          <Link href="/" className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold hidden sm:block">CSE Dashboard</h1>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
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
          </nav>
        </div>

        {/* Right side: ASPI + Market status + Time */}
        <div className="flex items-center gap-3 text-sm">
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
            {mobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileMenuOpen && (
        <nav className="md:hidden border-t px-4 py-2 space-y-1">
          {navLinks.map((link) => {
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
          {/* Mobile-only: ASPI + status */}
          <div className="flex items-center gap-4 px-3 py-2 text-xs text-muted-foreground border-t mt-2 pt-2">
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
              <span>
                Market {marketOpen ? 'Open' : 'Closed'}
              </span>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
