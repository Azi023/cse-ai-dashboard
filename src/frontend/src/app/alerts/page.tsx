'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { alertsApi, type AlertRecord } from '@/lib/api';
import { Bell, Plus, Trash2, CheckCheck, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function getAlertTypeIcon(type: string) {
  switch (type) {
    case 'price_above':
      return <TrendingUp className="h-4 w-4 text-green-500" />;
    case 'price_below':
      return <TrendingDown className="h-4 w-4 text-red-500" />;
    case 'auto_generated':
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    default:
      return <Bell className="h-4 w-4 text-muted-foreground" />;
  }
}

export default function AlertsPage() {
  const [notifications, setNotifications] = useState<AlertRecord[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<AlertRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Form state
  const [formSymbol, setFormSymbol] = useState('');
  const [formType, setFormType] = useState('price_above');
  const [formThreshold, setFormThreshold] = useState('');

  useEffect(() => {
    Promise.allSettled([
      alertsApi.getNotifications(),
      alertsApi.getActive(),
    ]).then(([notifRes, activeRes]) => {
      if (notifRes.status === 'fulfilled') setNotifications(notifRes.value.data);
      if (activeRes.status === 'fulfilled') setActiveAlerts(activeRes.value.data);
      setLoading(false);
    });
  }, []);

  const handleCreate = async () => {
    if (!formSymbol || !formThreshold) return;
    const title =
      formType === 'price_above'
        ? `${formSymbol.toUpperCase()} above Rs. ${formThreshold}`
        : `${formSymbol.toUpperCase()} below Rs. ${formThreshold}`;

    try {
      const res = await alertsApi.create({
        symbol: formSymbol,
        alert_type: formType,
        title,
        threshold: parseFloat(formThreshold),
      });
      setActiveAlerts((prev) => [res.data, ...prev]);
      setFormSymbol('');
      setFormThreshold('');
      setShowCreateForm(false);
    } catch {
      // silent
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await alertsApi.delete(id);
      setActiveAlerts((prev) => prev.filter((a) => a.id !== id));
      setNotifications((prev) => prev.filter((a) => a.id !== id));
    } catch {
      // silent
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await alertsApi.markAllRead();
      setNotifications((prev) => prev.map((a) => ({ ...a, is_read: true })));
    } catch {
      // silent
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Alerts</h2>
          <p className="text-muted-foreground">
            Price alerts, notifications & auto-generated warnings
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </button>
          )}
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Alert
          </button>
        </div>
      </div>

      {/* Create Alert Form */}
      {showCreateForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Create Price Alert</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <input
                type="text"
                placeholder="Symbol"
                value={formSymbol}
                onChange={(e) => setFormSymbol(e.target.value)}
                className="w-32 rounded-md border bg-background px-3 py-2 text-sm"
              />
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                className="rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="price_above">Price Above</option>
                <option value="price_below">Price Below</option>
              </select>
              <input
                type="number"
                placeholder="Price threshold"
                value={formThreshold}
                onChange={(e) => setFormThreshold(e.target.value)}
                step="0.01"
                className="w-40 rounded-md border bg-background px-3 py-2 text-sm"
              />
              <button
                onClick={handleCreate}
                disabled={!formSymbol || !formThreshold}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                Create
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="notifications" className="space-y-4">
        <TabsList>
          <TabsTrigger value="notifications" className="gap-1">
            <Bell className="h-3 w-3" />
            Notifications
            {unreadCount > 0 && (
              <Badge variant="destructive" className="ml-1 h-4 px-1.5 text-[10px]">
                {unreadCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="active" className="gap-1">
            Active Alerts ({activeAlerts.length})
          </TabsTrigger>
        </TabsList>

        {/* Notifications */}
        <TabsContent value="notifications">
          <Card>
            <CardContent className="pt-4">
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-14 rounded bg-muted/30 animate-pulse" />
                  ))}
                </div>
              ) : notifications.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No notifications yet. Create alerts or wait for auto-generated alerts during market hours.
                </p>
              ) : (
                <div className="space-y-2">
                  {notifications.map((notif) => (
                    <div
                      key={notif.id}
                      className={`flex items-start justify-between gap-3 rounded-lg border p-3 transition-colors ${
                        notif.alert_type === 'auto_generated'
                          ? 'warning-tint'
                          : !notif.is_read
                          ? 'border-primary/30 bg-primary/5'
                          : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {getAlertTypeIcon(notif.alert_type)}
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{notif.title}</p>
                            {!notif.is_read && (
                              <span className="h-2 w-2 rounded-full bg-primary" />
                            )}
                          </div>
                          {notif.message && (
                            <div className="text-xs text-muted-foreground mt-1 leading-relaxed prose prose-xs dark:prose-invert max-w-none [&>p]:mt-1 [&>p]:mb-0 [&>ul]:mt-1 [&>ul]:mb-0 [&>h1]:text-sm [&>h2]:text-xs [&>h3]:text-xs [&>strong]:font-semibold [&>strong]:text-foreground">
                              {notif.message.includes('\n') || notif.message.includes('#') || notif.message.includes('**') ? (
                                <ReactMarkdown>{notif.message}</ReactMarkdown>
                              ) : (
                                <p>{notif.message}</p>
                              )}
                            </div>
                          )}
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {formatDate(notif.triggered_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {notif.symbol && (
                          <Link
                            href={`/stocks/${notif.symbol}`}
                            className="text-xs text-primary hover:underline"
                          >
                            {notif.symbol}
                          </Link>
                        )}
                        <button
                          onClick={() => handleDelete(notif.id)}
                          className="text-muted-foreground hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Active Alerts */}
        <TabsContent value="active">
          <Card>
            <CardContent className="pt-4">
              {activeAlerts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No active alerts. Create one to get notified on price changes.
                </p>
              ) : (
                <div className="space-y-2">
                  {activeAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex items-center gap-3">
                        {getAlertTypeIcon(alert.alert_type)}
                        <div>
                          <p className="text-sm font-medium">{alert.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {alert.alert_type === 'price_above' ? 'Notify when above' : 'Notify when below'}{' '}
                            Rs. {Number(alert.threshold).toFixed(2)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {alert.symbol && (
                          <Badge variant="secondary" className="text-xs">
                            {alert.symbol}
                          </Badge>
                        )}
                        <button
                          onClick={() => handleDelete(alert.id)}
                          className="text-muted-foreground hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
