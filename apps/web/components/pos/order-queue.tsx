"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { BadgeDollarSign, CheckCircle2, ChevronLeft, Clock3, RefreshCcw, Search, Trash2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  bulkUpdatePosOrderStatus,
  fetchPosOrders,
  fetchPosSession,
  updatePosOrderPaymentStatus,
  updatePosOrderStatus
} from "@/lib/pos-client";
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
        "grid h-10 w-10 place-items-center rounded-full border transition",
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
  onTogglePaymentStatus,
  embedded,
  busy,
  muted,
  exiting
}: {
  order: AdminOrder;
  embedded?: boolean;
  busy: boolean;
  muted?: boolean;
  exiting?: boolean;
  onChangeStatus: (order: AdminOrder, status: "DELIVERED" | "CANCELLED" | "WATCH_LATER") => void;
  onTogglePaymentStatus: (order: AdminOrder) => void;
}) {
  const isTerminal = order.status === "DELIVERED" || order.status === "CANCELLED";
  const isWatchLater = order.status === "WATCH_LATER";
  const isFoodpanda = order.serviceType === "FOODPANDA";
  const isUnpaid = order.paymentStatus === "PENDING";

  return (
    <Card
      className={[
        embedded
          ? "flex h-full flex-col rounded-xl border p-2 shadow-none transition-all duration-150 ease-out transform-gpu"
          : "flex h-full flex-col rounded-xl border p-2.5 shadow-none transition-all duration-150 ease-out transform-gpu",
        isUnpaid ? "border-red-200 bg-red-50/80" : "border-slate-200 bg-white",
        muted ? "pointer-events-none opacity-30" : "",
        exiting ? "pointer-events-none scale-[0.98] translate-y-1 opacity-0" : "",
        busy ? "ring-1 ring-orange-200" : ""
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className={embedded ? "text-[9px] font-semibold uppercase tracking-[0.24em] text-orange-600" : "text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600"}>Order</p>
          <h3 className={embedded ? "mt-0.5 truncate text-[13px] font-black leading-tight text-slate-900" : "mt-0.5 truncate text-[15px] font-black leading-tight text-slate-900"}>{order.orderNumber}</h3>
          <p className={embedded ? "mt-0.5 text-[9px] text-slate-500" : "mt-0.5 text-[10px] text-slate-500"}>
            {order.channel.replaceAll("_", " ")} · {formatDateTime(order.placedAt)}
          </p>
          {isFoodpanda ? (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className={embedded ? "rounded-full bg-orange-100 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.18em] text-orange-700" : "rounded-full bg-orange-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-orange-700"}>
                Foodpanda
              </span>
              <span className={embedded ? "rounded-full bg-slate-100 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.16em] text-slate-700" : "rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-700"}>
                {formatServiceType(order.serviceType)}
              </span>
            </div>
          ) : (
            <p className={embedded ? "mt-0.5 text-[9px] font-semibold text-slate-500" : "mt-0.5 text-[10px] font-semibold text-slate-500"}>{formatServiceType(order.serviceType)}</p>
          )}
        </div>
        <div className="text-right">
          <p className={embedded ? "text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-400" : "text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400"}>Total</p>
          <p className={embedded ? "mt-0.5 text-[13px] font-black text-orange-600" : "mt-0.5 text-[15px] font-black text-orange-600"}>{formatCurrency(order.totalAmount)}</p>
          <p className={embedded ? "text-[9px] text-slate-500" : "text-[10px] text-slate-500"}>{order.items.length} items</p>
        </div>
      </div>

      <div className="mt-1 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={embedded ? "text-[11px] font-semibold leading-tight text-slate-900" : "text-[13px] font-semibold leading-tight text-slate-900"}>{order.customerName}</p>
          {order.customerPhone ? <p className={embedded ? "text-[9px] text-slate-500" : "text-[10px] text-slate-500"}>{order.customerPhone}</p> : null}
          <p className={embedded ? "mt-0.5 text-[9px] text-slate-500" : "mt-0.5 text-[10px] text-slate-500"}>{order.branch}</p>
          {order.foodpandaOrderNumber ? (
            <p className={embedded ? "mt-1 inline-flex rounded-full bg-orange-50 px-1.5 py-0.5 text-[8px] font-bold tracking-[0.14em] text-orange-700" : "mt-1 inline-flex rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold tracking-[0.14em] text-orange-700"}>
              FP: {order.foodpandaOrderNumber}
            </p>
          ) : order.serviceType === "FOODPANDA" ? (
            <p className={embedded ? "mt-1 inline-flex rounded-full bg-orange-50 px-1.5 py-0.5 text-[8px] font-bold tracking-[0.14em] text-orange-700" : "mt-1 inline-flex rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold tracking-[0.14em] text-orange-700"}>
              FP: null
            </p>
          ) : null}
        </div>
        <span
          className={[
            embedded ? "shrink-0 rounded-full px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.15em]" : "shrink-0 rounded-full px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.15em]",
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

      {isUnpaid ? (
        <div className={embedded ? "mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.2em] text-amber-800" : "mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.2em] text-amber-800"}>
          <BadgeDollarSign className={embedded ? "h-2.5 w-2.5" : "h-3 w-3"} />
          Unpaid
        </div>
      ) : null}

      {order.deliveryInstructions ? (
        <div className={embedded ? "mt-1 rounded-lg bg-orange-50 px-1.5 py-1 text-[9px] leading-tight text-slate-700" : "mt-1 rounded-lg bg-orange-50 px-2 py-1.5 text-[10px] leading-tight text-slate-700"}>
          <span className="font-semibold text-orange-700">Note:</span> {order.deliveryInstructions}
        </div>
      ) : null}

      <div className={embedded ? "mt-1 rounded-lg bg-slate-50 px-1.5 py-1 text-[9px] text-slate-700" : "mt-1 rounded-lg bg-slate-50 px-2 py-1.5 text-[10px] text-slate-700"}>
        <p className="font-semibold text-slate-900">Items</p>
        <div className={embedded ? "mt-1 grid grid-cols-1 gap-1" : "mt-1 space-y-1"}>
          {order.items.map((item, index) => (
            <div key={item.id} className={embedded ? "rounded-md bg-white/80 px-1.5 py-1" : "rounded-md bg-white/80 px-2 py-1"}>
              <div className="flex items-start justify-between gap-2">
                <p className={embedded ? "min-w-0 flex-1 font-medium leading-tight text-slate-900" : "min-w-0 flex-1 font-medium leading-tight text-slate-900"}>
                  {index + 1}. {item.quantity}x {item.productName}
                </p>
                <p className={embedded ? "shrink-0 text-[9px] font-semibold text-slate-900" : "shrink-0 font-semibold text-slate-900"}>{formatCurrency(item.unitPrice * item.quantity)}</p>
              </div>
              {item.customDescription ? <p className={embedded ? "mt-0.5 leading-tight text-slate-600" : "mt-0.5 leading-tight text-slate-600"}>{item.customDescription}</p> : null}
              {item.bundleComponents.length ? (
                <p className={embedded ? "mt-0.5 leading-tight text-slate-600" : "mt-0.5 leading-tight text-slate-600"}>
                  Contains: {item.bundleComponents.map((component) => `${component.quantity}x ${component.productName}`).join(", ")}
                </p>
              ) : null}
              {item.addOns.length ? <p className="mt-0.5 leading-tight text-slate-600">{item.addOns.map((addOn) => addOn.optionName).join(", ")}</p> : null}
              {item.note ? <p className="mt-0.5 leading-tight text-slate-600">Note: {item.note}</p> : null}
            </div>
          ))}
        </div>
      </div>

      <div className={embedded ? "mt-auto pt-1.5" : "mt-auto pt-2"}>
        {!isTerminal ? (
          <div className={embedded ? "flex items-center justify-end gap-1" : "flex items-center justify-end gap-1"}>
            <OrderActionButton
              title="Mark completed"
              label="Completed"
              className="border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600"
              icon={<CheckCircle2 className={embedded ? "h-3.5 w-3.5" : "h-4 w-4"} />}
              disabled={busy}
              onClick={() => onChangeStatus(order, "DELIVERED")}
            />
            <OrderActionButton
              title="Discard order"
              label="Discard"
              className="border-red-500 bg-red-500 text-white hover:bg-red-600"
              icon={<Trash2 className={embedded ? "h-3.5 w-3.5" : "h-4 w-4"} />}
              disabled={busy}
              onClick={() => onChangeStatus(order, "CANCELLED")}
            />
            <OrderActionButton
              title="Check later"
              label="Check later"
              className="border-amber-400 bg-amber-400 text-slate-950 hover:bg-amber-500"
              icon={<Clock3 className={embedded ? "h-3.5 w-3.5" : "h-4 w-4"} />}
              disabled={busy || isWatchLater}
              onClick={() => onChangeStatus(order, "WATCH_LATER")}
            />
            <OrderActionButton
              title={isUnpaid ? "Remove unpaid" : "Mark unpaid"}
              label={isUnpaid ? "Remove unpaid" : "Mark unpaid"}
              className="border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
              icon={<BadgeDollarSign className={embedded ? "h-3.5 w-3.5" : "h-4 w-4"} />}
              disabled={busy}
              onClick={() => onTogglePaymentStatus(order)}
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
  onTogglePaymentStatus,
  embedded,
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
  onTogglePaymentStatus: (order: AdminOrder) => void;
  embedded?: boolean;
}) {
  return (
    <Card className={embedded ? "rounded-3xl border-white/10 bg-white/90 p-2.5 shadow-sm" : "rounded-3xl border-white/10 bg-white/90 p-3 shadow-sm"}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-600">{title}</p>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>
        <p className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">{orders.length}</p>
      </div>

      <div className={embedded ? "mt-2 grid gap-2 md:grid-cols-2" : "mt-2 grid gap-1.5 md:grid-cols-2 lg:grid-cols-4"}>
        {orders.length ? (
          orders.map((order) => (
            <CompactOrderCard
              key={order.id}
              order={order}
              embedded={embedded}
              onChangeStatus={onChangeStatus}
              onTogglePaymentStatus={onTogglePaymentStatus}
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

export function PosOrderQueue({ embedded = false }: { embedded?: boolean } = {}) {
  return <PosOrderQueueView embedded={embedded} />;
}

function PosOrderQueueView({ embedded = false }: { embedded?: boolean } = {}) {
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
  const [pendingPaymentStatuses, setPendingPaymentStatuses] = useState<Record<string, AdminOrder["paymentStatus"]>>({});
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
      setPendingPaymentStatuses((current) => {
        const next = { ...current };

        for (const [orderId, expectedStatus] of Object.entries(current)) {
          const serverOrder = data.orders.find((order) => order.id === orderId);
          if (!serverOrder || serverOrder.paymentStatus === expectedStatus) {
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
      const pendingPaymentStatus = pendingPaymentStatuses[order.id];
      if (!pendingStatus && !pendingPaymentStatus) return order;
      return {
        ...order,
        ...(pendingStatus ? { status: pendingStatus } : {}),
        ...(pendingPaymentStatus ? { paymentStatus: pendingPaymentStatus } : {})
      };
    });
    const activeOrders = sourceOrders.filter(
      (order) =>
        (order.status !== "DELIVERED" && order.status !== "CANCELLED" && order.status !== "WATCH_LATER") ||
        exitingOrderIds.includes(order.id)
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
  }, [orders, pendingStatuses, pendingPaymentStatuses, exitingOrderIds]);

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

  async function togglePaymentStatus(order: AdminOrder) {
    const nextStatus = order.paymentStatus === "PAID" ? "PENDING" : "PAID";

    setUpdatingOrderId(order.id);
    setError("");
    setPendingPaymentStatuses((current) => ({
      ...current,
      [order.id]: nextStatus
    }));

    try {
      await updatePosOrderPaymentStatus(order.id, nextStatus);
      scheduleRefresh(scope);
    } catch (updateError) {
      setPendingPaymentStatuses((current) => {
        const next = { ...current };
        delete next[order.id];
        return next;
      });
      setError(updateError instanceof Error ? updateError.message : "Failed to update payment status.");
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
    return <div className={embedded ? "h-full rounded-3xl bg-white p-4 text-sm text-slate-500" : "min-h-[50vh] rounded-3xl bg-white p-6 text-sm text-slate-500"}>Loading order queue...</div>;
  }

  const showingAllLanes = scope === "all";
  const showActiveLane = scope === "active" || showingAllLanes;
  const showWatchLaterLane = scope === "watch_later" || showingAllLanes;
  const showDeliveredLane = scope === "delivered";

  return (
    <div className={embedded ? "flex h-full min-h-0 flex-col gap-2 overflow-y-auto pr-1" : "space-y-2.5"}>
      <div className={embedded ? "flex flex-col gap-2 rounded-3xl border border-white/10 bg-white/90 p-2 text-slate-900 shadow-sm" : "flex flex-col gap-2 rounded-3xl border border-white/10 bg-white/90 p-2.5 text-slate-900 shadow-sm lg:flex-row lg:items-center lg:justify-between"}>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-600">Counter Orders</p>
          <h2 className={embedded ? "mt-0.5 text-[1.2rem] font-black leading-none" : "mt-0.5 text-[1.55rem] font-black leading-none"}>Queue Board</h2>
          <p className={embedded ? "mt-1 text-[10px] text-slate-500" : "mt-1 text-[11px] text-slate-500"}>
            {derived.queuedCount} active orders, {derived.watchLaterOrders.length} watch later, {derived.deliveredOrders.length} completed.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {!embedded ? (
            <Button
              variant="outline"
              className="h-8 border-emerald-200 px-3 text-xs text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
              onClick={() => void markAllCompleted()}
              disabled={!derived.activeOrders.length || !!updatingOrderId}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Mark all completed
            </Button>
          ) : null}
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
          {!embedded ? (
            <Button variant="outline" className="h-8 px-3 text-xs" onClick={() => router.push("/pos")}>
              <ChevronLeft className="h-3.5 w-3.5" />
              Back to POS
            </Button>
          ) : null}
        </div>
      </div>

      <Card className={embedded ? "rounded-3xl border-white/10 bg-white/90 p-2 shadow-sm" : "rounded-3xl border-white/10 bg-white/90 p-2.5 shadow-sm"}>
        <div className={embedded ? "grid gap-1.5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]" : "grid gap-1.5 xl:grid-cols-[minmax(0,1fr)_180px_auto]"}>
          <label className={embedded ? "flex h-9 min-w-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3" : "flex h-10 items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-3"}>
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search order ID, customer, branch, or foodpanda no"
              className="border-0 bg-transparent px-0 text-xs text-slate-900 shadow-none placeholder:text-slate-400 focus-visible:ring-0"
            />
          </label>
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value as QueueScope)}
            className="h-9 rounded-2xl border border-slate-200 bg-white px-3 text-xs text-slate-900"
          >
            {scopeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div className={embedded ? "hidden" : "flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-1.5"}>
            <Truck className="h-3.5 w-3.5 text-orange-600" />
            <p className="text-[11px] font-semibold text-slate-700">Compact receipts with quick one-tap actions.</p>
          </div>
          {embedded ? (
            <div className="xl:col-span-2 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-1.5">
              <Truck className="h-3.5 w-3.5 text-orange-600" />
              <p className="text-[11px] font-semibold text-slate-700">Compact receipts with quick one-tap actions.</p>
            </div>
          ) : null}
        </div>
      </Card>

      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

      <div className={updatingOrderId ? "grid gap-3 opacity-80 transition" : "grid gap-3"}>
        {showActiveLane ? (
          <OrderSection
            title="Active Queue"
            description="Orders waiting to be completed."
            orders={derived.activeOrders}
            embedded={embedded}
            onTogglePaymentStatus={togglePaymentStatus}
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
            embedded={embedded}
            onTogglePaymentStatus={togglePaymentStatus}
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
            embedded={embedded}
            onTogglePaymentStatus={togglePaymentStatus}
            busy={!!updatingOrderId}
            mutedOrderId={updatingOrderId}
            exitingOrderIds={exitingOrderIds}
            onChangeStatus={changeStatus}
            emptyText="No completed orders match the current filter."
          />
        ) : null}

        {scope === "all" && derived.cancelledOrders.length ? (
          <Card className={embedded ? "rounded-3xl border-white/10 bg-white/90 p-2 shadow-sm" : "rounded-3xl border-white/10 bg-white/90 p-2.5 shadow-sm"}>
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
