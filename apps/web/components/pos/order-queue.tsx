"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { CheckCircle2, ChevronLeft, Clock3, RefreshCcw, Search, Trash2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { bulkUpdatePosOrderStatus, fetchPosOrders, fetchPosSession, updatePosOrderStatus } from "@/lib/pos-client";
import type { AdminOrder } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

type QueueScope = "active" | "watch_later" | "delivered" | "all";

const scopeOptions: Array<{ value: QueueScope; label: string }> = [
  { value: "active", label: "Active" },
  { value: "watch_later", label: "Watch Later" },
  { value: "delivered", label: "Delivered" },
  { value: "all", label: "All" }
];

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-PK", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatServiceType(value: string) {
  const map: Record<string, string> = {
    INSHOP: "Inshop",
    FOODPANDA: "Foodpanda",
    TAKEAWAY: "Takeaway",
    DINE_IN: "Dine in",
    DELIVERY: "Delivery"
  };

  return map[value] ?? value.replaceAll("_", " ");
}

function formatStatus(value: string) {
  const map: Record<string, string> = {
    PENDING: "Pending",
    CONFIRMED: "Confirmed",
    PREPARING: "Preparing",
    READY: "Ready",
    WATCH_LATER: "Watch later",
    OUT_FOR_DELIVERY: "Out for delivery",
    DELIVERED: "Completed",
    CANCELLED: "Discarded"
  };

  return map[value] ?? value.replaceAll("_", " ");
}

function summarizeItems(items: AdminOrder["items"]) {
  return items
    .slice(0, 3)
    .map((item) => `${item.quantity}x ${item.productName}`)
    .join("  ");
}

function OrderActionButton({
  title,
  label,
  className,
  icon,
  disabled,
  onClick
}: {
  title: string;
  label: string;
  className: string;
  icon: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={[
        "grid h-9 w-9 place-items-center rounded-full border transition",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className
      ].join(" ")}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </button>
  );
}

function CompactOrderCard({
  order,
  onChangeStatus,
  busy,
  muted,
  exiting
}: {
  order: AdminOrder;
  busy: boolean;
  muted?: boolean;
  exiting?: boolean;
  onChangeStatus: (order: AdminOrder, status: "DELIVERED" | "CANCELLED" | "WATCH_LATER") => void;
}) {
  const isTerminal = order.status === "DELIVERED" || order.status === "CANCELLED";
  const isWatchLater = order.status === "WATCH_LATER";

  return (
    <Card
      className={[
        "flex h-full flex-col rounded-xl border border-slate-200 bg-white p-2 shadow-none transition-all duration-150 ease-out transform-gpu",
        muted ? "pointer-events-none opacity-30" : "",
        exiting ? "pointer-events-none scale-[0.98] translate-y-1 opacity-0" : "",
        busy ? "ring-1 ring-orange-200" : ""
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-semibold uppercase tracking-[0.24em] text-orange-600">Order</p>
          <h3 className="mt-0.5 truncate text-[13px] font-black leading-tight text-slate-900">{order.orderNumber}</h3>
          <p className="mt-0.5 text-[9px] text-slate-500">
            {order.channel.replaceAll("_", " ")} · {formatServiceType(order.serviceType)} · {formatDateTime(order.placedAt)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-400">Total</p>
          <p className="mt-0.5 text-[13px] font-black text-orange-600">{formatCurrency(order.totalAmount)}</p>
          <p className="text-[9px] text-slate-500">{order.items.length} items</p>
        </div>
      </div>

      <div className="mt-1 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold leading-tight text-slate-900">{order.customerName}</p>
          {order.customerPhone ? <p className="text-[9px] text-slate-500">{order.customerPhone}</p> : null}
          <p className="mt-0.5 text-[9px] text-slate-500">{order.branch}</p>
          {order.foodpandaOrderNumber ? (
            <p className="mt-0.5 text-[9px] text-slate-500">FP: {order.foodpandaOrderNumber}</p>
          ) : order.serviceType === "FOODPANDA" ? (
            <p className="mt-0.5 text-[9px] text-slate-500">FP: null</p>
          ) : null}
        </div>
        <span
          className={[
            "shrink-0 rounded-full px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.15em]",
            order.status === "DELIVERED"
              ? "bg-emerald-100 text-emerald-700"
              : order.status === "CANCELLED"
                ? "bg-red-100 text-red-700"
                : order.status === "WATCH_LATER"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-slate-100 text-slate-700"
          ].join(" ")}
        >
          {formatStatus(order.status)}
        </span>
      </div>

      {order.deliveryInstructions ? (
        <div className="mt-1 rounded-lg bg-orange-50 px-2 py-1 text-[9px] leading-tight text-slate-700">
          <span className="font-semibold text-orange-700">Note:</span> {order.deliveryInstructions}
        </div>
      ) : null}

      <div className="mt-1 rounded-lg bg-slate-50 px-2 py-1 text-[9px] text-slate-700">
        <p className="font-semibold text-slate-900">Items</p>
        <p className="mt-0.5 leading-4">{summarizeItems(order.items)}</p>
        {order.items.length > 3 ? <p className="mt-0.5 text-[8px] text-slate-400">+{order.items.length - 3} more</p> : null}
      </div>

      <div className="mt-auto pt-2">
        {!isTerminal ? (
          <div className="flex items-center justify-end gap-1">
            <OrderActionButton
              title="Mark completed"
              label="Completed"
              className="border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600"
              icon={<CheckCircle2 className="h-3 w-3" />}
              disabled={busy}
              onClick={() => onChangeStatus(order, "DELIVERED")}
            />
            <OrderActionButton
              title="Discard order"
              label="Discard"
              className="border-red-500 bg-red-500 text-white hover:bg-red-600"
              icon={<Trash2 className="h-3 w-3" />}
              disabled={busy}
              onClick={() => onChangeStatus(order, "CANCELLED")}
            />
            <OrderActionButton
              title="Check later"
              label="Check later"
              className="border-amber-400 bg-amber-400 text-slate-950 hover:bg-amber-500"
              icon={<Clock3 className="h-3 w-3" />}
              disabled={busy || isWatchLater}
              onClick={() => onChangeStatus(order, "WATCH_LATER")}
            />
          </div>
        ) : (
          <p className="text-right text-[11px] text-slate-500">Completed orders are read-only.</p>
        )}
      </div>
    </Card>
  );
}

function OrderSection({
  title,
  description,
  orders,
  onChangeStatus,
  busy,
  mutedOrderId,
  exitingOrderIds,
  emptyText
}: {
  title: string;
  description: string;
  orders: AdminOrder[];
  busy: boolean;
  mutedOrderId: string;
  exitingOrderIds: string[];
  emptyText: string;
  onChangeStatus: (order: AdminOrder, status: "DELIVERED" | "CANCELLED" | "WATCH_LATER") => void;
}) {
  return (
    <Card className="rounded-3xl border-white/10 bg-white/90 p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-600">{title}</p>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>
        <p className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">{orders.length}</p>
      </div>

      <div className="mt-2 grid gap-1.5 md:grid-cols-2 lg:grid-cols-4">
        {orders.length ? (
          orders.map((order) => (
            <CompactOrderCard
              key={order.id}
              order={order}
              onChangeStatus={onChangeStatus}
              busy={busy && order.id === mutedOrderId}
              muted={busy && order.id !== mutedOrderId}
              exiting={exitingOrderIds.includes(order.id)}
            />
          ))
        ) : (
          <Card className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-500">{emptyText}</Card>
        )}
      </div>
    </Card>
  );
}

export function PosOrderQueue() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scope, setScope] = useState<QueueScope>("all");
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [error, setError] = useState("");
  const [updatingOrderId, setUpdatingOrderId] = useState("");
  const [exitingOrderIds, setExitingOrderIds] = useState<string[]>([]);
  const [pendingStatuses, setPendingStatuses] = useState<Record<string, AdminOrder["status"]>>({});
  const [refreshTimer, setRefreshTimer] = useState<number | null>(null);

  async function loadOrders(nextScope = scope) {
    try {
      setError("");
      const data = await fetchPosOrders({ scope: nextScope, search: search.trim() || undefined });
      setOrders(data.orders);
      setPendingStatuses((current) => {
        const next = { ...current };

        for (const [orderId, expectedStatus] of Object.entries(current)) {
          const serverOrder = data.orders.find((order) => order.id === orderId);
          if (!serverOrder || serverOrder.status === expectedStatus) {
            delete next[orderId];
          }
        }

        return next;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load orders.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function scheduleRefresh(nextScope = scope) {
    if (refreshTimer) {
      window.clearTimeout(refreshTimer);
    }

    const timer = window.setTimeout(() => {
      void loadOrders(nextScope);
      setUpdatingOrderId("");
      setRefreshTimer(null);
    }, 140);

    setRefreshTimer(timer);
  }

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        const session = await fetchPosSession();
        if (!["ADMIN", "SUPER_ADMIN", "POS_STAFF"].includes(session.user.role)) {
          router.replace("/pos/login");
          return;
        }

        await loadOrders("all");
        if (!cancelled) {
          setReady(true);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load orders.");
          router.replace("/pos/login");
        }
      }
    }

    void initialize();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      void loadOrders(scope);
    }, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, search, ready]);

  useEffect(() => {
    if (!ready) return;

    const timer = window.setInterval(() => {
      if (!updatingOrderId && !refreshTimer) {
        void loadOrders(scope);
      }
    }, 8000);

    return () => window.clearInterval(timer);
  }, [ready, scope, search, updatingOrderId, refreshTimer]);

  const derived = useMemo(() => {
    const sourceOrders = orders.map((order) => {
      const pendingStatus = pendingStatuses[order.id];
      return pendingStatus ? { ...order, status: pendingStatus } : order;
    });
    const activeOrders = sourceOrders.filter(
      (order) =>
        !(order.status === "DELIVERED" || order.status === "CANCELLED") || exitingOrderIds.includes(order.id)
    );
    const watchLaterOrders = sourceOrders.filter((order) => order.status === "WATCH_LATER");
    const deliveredOrders = sourceOrders.filter((order) => order.status === "DELIVERED");
    const cancelledOrders = sourceOrders.filter((order) => order.status === "CANCELLED");
    const queuedCount = activeOrders.length;

    return {
      activeOrders,
      watchLaterOrders,
      deliveredOrders,
      cancelledOrders,
      queuedCount
    };
  }, [orders, pendingStatuses, exitingOrderIds]);

  async function changeStatus(order: AdminOrder, status: "DELIVERED" | "CANCELLED" | "WATCH_LATER") {
    setUpdatingOrderId(order.id);
    setError("");
    setPendingStatuses((current) => ({
      ...current,
      [order.id]: status
    }));
    const shouldExit = status === "DELIVERED" || status === "CANCELLED";
    if (shouldExit) {
      setExitingOrderIds((current) => (current.includes(order.id) ? current : [...current, order.id]));
      window.setTimeout(() => {
        setExitingOrderIds((current) => current.filter((entryId) => entryId !== order.id));
      }, 220);
    }

    try {
      await updatePosOrderStatus(order.id, status);
      scheduleRefresh(scope);
    } catch (updateError) {
      setPendingStatuses((current) => {
        const next = { ...current };
        delete next[order.id];
        return next;
      });
      if (shouldExit) {
        setExitingOrderIds((current) => current.filter((entryId) => entryId !== order.id));
      }
      setError(updateError instanceof Error ? updateError.message : "Failed to update order status.");
      setUpdatingOrderId("");
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
        setRefreshTimer(null);
      }
    }
  }

  async function markAllCompleted() {
    const activeOrderIds = derived.activeOrders.map((order) => order.id);
    if (!activeOrderIds.length) return;

    setUpdatingOrderId("__bulk__");
    setError("");
    setPendingStatuses((current) => {
      const next = { ...current };
      for (const orderId of activeOrderIds) {
        next[orderId] = "DELIVERED";
      }
      return next;
    });
    setExitingOrderIds((current) => Array.from(new Set([...current, ...activeOrderIds])));
    window.setTimeout(() => {
      setExitingOrderIds((current) => current.filter((entryId) => !activeOrderIds.includes(entryId)));
    }, 220);

    try {
      await bulkUpdatePosOrderStatus(activeOrderIds, "DELIVERED");
      scheduleRefresh(scope);
    } catch (updateError) {
      setPendingStatuses((current) => {
        const next = { ...current };
        for (const orderId of activeOrderIds) {
          delete next[orderId];
        }
        return next;
      });
      setExitingOrderIds((current) => current.filter((entryId) => !activeOrderIds.includes(entryId)));
      setError(updateError instanceof Error ? updateError.message : "Failed to update orders.");
      setUpdatingOrderId("");
    }
  }

  if (!ready || loading) {
    return <div className="min-h-[50vh] rounded-3xl bg-white p-6 text-sm text-slate-500">Loading order queue...</div>;
  }

  const showingAllLanes = scope === "all";
  const showActiveLane = scope === "active" || showingAllLanes;
  const showWatchLaterLane = scope === "watch_later" || showingAllLanes;
  const showDeliveredLane = scope === "delivered";

  return (
    <div className="space-y-2.5">
      <div className="flex flex-col gap-2 rounded-3xl border border-white/10 bg-white/90 p-2.5 text-slate-900 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-600">Counter Orders</p>
          <h2 className="mt-0.5 text-[1.55rem] font-black leading-none">Queue Board</h2>
          <p className="mt-1 text-[11px] text-slate-500">
            {derived.queuedCount} active orders, {derived.watchLaterOrders.length} watch later, {derived.deliveredOrders.length} completed.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant="outline"
            className="h-8 border-emerald-200 px-3 text-xs text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
            onClick={() => void markAllCompleted()}
            disabled={!derived.activeOrders.length || !!updatingOrderId}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Mark all completed
          </Button>
          <Button variant="outline" className="h-8 px-3 text-xs" onClick={() => router.push("/pos")}>
            <ChevronLeft className="h-3.5 w-3.5" />
            Back to POS
          </Button>
          <Button
            variant="outline"
            className="h-8 px-3 text-xs"
            onClick={() => {
              setRefreshing(true);
              void loadOrders(scope);
            }}
            disabled={refreshing}
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      <Card className="rounded-3xl border-white/10 bg-white/90 p-2.5 shadow-sm">
        <div className="grid gap-1.5 xl:grid-cols-[minmax(0,1fr)_180px_auto]">
          <label className="flex h-10 items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-3">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search order ID, customer, branch, or foodpanda no"
              className="border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0"
            />
          </label>
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value as QueueScope)}
            className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-xs"
          >
            {scopeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-1.5">
            <Truck className="h-3.5 w-3.5 text-orange-600" />
            <p className="text-[11px] font-semibold text-slate-700">Compact receipts with quick one-tap actions.</p>
          </div>
        </div>
      </Card>

      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

      <div className={updatingOrderId ? "grid gap-3 opacity-80 transition" : "grid gap-3"}>
        {showActiveLane ? (
          <OrderSection
            title="Active Queue"
            description="Orders waiting to be completed."
            orders={derived.activeOrders}
            busy={!!updatingOrderId}
            mutedOrderId={updatingOrderId}
            exitingOrderIds={exitingOrderIds}
            onChangeStatus={changeStatus}
            emptyText="No active orders match the current filter."
          />
        ) : null}

        {showWatchLaterLane ? (
          <OrderSection
            title="Watch Later"
            description="Orders you want to revisit after the rush."
            orders={derived.watchLaterOrders}
            busy={!!updatingOrderId}
            mutedOrderId={updatingOrderId}
            exitingOrderIds={exitingOrderIds}
            onChangeStatus={changeStatus}
            emptyText="No watch later orders yet."
          />
        ) : null}

        {showDeliveredLane ? (
          <OrderSection
            title="Completed"
            description="Delivered orders are read-only."
            orders={derived.deliveredOrders}
            busy={!!updatingOrderId}
            mutedOrderId={updatingOrderId}
            exitingOrderIds={exitingOrderIds}
            onChangeStatus={changeStatus}
            emptyText="No completed orders match the current filter."
          />
        ) : null}

        {scope === "all" && derived.cancelledOrders.length ? (
          <Card className="rounded-3xl border-white/10 bg-white/90 p-2.5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-600">Discarded</p>
                <p className="mt-1 text-[11px] text-slate-500">Cancelled orders are kept for reference only.</p>
              </div>
              <p className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">{derived.cancelledOrders.length}</p>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
