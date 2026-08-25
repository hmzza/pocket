"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { BadgeDollarSign, Bike, CheckCircle2, Clock3, ListChecks, PencilLine, RefreshCcw, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  bulkUpdatePosOrderStatus,
  deletePosOrder,
  dispatchPosDeliveryOrder,
  fetchPosDeliveryRiders,
  fetchPosOrders,
  fetchPosSession,
  updatePosOrderPaymentStatus,
  updatePosOrderStatus
} from "@/lib/pos-client";
import type { AdminOrder, DeliveryRider } from "@/lib/types";
import { formatCurrency, toBusinessDateInputValue } from "@/lib/utils";

type QueueScope = "active" | "watch_later" | "delivered" | "unpaid" | "all";

const scopeOptions: Array<{ value: QueueScope; label: string }> = [
  { value: "active", label: "Active" },
  { value: "watch_later", label: "Watch Later" },
  { value: "delivered", label: "Delivered" },
  { value: "unpaid", label: "Unpaid" },
  { value: "all", label: "All" }
];

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-PK", {
    timeZone: "Asia/Karachi",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatServiceType(value: string) {
  const map: Record<string, string> = {
    INSHOP: "Dine-in",
    FOODPANDA: "Foodpanda",
    TAKEAWAY: "Takeaway",
    DINE_IN: "Dine-in",
    DELIVERY: "Delivery"
  };

  return map[value] ?? value.replaceAll("_", " ");
}

function formatPaymentMethod(value: string) {
  const map: Record<string, string> = {
    CASH: "Cash",
    CASH_ON_DELIVERY: "Cash on Delivery",
    CARD: "Card",
    ONLINE: "Online",
    JAZZCASH: "JazzCash",
    EASYPAISA: "Easypaisa",
    FOODPANDA_PAYOUT: "Payout"
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
  exiting,
  onEdit,
  onDelete,
  onDetails,
  onDispatchDelivery,
  riders,
  riderPickerOrderId,
  onToggleRiderPicker
}: {
  order: AdminOrder;
  embedded?: boolean;
  busy: boolean;
  muted?: boolean;
  exiting?: boolean;
  onEdit: (order: AdminOrder) => void;
  onDelete: (order: AdminOrder) => void;
  onDetails: (order: AdminOrder) => void;
  onDispatchDelivery: (order: AdminOrder, riderId: string) => void;
  riders: DeliveryRider[];
  riderPickerOrderId: string;
  onToggleRiderPicker: (orderId: string) => void;
  onChangeStatus: (order: AdminOrder, status: "CONFIRMED" | "DELIVERED" | "CANCELLED" | "WATCH_LATER") => void;
  onTogglePaymentStatus: (order: AdminOrder) => void;
}) {
  const isTerminal = order.status === "DELIVERED" || order.status === "CANCELLED";
  const isWatchLater = order.status === "WATCH_LATER";
  const isPaid = order.paymentStatus === "PAID";
  const isUnpaid = order.paymentStatus === "PENDING";
  const isDelivery = order.serviceType === "DELIVERY";
  const canSendDeliveryUpdate = order.status === "CONFIRMED" || order.status === "READY" || order.status === "OUT_FOR_DELIVERY";
  const labelText = isDelivery ? "text-blue-100" : "text-orange-600";
  const primaryText = isDelivery ? "text-white" : "text-slate-900";
  const mutedText = isDelivery ? "text-blue-100" : "text-slate-500";
  const totalText = isDelivery ? "text-white" : "text-orange-600";
  const itemsSurface = isDelivery ? "bg-white/95 text-slate-700 shadow-sm" : "bg-slate-50 text-slate-700";

  return (
    <Card
      className={[
        embedded
          ? "flex h-full flex-col rounded-xl border p-2 shadow-none transition-all duration-150 ease-out transform-gpu"
          : "flex h-full flex-col rounded-xl border p-2.5 shadow-none transition-all duration-150 ease-out transform-gpu",
        isDelivery ? "border-blue-300 bg-gradient-to-br from-blue-700 via-blue-600 to-sky-500 shadow-lg shadow-blue-950/30" : isUnpaid ? "border-red-200 bg-red-50/80" : isPaid ? "border-emerald-200 bg-emerald-50/80" : "border-slate-200 bg-white",
        muted ? "pointer-events-none opacity-30" : "",
        exiting ? "pointer-events-none scale-[0.98] translate-y-1 opacity-0" : "",
        busy ? isDelivery ? "ring-2 ring-sky-200" : "ring-1 ring-orange-200" : ""
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className={`${embedded ? "text-[9px]" : "text-[10px]"} font-semibold uppercase tracking-[0.24em] ${labelText}`}>Order</p>
          <h3 className={`${embedded ? "text-[13px]" : "text-[15px]"} mt-0.5 truncate font-black leading-tight ${primaryText}`}>{order.orderNumber}</h3>
          <p className={`${embedded ? "text-[9px]" : "text-[10px]"} mt-0.5 ${mutedText}`}>
            {order.channel.replaceAll("_", " ")} · {formatDateTime(order.placedAt)}
          </p>
          <p className={`${embedded ? "text-[9px]" : "text-[10px]"} mt-0.5 font-semibold ${mutedText}`}>
            {formatServiceType(order.serviceType)} · {formatPaymentMethod(order.paymentMethod)}
          </p>
        </div>
        <div className="text-right">
          <p className={`${embedded ? "text-[9px]" : "text-[10px]"} font-semibold uppercase tracking-[0.22em] ${mutedText}`}>Total</p>
          <p className={`${embedded ? "text-[13px]" : "text-[15px]"} mt-0.5 font-black ${totalText}`}>{formatCurrency(order.totalAmount)}</p>
          <p className={`${embedded ? "text-[9px]" : "text-[10px]"} ${mutedText}`}>{order.items.length} items</p>
        </div>
      </div>

      <div className="mt-1 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`${embedded ? "text-[11px]" : "text-[13px]"} font-semibold leading-tight ${primaryText}`}>{order.customerName}</p>
          {order.customerPhone ? <p className={`${embedded ? "text-[9px]" : "text-[10px]"} ${mutedText}`}>{order.customerPhone}</p> : null}
          <p className={`${embedded ? "text-[9px]" : "text-[10px]"} mt-0.5 ${mutedText}`}>{order.branch}</p>
          <p className={`${embedded ? "text-[9px]" : "text-[10px]"} mt-0.5 font-medium ${mutedText}`}>{order.channel === "POS" ? `Placed by: ${order.cashierUsername ?? order.cashierName ?? "staff"}` : "Placed via: website customer"}</p>
          {order.foodpandaOrderNumber ? (
            <p className={embedded ? "mt-1 inline-flex rounded-full bg-orange-50 px-2.5 py-0.5 text-[11px] font-black tracking-[0.14em] text-orange-700" : "mt-1 inline-flex rounded-full bg-orange-50 px-3 py-0.5 text-[13px] font-black tracking-[0.14em] text-orange-700"}>
              FP: {order.foodpandaOrderNumber}
            </p>
          ) : order.serviceType === "FOODPANDA" ? (
            <p className={embedded ? "mt-1 inline-flex rounded-full bg-orange-50 px-2.5 py-0.5 text-[11px] font-black tracking-[0.14em] text-orange-700" : "mt-1 inline-flex rounded-full bg-orange-50 px-3 py-0.5 text-[13px] font-black tracking-[0.14em] text-orange-700"}>
              FP: null
            </p>
          ) : null}
        </div>
        {(order.status !== "CONFIRMED" || isPaid || isUnpaid) ? <span
          className={[
            embedded ? "shrink-0 rounded-full px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.15em]" : "shrink-0 rounded-full px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.15em]",
            order.status === "CONFIRMED" && isPaid
              ? "bg-emerald-100 text-emerald-700"
              : order.status === "CONFIRMED" && isUnpaid
                ? "bg-red-100 text-red-700"
                : order.status === "DELIVERED"
              ? "bg-emerald-100 text-emerald-700"
              : order.status === "CANCELLED"
                ? "bg-red-100 text-red-700"
                : order.status === "WATCH_LATER"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-slate-100 text-slate-700"
          ].join(" ")}
        >
          {order.status === "CONFIRMED" && (isPaid || isUnpaid) ? <><BadgeDollarSign className="mr-1 inline-block h-3 w-3" />{isPaid ? "Paid" : "Unpaid"}</> : formatStatus(order.status)}
        </span> : null}
      </div>

      {order.deliveryInstructions ? (
        <div className={`${embedded ? "px-1.5 py-1 text-[9px]" : "px-2 py-1.5 text-[10px]"} mt-1 rounded-lg leading-tight ${isDelivery ? "bg-blue-950/25 text-blue-50" : "bg-orange-50 text-slate-700"}`}>
          <span className={isDelivery ? "font-semibold text-white" : "font-semibold text-orange-700"}>Note:</span> {order.deliveryInstructions}
        </div>
      ) : null}
      {isDelivery && order.deliverySector ? (
        <p className={`${embedded ? "text-[9px]" : "text-[10px]"} mt-1 font-semibold ${isDelivery ? "text-blue-50" : "text-violet-700"}`}>Delivery: {order.deliverySubsector ?? order.deliverySector}</p>
      ) : null}
      {isDelivery && (order.acceptedByName || order.dispatchedByName) ? <p className={`${embedded ? "text-[9px]" : "text-[10px]"} mt-0.5 ${mutedText}`}>{[order.acceptedByName ? `Accepted: ${order.acceptedByName}` : null, order.dispatchedByName ? `Dispatched: ${order.dispatchedByName}` : null].filter(Boolean).join(" · ")}</p> : null}

      <div className={`${embedded ? "px-1.5 py-1 text-[9px]" : "px-2 py-1.5 text-[10px]"} mt-1 rounded-lg ${itemsSurface}`}>
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
          isDelivery ? (
            <div className="flex flex-wrap items-center justify-end gap-1">
              <OrderActionButton
                title="Edit delivery order"
                label="Edit delivery order"
                className="border-white/80 bg-white text-blue-700 hover:bg-blue-50"
                icon={<PencilLine className={embedded ? "h-3.5 w-3.5" : "h-4 w-4"} />}
                disabled={busy}
                onClick={() => onEdit(order)}
              />
              {order.status === "PENDING" ? (
                <OrderActionButton
                  title="Accept delivery order"
                  label="Accept delivery order"
                  className="border-sky-600 bg-sky-600 text-white hover:bg-sky-700"
                  icon={<CheckCircle2 className={embedded ? "h-3.5 w-3.5" : "h-4 w-4"} />}
                  disabled={busy}
                  onClick={() => onChangeStatus(order, "CONFIRMED")}
                />
              ) : null}
              {canSendDeliveryUpdate ? (
                <OrderActionButton
                  title={order.status === "OUT_FOR_DELIVERY" ? "Send updated details to rider" : "Assign rider"}
                  label={order.status === "OUT_FOR_DELIVERY" ? "Send rider update" : "Assign rider"}
                  className="border-violet-600 bg-violet-600 text-white hover:bg-violet-700"
                  icon={<Bike className={embedded ? "h-3.5 w-3.5" : "h-4 w-4"} />}
                  disabled={busy}
                  onClick={() => onToggleRiderPicker(order.id)}
                />
              ) : null}
              {order.status === "OUT_FOR_DELIVERY" ? (
                <OrderActionButton
                  title="Mark delivery complete"
                  label="Mark delivery complete"
                  className="border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600"
                  icon={<CheckCircle2 className={embedded ? "h-3.5 w-3.5" : "h-4 w-4"} />}
                  disabled={busy}
                  onClick={() => onChangeStatus(order, "DELIVERED")}
                />
              ) : null}
              {riderPickerOrderId === order.id ? riders.length ? riders.map((rider) => (
                <button key={rider.id} type="button" className="h-10 rounded-full border border-white/70 bg-white px-3 text-[11px] font-bold text-blue-700 hover:bg-blue-50" disabled={busy} onClick={() => onDispatchDelivery(order, rider.id)}>{rider.name} · {order.status === "OUT_FOR_DELIVERY" ? "Send update" : "WhatsApp"}</button>
              )) : <p className="text-[10px] font-semibold text-blue-50">Add an active rider in Users first.</p> : null}
              <OrderActionButton
                title="Cancel order"
                label="Cancel"
                className="border-red-500 bg-red-500 text-white hover:bg-red-600"
                icon={<Trash2 className={embedded ? "h-3.5 w-3.5" : "h-4 w-4"} />}
                disabled={busy}
                onClick={() => onChangeStatus(order, "CANCELLED")}
              />
              <OrderActionButton
                title={isUnpaid ? "Mark paid" : "Mark unpaid"}
                label={isUnpaid ? "Mark paid" : "Mark unpaid"}
                className="border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
                icon={<BadgeDollarSign className={embedded ? "h-3.5 w-3.5" : "h-4 w-4"} />}
                disabled={busy}
                onClick={() => onTogglePaymentStatus(order)}
              />
            </div>
          ) : (
          <div className={embedded ? "flex items-center justify-end gap-1" : "flex items-center justify-end gap-1"}>
            <OrderActionButton
              title="Edit order"
              label="Edit"
              className="border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
              icon={<PencilLine className={embedded ? "h-3.5 w-3.5" : "h-4 w-4"} />}
              disabled={busy}
              onClick={() => onEdit(order)}
            />
            <OrderActionButton
              title="Mark completed"
              label="Completed"
              className="border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600"
              icon={<CheckCircle2 className={embedded ? "h-3.5 w-3.5" : "h-4 w-4"} />}
              disabled={busy}
              onClick={() => onChangeStatus(order, "DELIVERED")}
            />
            <OrderActionButton
              title="Delete order"
              label="Delete"
              className="border-red-500 bg-red-500 text-white hover:bg-red-600"
              icon={<Trash2 className={embedded ? "h-3.5 w-3.5" : "h-4 w-4"} />}
              disabled={busy}
              onClick={() => onDelete(order)}
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
              title={isUnpaid ? "Mark paid" : "Mark unpaid"}
              label={isUnpaid ? "Mark paid" : "Mark unpaid"}
              className="border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
              icon={<BadgeDollarSign className={embedded ? "h-3.5 w-3.5" : "h-4 w-4"} />}
              disabled={busy}
              onClick={() => onTogglePaymentStatus(order)}
            />
          </div>
          )
        ) : (
          <p className={`text-right text-[11px] ${mutedText}`}>Completed orders are read-only.</p>
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
  onEdit,
  onDelete,
  onDetails,
  onDispatchDelivery,
  riders,
  riderPickerOrderId,
  onToggleRiderPicker,
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
  onChangeStatus: (order: AdminOrder, status: "CONFIRMED" | "DELIVERED" | "CANCELLED" | "WATCH_LATER") => void;
  onTogglePaymentStatus: (order: AdminOrder) => void;
  onEdit: (order: AdminOrder) => void;
  onDelete: (order: AdminOrder) => void;
  onDetails: (order: AdminOrder) => void;
  onDispatchDelivery: (order: AdminOrder, riderId: string) => void;
  riders: DeliveryRider[];
  riderPickerOrderId: string;
  onToggleRiderPicker: (orderId: string) => void;
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
              onEdit={onEdit}
              onDelete={onDelete}
              onDetails={onDetails}
              onDispatchDelivery={onDispatchDelivery}
              riders={riders}
              riderPickerOrderId={riderPickerOrderId}
              onToggleRiderPicker={onToggleRiderPicker}
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

export function PosOrderQueue({
  embedded = false,
  todayOnly = false,
  onEditOrder
}: {
  embedded?: boolean;
  todayOnly?: boolean;
  onEditOrder?: (orderNumber: string) => void;
} = {}) {
  return <PosOrderQueueView embedded={embedded} todayOnly={todayOnly} onEditOrder={onEditOrder} />;
}

function PosOrderQueueView({
  embedded = false,
  todayOnly = false,
  onEditOrder
}: {
  embedded?: boolean;
  todayOnly?: boolean;
  onEditOrder?: (orderNumber: string) => void;
} = {}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scope, setScope] = useState<QueueScope>("all");
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [updatingOrderId, setUpdatingOrderId] = useState("");
  const [exitingOrderIds, setExitingOrderIds] = useState<string[]>([]);
  const [riderPickerOrderId, setRiderPickerOrderId] = useState("");
  const [riders, setRiders] = useState<DeliveryRider[]>([]);
  const [pendingStatuses, setPendingStatuses] = useState<Record<string, AdminOrder["status"]>>({});
  const [pendingPaymentStatuses, setPendingPaymentStatuses] = useState<Record<string, AdminOrder["paymentStatus"]>>({});
  const [refreshTimer, setRefreshTimer] = useState<number | null>(null);
  const loadSequenceRef = useRef(0);
  const initialLoadRef = useRef(false);

  function broadcastQueueRefresh() {
    window.localStorage.setItem("pocket-pos-queue-refresh", String(Date.now()));
  }

  async function loadOrders(nextScope = scope) {
    const requestSequence = ++loadSequenceRef.current;
    try {
      setError("");
      setNotice("");
      const data = await fetchPosOrders({ scope: todayOnly ? "all" : nextScope, search: search.trim() || undefined, today: todayOnly });
      if (requestSequence !== loadSequenceRef.current) return;
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
      if (requestSequence !== loadSequenceRef.current) return;
      setError(loadError instanceof Error ? loadError.message : "Failed to load orders.");
    } finally {
      if (requestSequence === loadSequenceRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
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
        if (
          !session.user.canAccessPos &&
          !["ADMIN", "SUPER_ADMIN", "POS_STAFF"].includes(session.user.role)
        ) {
          router.replace("/pos/login");
          return;
        }

        const [_, deliveryRiders] = await Promise.all([loadOrders("all"), fetchPosDeliveryRiders()]);
        if (!cancelled) setRiders(deliveryRiders);
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
    if (!initialLoadRef.current) {
      initialLoadRef.current = true;
      return;
    }
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
    }, 3000);

    const refreshQueue = () => {
      void loadOrders(scope);
    };
    const refreshFromStorage = (event: StorageEvent) => {
      if (event.key === "pocket-pos-queue-refresh") refreshQueue();
    };
    window.addEventListener("pos-order-created", refreshQueue);
    window.addEventListener("pos-order-updated", refreshQueue);
    window.addEventListener("focus", refreshQueue);
    window.addEventListener("storage", refreshFromStorage);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pos-order-created", refreshQueue);
      window.removeEventListener("pos-order-updated", refreshQueue);
      window.removeEventListener("focus", refreshQueue);
      window.removeEventListener("storage", refreshFromStorage);
    };
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
    }).sort((first, second) => {
      const placedAtDifference = new Date(first.placedAt).getTime() - new Date(second.placedAt).getTime();
      return placedAtDifference || first.id.localeCompare(second.id);
    });
    const currentBusinessDate = toBusinessDateInputValue(new Date());
    const activeOrders = sourceOrders.filter(
      (order) =>
        ((order.status !== "DELIVERED" && order.status !== "CANCELLED" && order.status !== "WATCH_LATER") &&
          toBusinessDateInputValue(order.placedAt) === currentBusinessDate) ||
        exitingOrderIds.includes(order.id)
    );
    const watchLaterOrders = sourceOrders.filter((order) => order.status === "WATCH_LATER");
    const deliveredOrders = sourceOrders.filter((order) => order.status === "DELIVERED");
    const unpaidOrders = sourceOrders.filter((order) => order.paymentStatus === "PENDING");
    const queuedCount = activeOrders.length;

    return {
      activeOrders,
      watchLaterOrders,
      deliveredOrders,
      unpaidOrders,
      todayOrders: sourceOrders,
      queuedCount
    };
  }, [orders, pendingStatuses, pendingPaymentStatuses, exitingOrderIds]);

  async function changeStatus(order: AdminOrder, status: "CONFIRMED" | "DELIVERED" | "CANCELLED" | "WATCH_LATER") {
    setUpdatingOrderId(order.id);
    setError("");
    setNotice("");
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
      broadcastQueueRefresh();
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

  async function dispatchDelivery(order: AdminOrder, riderId: string) {
    const rider = riders.find((entry) => entry.id === riderId);
    if (!rider) {
      setError("Select an active rider before dispatching.");
      return;
    }
    const whatsappWindow = window.open("", "_blank");
    setUpdatingOrderId(order.id);
    setError("");
    setNotice("");
    try {
      const result = await dispatchPosDeliveryOrder(order.id, riderId);
      if (whatsappWindow) {
        whatsappWindow.location.assign(result.whatsappUrl);
      } else {
        window.location.assign(result.whatsappUrl);
      }
      setPendingStatuses((current) => ({ ...current, [order.id]: "OUT_FOR_DELIVERY" }));
      setRiderPickerOrderId("");
      setNotice(result.resentToRider ? `${order.orderNumber} delivery update sent to ${rider.name}.` : `${order.orderNumber} dispatched to ${rider.name}.`);
      broadcastQueueRefresh();
      scheduleRefresh(scope);
    } catch (dispatchError) {
      whatsappWindow?.close();
      setError(dispatchError instanceof Error ? dispatchError.message : "Failed to assign the delivery rider.");
      setUpdatingOrderId("");
    }
  }

  async function togglePaymentStatus(order: AdminOrder) {
    const nextStatus = order.paymentStatus === "PAID" ? "PENDING" : "PAID";
    const resolvedNextStatus = order.paymentStatus === "UNSET" ? "PENDING" : nextStatus;

    setUpdatingOrderId(order.id);
    setError("");
    setNotice("");
    setPendingPaymentStatuses((current) => ({
      ...current,
      [order.id]: resolvedNextStatus
    }));

    try {
      await updatePosOrderPaymentStatus(order.id, resolvedNextStatus);
      broadcastQueueRefresh();
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
    const activeOrderIds = derived.activeOrders.filter((order) => order.serviceType !== "DELIVERY").map((order) => order.id);
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
      broadcastQueueRefresh();
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

  function openEdit(order: AdminOrder) {
    if (onEditOrder) {
      onEditOrder(order.orderNumber);
      return;
    }

    window.open(`/pos?orderNumber=${encodeURIComponent(order.orderNumber)}`, "_blank", "noopener,noreferrer");
  }

  async function deleteOrder(order: AdminOrder) {
    const confirmed = window.confirm(`Delete ${order.orderNumber}? This permanently removes the order and returns inventory if needed.`);
    if (!confirmed) return;

    setUpdatingOrderId(order.id);
    setError("");
    setNotice("");
    setExitingOrderIds((current) => (current.includes(order.id) ? current : [...current, order.id]));

    try {
      await deletePosOrder(order.id);
      broadcastQueueRefresh();
      setOrders((current) => current.filter((entry) => entry.id !== order.id));
      setPendingStatuses((current) => {
        const next = { ...current };
        delete next[order.id];
        return next;
      });
      setPendingPaymentStatuses((current) => {
        const next = { ...current };
        delete next[order.id];
        return next;
      });
      setNotice(`${order.orderNumber} deleted.`);
      scheduleRefresh(scope);
    } catch (deleteError) {
      setExitingOrderIds((current) => current.filter((entryId) => entryId !== order.id));
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete order.");
      setUpdatingOrderId("");
    }
  }

  function openDetails(order: AdminOrder) {
    window.open(`/pos/receipt/${encodeURIComponent(order.id)}`, "_blank", "noopener,noreferrer");
  }

  if (!ready || loading) {
    return <div className={embedded ? "h-full rounded-3xl bg-white p-4 text-sm text-slate-500" : "min-h-[50vh] rounded-3xl bg-white p-6 text-sm text-slate-500"}>Loading order queue...</div>;
  }

  const showingAllLanes = !todayOnly && scope === "all";
  const showActiveLane = scope === "active" || showingAllLanes;
  const showWatchLaterLane = scope === "watch_later" || showingAllLanes;
  const showDeliveredLane = scope === "delivered";
  const showUnpaidLane = scope === "unpaid";

  return (
    <div className={embedded ? "flex h-full min-h-0 flex-col gap-2 overflow-y-auto pr-1" : "space-y-2.5"}>
      <div className={embedded ? "flex items-start justify-between gap-2 rounded-3xl border border-white/10 bg-white/90 p-2 text-slate-900 shadow-sm" : "flex flex-col gap-2 rounded-3xl border border-white/10 bg-white/90 p-2.5 text-slate-900 shadow-sm lg:flex-row lg:items-center lg:justify-between"}>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-600">Orders & delivery</p>
          <h2 className={embedded ? "mt-0.5 text-[1.2rem] font-black leading-none" : "mt-0.5 text-[1.55rem] font-black leading-none"}>Queue Board</h2>
          <p className={embedded ? "mt-1 text-[10px] text-slate-500" : "mt-1 text-[11px] text-slate-500"}>
            {todayOnly ? `${derived.todayOrders.length} orders in this business day.` : `${derived.queuedCount} active orders today, ${derived.watchLaterOrders.length} watch later, ${derived.deliveredOrders.length} completed.`}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          {embedded ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="h-8 w-8 px-0"
                title="Mark all orders as complete"
                aria-label="Mark all orders as complete"
                onClick={() => void markAllCompleted()}
                disabled={!derived.activeOrders.length || !!updatingOrderId}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-8 w-8 px-0"
                title="Refresh queue"
                aria-label="Refresh queue"
                onClick={() => {
                  setRefreshing(true);
                  void loadOrders(scope);
                }}
                disabled={refreshing}
              >
                <RefreshCcw className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : null}
          {todayOnly && !embedded ? (
            <Button variant="outline" className="h-8 px-3 text-xs" onClick={() => router.push("/pos/queue")}>
              <ListChecks className="h-3.5 w-3.5" />
              Open Queue
            </Button>
          ) : null}
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
          {!embedded ? (
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
          {!todayOnly ? <select
            value={scope}
            onChange={(event) => setScope(event.target.value as QueueScope)}
            className="h-9 rounded-2xl border border-slate-200 bg-white px-3 text-xs text-slate-900"
          >
            {scopeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select> : <div className="flex h-9 items-center rounded-2xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700">Business day orders · 6AM-6AM PKT</div>}
        </div>
      </Card>

      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
      {notice ? <p className="text-sm font-medium text-emerald-700">{notice}</p> : null}

      <div className={updatingOrderId ? "grid gap-3 opacity-80 transition" : "grid gap-3"}>
        {todayOnly ? (
          <OrderSection
            title="Business Day Orders"
            description="Every order punched in the 6AM-6AM Pakistan business day."
            orders={derived.todayOrders}
            embedded={embedded}
            onTogglePaymentStatus={togglePaymentStatus}
            busy={false}
            mutedOrderId=""
            exitingOrderIds={[]}
            onChangeStatus={changeStatus}
            onEdit={openEdit}
            onDelete={deleteOrder}
            onDetails={openDetails}
            onDispatchDelivery={dispatchDelivery}
            riders={riders}
            riderPickerOrderId={riderPickerOrderId}
            onToggleRiderPicker={(orderId) => setRiderPickerOrderId((current) => current === orderId ? "" : orderId)}
            emptyText="No orders have been punched in this business day."
          />
        ) : null}
        {showActiveLane ? (
          <OrderSection
            title="Active Queue"
            description="Current 6AM-6AM business day orders waiting to be completed."
            orders={derived.activeOrders}
            embedded={embedded}
            onTogglePaymentStatus={togglePaymentStatus}
            busy={!!updatingOrderId}
            mutedOrderId={updatingOrderId}
            exitingOrderIds={exitingOrderIds}
            onChangeStatus={changeStatus}
            onEdit={openEdit}
            onDelete={deleteOrder}
            onDetails={openDetails}
            onDispatchDelivery={dispatchDelivery}
            riders={riders}
            riderPickerOrderId={riderPickerOrderId}
            onToggleRiderPicker={(orderId) => setRiderPickerOrderId((current) => current === orderId ? "" : orderId)}
            emptyText="No active orders match the current filter."
          />
        ) : null}

        {showWatchLaterLane ? (
          <OrderSection
            title="Watch Later"
            description="All orders saved for later follow-up."
            orders={derived.watchLaterOrders}
            embedded={embedded}
            onTogglePaymentStatus={togglePaymentStatus}
            busy={!!updatingOrderId}
            mutedOrderId={updatingOrderId}
            exitingOrderIds={exitingOrderIds}
            onChangeStatus={changeStatus}
            onEdit={openEdit}
            onDelete={deleteOrder}
            onDetails={openDetails}
            onDispatchDelivery={dispatchDelivery}
            riders={riders}
            riderPickerOrderId={riderPickerOrderId}
            onToggleRiderPicker={(orderId) => setRiderPickerOrderId((current) => current === orderId ? "" : orderId)}
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
            onEdit={openEdit}
            onDelete={deleteOrder}
            onDetails={openDetails}
            onDispatchDelivery={dispatchDelivery}
            riders={riders}
            riderPickerOrderId={riderPickerOrderId}
            onToggleRiderPicker={(orderId) => setRiderPickerOrderId((current) => current === orderId ? "" : orderId)}
            emptyText="No completed orders match the current filter."
          />
        ) : null}
        {showUnpaidLane ? (
          <OrderSection
            title="Unpaid Orders"
            description="Orders with payment still marked as pending."
            orders={derived.unpaidOrders}
            embedded={embedded}
            onTogglePaymentStatus={togglePaymentStatus}
            busy={!!updatingOrderId}
            mutedOrderId={updatingOrderId}
            exitingOrderIds={exitingOrderIds}
            onChangeStatus={changeStatus}
            onEdit={openEdit}
            onDelete={deleteOrder}
            onDetails={openDetails}
            onDispatchDelivery={dispatchDelivery}
            riders={riders}
            riderPickerOrderId={riderPickerOrderId}
            onToggleRiderPicker={(orderId) => setRiderPickerOrderId((current) => current === orderId ? "" : orderId)}
            emptyText="No unpaid orders match the current filter."
          />
        ) : null}
      </div>
    </div>
  );
}
