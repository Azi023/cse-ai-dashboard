'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { isSafeUrl } from '@/lib/safe-url';
import { announcementsApi, type Announcement } from '@/lib/api';
import { Megaphone, Search, Filter, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import Link from 'next/link';

const CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'earnings', label: 'Earnings' },
  { value: 'dividend', label: 'Dividends' },
  { value: 'agm', label: 'AGM/EGM' },
  { value: 'board_change', label: 'Board Changes' },
  { value: 'regulatory', label: 'Regulatory' },
  { value: 'listing', label: 'Listings' },
  { value: 'other', label: 'Other' },
];

const TYPES = [
  { value: '', label: 'All Types' },
  { value: 'financial', label: 'Financial' },
  { value: 'approved', label: 'Approved' },
  { value: 'circular', label: 'Circular' },
  { value: 'directive', label: 'Directive' },
  { value: 'non_compliance', label: 'Non-Compliance' },
  { value: 'new_listing', label: 'New Listing' },
];

function getCategoryBadgeColor(category: string | null): string {
  switch (category) {
    case 'earnings':
      return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
    case 'dividend':
      return 'bg-green-500/15 text-green-400 border-green-500/30';
    case 'agm':
      return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
    case 'board_change':
      return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
    case 'regulatory':
      return 'bg-red-500/15 text-red-400 border-red-500/30';
    case 'listing':
      return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

/** Auto-categorize on the frontend if the backend hasn't done it yet */
function inferCategory(title: string): string {
  const t = title.toLowerCase();
  if (t.includes('interim') || t.includes('quarter') || t.includes('financial statement') || t.includes('annual report'))
    return 'earnings';
  if (t.includes('dividend')) return 'dividend';
  if (t.includes('agm') || t.includes('annual general') || t.includes('egm'))
    return 'agm';
  if (t.includes('director') || t.includes('board') || t.includes('appointment') || t.includes('resignation'))
    return 'board_change';
  if (t.includes('compliance') || t.includes('cse rule') || t.includes('sec'))
    return 'regulatory';
  if (t.includes('listing') || t.includes('ipo')) return 'listing';
  return 'other';
}

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [symbolFilter, setSymbolFilter] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    const fetchAnnouncements = async () => {
      try {
        const params: Record<string, string | number> = { limit: 200 };
        if (selectedType) params.type = selectedType;
        if (symbolFilter.trim()) params.symbol = symbolFilter.trim().toUpperCase();
        if (selectedCategory) params.category = selectedCategory;

        const res = await announcementsApi.getRecent(params);
        setAnnouncements(res.data);
      } catch {
        // silent fail
      } finally {
        setLoading(false);
      }
    };
    fetchAnnouncements();
  }, [selectedType, symbolFilter, selectedCategory]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return announcements;
    const q = searchQuery.toLowerCase();
    return announcements.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        (a.symbol && a.symbol.toLowerCase().includes(q)) ||
        (a.content && a.content.toLowerCase().includes(q)),
    );
  }, [announcements, searchQuery]);

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Announcements</h2>
        <p className="text-muted-foreground">
          CSE company announcements with filtering
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search announcements..."
                className="w-full rounded-md border bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Symbol filter */}
            <input
              type="text"
              value={symbolFilter}
              onChange={(e) => setSymbolFilter(e.target.value)}
              placeholder="Symbol (e.g. JKH)"
              className="w-32 rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />

            {/* Category filter */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Filter by category"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>

            {/* Type filter */}
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Filter by type"
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">
                {filtered.length} announcement{filtered.length !== 1 ? 's' : ''}
              </CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-16 rounded-lg bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No announcements found.
            </p>
          ) : (
            <div className="space-y-2">
              {filtered.map((ann) => {
                const category = ann.category || inferCategory(ann.title);
                const isExpanded = expandedId === ann.id;

                return (
                  <div
                    key={ann.id}
                    className="rounded-lg border p-3 transition-colors hover:bg-muted/20"
                  >
                    <div
                      className="flex items-start justify-between gap-3 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : ann.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          {ann.symbol && (
                            <Link
                              href={`/stocks/${ann.symbol}`}
                              className="text-xs font-semibold text-primary hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {ann.symbol}
                            </Link>
                          )}
                          <Badge
                            variant="outline"
                            className={`text-[10px] h-4 px-1.5 ${getCategoryBadgeColor(category)}`}
                          >
                            {category.replace('_', ' ')}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                            {ann.type}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium leading-snug">
                          {ann.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDate(ann.announced_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {isSafeUrl(ann.url) && (
                          <a
                            href={ann.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {isExpanded && ann.content && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {ann.content}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
