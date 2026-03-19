'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Play,
  Ban,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  RefreshCw,
  Plus,
  Loader2,
} from 'lucide-react';
import { ordersApi, type PendingOrder, type CreateOrderPayload } from '@/lib/api';
import { safeNum } from '@/lib/format';

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  PENDING: { label: 'Pending Approval', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: Clock },
  APPROVED: { label: 'Approved', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: CheckCircle },
  EXECUTING: { label: 'Executing...', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', icon: Loader2 },
  EXECUTED: { label: 'Executed', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: CheckCircle },
  FAILED: { label: 'Failed', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: XCircle },
  CANCELLED: { label: 'Cancelled', color: 'bg-slate-500/20 text-slate-400 border-slate-500/30', icon: Ban },
};

const ORDER_TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  STOP_LOSS: { label: 'Stop-Loss', icon: ShieldAlert, color: 'text-red-400' },
  TAKE_PROFIT: { label: 'Take-Profit', icon: TrendingUp, color: 'text-emerald-400' },
  LIMIT_BUY: { label: 'Limit Buy', icon: TrendingDown, color: 'text-blue-400' },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.PENDING;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.color}`}>
      <Icon className={`w-3 h-3 ${status === 'EXECUTING' ? 'animate-spin' : ''}`} />
      {config.label}
    </span>
  );
}

function OrderTypeBadge({ orderType }: { orderType: string }) {
  const config = ORDER_TYPE_CONFIG[orderType] ?? { label: orderType, icon: Clock, color: 'text-slate-400' };
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-medium ${config.color}`}>
      <Icon className="w-4 h-4" />
      {config.label}
    </span>
  );
}

// ── Confirm dialog state ──────────────────────────────────────────────────────

interface ConfirmState {
  orderId: number;
  action: 'approve' | 'execute' | 'cancel';
  label: string;
  order: PendingOrder;
}

// ── Quick Order form ──────────────────────────────────────────────────────────

interface QuickOrderForm {
  symbol: string;
  order_type: string;
  action: string;
  quantity: string;
  trigger_price: string;
  reason: string;
}

const EMPTY_FORM: QuickOrderForm = {
  symbol: '',
  order_type: 'STOP_LOSS',
  action: 'SELL',
  quantity: '',
  trigger_price: '',
  reason: '',
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [showQuickOrder, setShowQuickOrder] = useState(false);
  const [form, setForm] = useState<QuickOrderForm>(EMPTY_FORM);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const fetchOrders = useCallback(async () => {
    try {
      const filter = statusFilter === 'ALL' ? undefined : statusFilter;
      const res = await ordersApi.list(filter);
      setOrders(res.data);
      setError(null);
    } catch (err) {
      setError('Failed to load orders');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleApprove = (order: PendingOrder) =>
    setConfirm({ orderId: order.id, action: 'approve', label: 'Approve', order });

  const handleExecute = (order: PendingOrder) =>
    setConfirm({ orderId: order.id, action: 'execute', label: 'Execute on ATrad', order });

  const handleCancel = (order: PendingOrder) =>
    setConfirm({ orderId: order.id, action: 'cancel', label: 'Cancel', order });

  const performAction = async () => {
    if (!confirm) return;
    setActionLoading(confirm.orderId);
    setConfirm(null);
    try {
      if (confirm.action === 'approve') await ordersApi.approve(confirm.orderId);
      else if (confirm.action === 'execute') await ordersApi.execute(confirm.orderId);
      else if (confirm.action === 'cancel') await ordersApi.cancel(confirm.orderId);
      await fetchOrders();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Action failed';
      setError(msg);
    } finally {
      setActionLoading(null);
    }
  };

  // ── Quick Order submit ─────────────────────────────────────────────────────

  const submitQuickOrder = async () => {
    if (!form.symbol || !form.quantity || !form.trigger_price) {
      setError('Symbol, quantity, and trigger price are required');
      return;
    }
    setFormSubmitting(true);
    try {
      const payload: CreateOrderPayload = {
        symbol: form.symbol.toUpperCase(),
        order_type: form.order_type,
        action: form.action,
        quantity: parseInt(form.quantity, 10),
        trigger_price: parseFloat(form.trigger_price),
        reason: form.reason || undefined,
      };
      await ordersApi.create(payload);
      setForm(EMPTY_FORM);
      setShowQuickOrder(false);
      await fetchOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create order');
    } finally {
      setFormSubmitting(false);
    }
  };

  // ── Derived state ──────────────────────────────────────────────────────────

  const activeOrders = orders.filter((o) => ['PENDING', 'APPROVED', 'EXECUTING'].includes(o.status));
  const historyOrders = orders.filter((o) => ['EXECUTED', 'FAILED', 'CANCELLED'].includes(o.status));

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Order Management</h1>
            <p className="text-slate-400 text-sm mt-1">
              Review, approve, and execute ATrad orders. No order is placed without your explicit approval.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchOrders} className="border-slate-700">
              <RefreshCw className="w-4 h-4 mr-1" />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setShowQuickOrder(!showQuickOrder)}
              className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-1" />
              Quick Order
            </Button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-red-400 font-medium">Error</p>
              <p className="text-red-300 text-sm">{error}</p>
            </div>
            <button className="ml-auto text-red-400 hover:text-red-300" onClick={() => setError(null)}>✕</button>
          </div>
        )}

        {/* Safety notice */}
        <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-amber-300 text-sm">
            <strong>Safety-first execution:</strong> Orders are only placed on ATrad after you explicitly click
            &quot;Approve&quot; then &quot;Execute&quot;. The executor verifies all form values before submitting.
            The first execution runs with a visible browser so you can watch.
          </p>
        </div>

        {/* Quick Order form */}
        {showQuickOrder && (
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-white">Create Manual Order</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Symbol</label>
                  <Input
                    placeholder="AEL.N0000"
                    value={form.symbol}
                    onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                    className="bg-slate-800 border-slate-600 text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Order Type</label>
                  <select
                    value={form.order_type}
                    onChange={(e) => setForm({ ...form, order_type: e.target.value })}
                    className="w-full h-9 rounded-md border border-slate-600 bg-slate-800 text-white px-3 text-sm"
                  >
                    <option value="STOP_LOSS">Stop-Loss</option>
                    <option value="TAKE_PROFIT">Take-Profit</option>
                    <option value="LIMIT_BUY">Limit Buy</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Action</label>
                  <select
                    value={form.action}
                    onChange={(e) => setForm({ ...form, action: e.target.value })}
                    className="w-full h-9 rounded-md border border-slate-600 bg-slate-800 text-white px-3 text-sm"
                  >
                    <option value="SELL">SELL</option>
                    <option value="BUY">BUY</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Quantity</label>
                  <Input
                    type="number"
                    placeholder="200"
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    className="bg-slate-800 border-slate-600 text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Trigger Price (LKR)</label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="63.00"
                    value={form.trigger_price}
                    onChange={(e) => setForm({ ...form, trigger_price: e.target.value })}
                    className="bg-slate-800 border-slate-600 text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Reason (optional)</label>
                  <Input
                    placeholder="Why this order..."
                    value={form.reason}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                    className="bg-slate-800 border-slate-600 text-white"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button size="sm" onClick={submitQuickOrder} disabled={formSubmitting}
                  className="bg-blue-600 hover:bg-blue-700">
                  {formSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
                  Create Pending Order
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowQuickOrder(false); setForm(EMPTY_FORM); }}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Active Orders (Suggested / Approved) */}
        <Card className="bg-slate-900 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-yellow-400" />
              Suggested Orders
              {activeOrders.length > 0 && (
                <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                  {activeOrders.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => <Skeleton key={i} className="h-16 bg-slate-800" />)}
              </div>
            ) : activeOrders.length === 0 ? (
              <p className="text-slate-500 text-sm py-4 text-center">
                No active orders. The risk service will suggest TP/SL orders daily at 2:44 PM SLT.
              </p>
            ) : (
              <div className="space-y-3">
                {activeOrders.map((order) => (
                  <ActiveOrderCard
                    key={order.id}
                    order={order}
                    actionLoading={actionLoading}
                    onApprove={handleApprove}
                    onExecute={handleExecute}
                    onCancel={handleCancel}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Order History */}
        <Card className="bg-slate-900 border-slate-700">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base text-white">Order History</CardTitle>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-8 rounded-md border border-slate-600 bg-slate-800 text-white px-2 text-xs"
              >
                <option value="ALL">All</option>
                <option value="EXECUTED">Executed</option>
                <option value="FAILED">Failed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-32 bg-slate-800" />
            ) : historyOrders.length === 0 ? (
              <p className="text-slate-500 text-sm py-4 text-center">No order history yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400">ID</TableHead>
                    <TableHead className="text-slate-400">Symbol</TableHead>
                    <TableHead className="text-slate-400">Type</TableHead>
                    <TableHead className="text-slate-400">Qty</TableHead>
                    <TableHead className="text-slate-400">Trigger Price</TableHead>
                    <TableHead className="text-slate-400">Status</TableHead>
                    <TableHead className="text-slate-400">Date</TableHead>
                    <TableHead className="text-slate-400">ATrad ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyOrders.map((order) => (
                    <TableRow key={order.id} className="border-slate-700/50">
                      <TableCell className="text-slate-400 text-sm">#{order.id}</TableCell>
                      <TableCell className="font-mono text-sm text-white">{order.symbol}</TableCell>
                      <TableCell><OrderTypeBadge orderType={order.order_type} /></TableCell>
                      <TableCell className="text-sm text-slate-300">{order.quantity}</TableCell>
                      <TableCell className="text-sm font-mono text-slate-300">
                        LKR {safeNum(order.trigger_price).toFixed(2)}
                      </TableCell>
                      <TableCell><StatusBadge status={order.status} /></TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {order.executed_at
                          ? new Date(order.executed_at).toLocaleDateString()
                          : new Date(order.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-slate-500">
                        {order.atrad_order_id ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Confirm modal */}
      {confirm && (
        <ConfirmModal confirm={confirm} onConfirm={performAction} onDismiss={() => setConfirm(null)} />
      )}
    </main>
  );
}

// ── Active Order Card ─────────────────────────────────────────────────────────

function ActiveOrderCard({
  order,
  actionLoading,
  onApprove,
  onExecute,
  onCancel,
}: {
  order: PendingOrder;
  actionLoading: number | null;
  onApprove: (o: PendingOrder) => void;
  onExecute: (o: PendingOrder) => void;
  onCancel: (o: PendingOrder) => void;
}) {
  const isLoading = actionLoading === order.id;
  return (
    <div className="border border-slate-700 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <span className="font-mono text-white font-semibold">{order.symbol}</span>
            <OrderTypeBadge orderType={order.order_type} />
            <span className="text-xs text-slate-500">#{order.id}</span>
          </div>
          <div className="text-sm text-slate-300 space-x-4">
            <span>
              <span className="text-slate-500">Qty:</span>{' '}
              <strong>{order.quantity} shares</strong>
            </span>
            <span>
              <span className="text-slate-500">Trigger:</span>{' '}
              <strong className="font-mono">LKR {safeNum(order.trigger_price).toFixed(2)}</strong>
            </span>
            {order.source && (
              <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                {order.source.replace('_', ' ')}
              </span>
            )}
          </div>
          {order.reason && (
            <p className="text-xs text-slate-400 max-w-2xl">{order.reason}</p>
          )}
        </div>
        <div className="shrink-0">
          <StatusBadge status={order.status} />
        </div>
      </div>

      <div className="flex gap-2">
        {order.status === 'PENDING' && (
          <>
            <Button
              size="sm"
              onClick={() => onApprove(order)}
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
              <span className="ml-1">Approve</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onCancel(order)}
              disabled={isLoading}
              className="text-slate-400 hover:text-red-400"
            >
              <Ban className="w-3 h-3 mr-1" />
              Cancel
            </Button>
          </>
        )}
        {order.status === 'APPROVED' && (
          <>
            <Button
              size="sm"
              onClick={() => onExecute(order)}
              disabled={isLoading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              <span className="ml-1">Execute on ATrad</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onCancel(order)}
              disabled={isLoading}
              className="text-slate-400 hover:text-red-400"
            >
              <Ban className="w-3 h-3 mr-1" />
              Cancel
            </Button>
          </>
        )}
        {order.status === 'EXECUTING' && (
          <span className="text-sm text-purple-400 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Executing on ATrad... check your browser window
          </span>
        )}
      </div>
    </div>
  );
}

// ── Confirm Modal ─────────────────────────────────────────────────────────────

function ConfirmModal({
  confirm,
  onConfirm,
  onDismiss,
}: {
  confirm: ConfirmState;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const { order, action, label } = confirm;
  const isExecute = action === 'execute';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full space-y-4">
        <div className="flex items-start gap-3">
          {isExecute ? (
            <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
          ) : (
            <ShieldAlert className="w-6 h-6 text-blue-400 shrink-0 mt-0.5" />
          )}
          <div>
            <h3 className="text-white font-semibold">Confirm: {label}</h3>
            <p className="text-slate-400 text-sm mt-1">
              Order #{order.id} — {order.order_type} {order.action} {order.quantity}x{' '}
              <strong>{order.symbol}</strong> @ LKR {safeNum(order.trigger_price).toFixed(2)}
            </p>
          </div>
        </div>

        {isExecute && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-sm text-amber-300">
            This will launch Playwright and place a real order on your ATrad account.
            A browser window will open — watch it carefully. You cannot undo a placed order.
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="ghost" onClick={onDismiss} className="text-slate-400">
            No, go back
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            className={isExecute ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'}
          >
            Yes, {label}
          </Button>
        </div>
      </div>
    </div>
  );
}
