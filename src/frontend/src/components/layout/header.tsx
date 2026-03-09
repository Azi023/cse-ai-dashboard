'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Activity, TrendingUp } from 'lucide-react';

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

export function Header() {
  const [mounted, setMounted] = useState(false);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [marketOpen, setMarketOpen] = useState(false);

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

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-primary" />
          <h1 className="text-lg font-bold">CSE Dashboard</h1>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {mounted && (
            <div className="flex items-center gap-2">
              <Activity className={`h-3 w-3 ${marketOpen ? 'text-green-500' : 'text-red-500'}`} />
              <span>{marketOpen ? 'Market Open' : 'Market Closed'}</span>
            </div>
          )}
          <span suppressHydrationWarning>
            {currentTime ? format(currentTime, 'EEE, MMM d yyyy HH:mm:ss') : ''}
          </span>
        </div>
      </div>
    </header>
  );
}
