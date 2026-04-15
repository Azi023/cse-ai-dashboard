'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Scale, ChevronRight, Loader2 } from 'lucide-react';
import { debateApi, type DebateResult } from '@/lib/api';

export function ThisWeekDebates() {
  const [debates, setDebates] = useState<DebateResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await debateApi.getThisWeek();
        if (alive) setDebates(res.data.slice(0, 3));
      } catch {
        // silent — widget is optional
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-6 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading debates…
      </div>
    );
  }

  if (debates.length === 0) return null;

  return (
    <section
      aria-label="This week's AI debates"
      className="rounded-xl border bg-card p-6 space-y-4"
    >
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
          <Scale className="h-5 w-5 text-primary" aria-hidden />
          This week&apos;s debates
        </h2>
        <span className="text-xs text-muted-foreground">
          {debates.length} stock{debates.length === 1 ? '' : 's'}
        </span>
      </header>

      <ul className="space-y-3">
        {debates.map((d) => (
          <li key={`${d.symbol}-${d.debate_date}`}>
            <Link
              href={`/stocks/${encodeURIComponent(d.symbol)}?tab=debate`}
              className="block rounded-lg border bg-muted/20 p-4 transition-colors hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{d.symbol}</span>
                  {d.confidence_score != null && (
                    <span className="rounded-full border bg-card px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {d.confidence_score}%
                    </span>
                  )}
                </div>
                <ChevronRight
                  className="h-4 w-4 text-muted-foreground"
                  aria-hidden
                />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">
                {d.synthesis}
              </p>
              {d.price_target_p50 != null && (
                <div className="mt-2 flex items-center gap-3 text-[11px] num">
                  <span className="text-red-400">
                    {Number(d.price_target_p10).toFixed(2)}
                  </span>
                  <span className="text-foreground">
                    / {Number(d.price_target_p50).toFixed(2)}
                  </span>
                  <span className="text-emerald-400">
                    / {Number(d.price_target_p90).toFixed(2)}
                  </span>
                </div>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
