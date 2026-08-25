"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing, Check, ChefHat, Eye, PackageCheck, PencilLine, RefreshCcw, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { deleteAdminOrder, deleteAllAdminOrders, fetchAdminOrders, updateAdminOrderStatus } from "@/lib/admin-client";
import type { AdminOrder, AdminOrderSegment, AdminRangePreset } from "@/lib/types";
import { formatCurrency, getCurrentBusinessDateKey, toPakistanDateIso } from "@/lib/utils";
import { useOrderAlarm } from "@/components/admin/use-order-alarm";

const segments: Array<{ value: AdminOrderSegment; label: string }> = [
  { value: "all", label: "All" },
  { value: "delivery", label: "Delivery" },
  { value: "takeaway", label: "Takeaway" },
  { value: "inshop", label: "Dine-in / Takeaway" },
  { value: "foodpanda", label: "Foodpanda Orders" }
];

type StatusFilter = "all" | "pending" | "preparing" | "ready" | "out_for_delivery" | "delivered" | "cancelled";

const statusFilters: Array<{ value: StatusFilter; label: string; statuses?: string[] }> = [
  { value: "all", label: "All Statuses" },
  { value: "pending", label: "Awaiting Acceptance", statuses: ["PENDING"] },
  // Accepting an order lands it here, and it stays until the kitchen says ready.
  { value: "preparing", label: "Preparing", statuses: ["CONFIRMED", "PREPARING", "WATCH_LATER"] },
  // Marking ready is what calls an assigned rider out on WhatsApp.
  { value: "ready", label: "Ready", statuses: ["READY"] },
  { value: "out_for_delivery", label: "Out For Delivery", statuses: ["OUT_FOR_DELIVERY"] },
  { value: "delivered", label: "Completed", statuses: ["DELIVERED"] },
  { value: "cancelled", label: "Cancelled", statuses: ["CANCELLED"] }
];

const statusStyles: Record<string, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  CONFIRMED: "border-sky-200 bg-sky-50 text-sky-700",
  PREPARING: "border-sky-200 bg-sky-50 text-sky-700",
  READY: "border-indigo-200 bg-indigo-50 text-indigo-700",
  WATCH_LATER: "border-pocket-navy/15 bg-pocket-cream text-pocket-navy/70",
  OUT_FOR_DELIVERY: "border-orange-200 bg-orange-50 text-orange-700",
  DELIVERED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  CANCELLED: "border-red-200 bg-red-50 text-red-700"
};

function formatStatus(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const presets: Array<{ value: AdminRangePreset; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "month", label: "This Month" },
  { value: "year", label: "This Year" },
  { value: "custom", label: "Custom" }
];

/** Fast enough that staff see a new order promptly, slow enough to be cheap. */
const ORDER_POLL_MS = 20_000;

type PaymentFilter = "all" | "cash" | "easypaisa" | "jazzcash" | "foodpanda";

const paymentFilters: Array<{ value: PaymentFilter; label: string; method?: string }> = [
  { value: "all", label: "All Payments" },
  { value: "cash", label: "Cash", method: "CASH" },
  { value: "easypaisa", label: "Easypaisa", method: "EASYPAISA" },
  { value: "jazzcash", label: "JazzCash", method: "JAZZCASH" },
  { value: "foodpanda", label: "Foodpanda Payout", method: "FOODPANDA_PAYOUT" }
];

const orderGridColumns =
  "grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.85fr)_minmax(0,0.6fr)_minmax(0,0.35fr)_minmax(0,0.7fr)_minmax(0,0.95fr)] gap-4";

function getTodayDateKey() {
  return getCurrentBusinessDateKey();
}

function formatServiceType(value: string) {
  if (["INSHOP", "DINE_IN"].includes(value)) return "Dine-in";
  if (value === "TAKEAWAY") return "Takeaway";
  if (value === "FOODPANDA") return "Foodpanda";
  return value.replaceAll("_", " ");
}

function formatPaymentMethod(value: string) {
  const map: Record<string, string> = {
    CASH: "Cash",
    CASH_ON_DELIVERY: "Cash on Delivery",
    CARD: "Card",
    ONLINE: "Online",
    JAZZCASH: "JazzCash",
    EASYPAISA: "Easypaisa",
    FOODPANDA_PAYOUT: "Foodpanda payout"
  };

  return map[value] ?? value.replaceAll("_", " ");
}

function formatBundleSummary(components: Array<{ productName: string; quantity: number }>) {
  return components.map((component) => `${component.quantity}x ${component.productName}`).join(", ");
}

function OrderDetails({ order }: { order: AdminOrder }) {
  return (
    <div className="grid gap-6 rounded-lg bg-pocket-cream p-5 lg:grid-cols-[0.85fr_1.15fr]">
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Order ID</p>
          <p className="mt-2 text-base font-bold text-pocket-navy">{order.orderNumber}</p>
          <p className="text-sm text-pocket-navy/60">{order.channel.replaceAll("_", " ")} · {formatServiceType(order.serviceType)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Customer</p>
          <p className="mt-2 text-base font-bold text-pocket-navy">{order.customerName}</p>
          {order.customerPhone ? <p className="text-sm text-pocket-navy/60">{order.customerPhone}</p> : null}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Payment</p>
          <p className="mt-2 text-sm font-medium text-pocket-navy">{formatPaymentMethod(order.paymentMethod)}</p>
          <p className="mt-2 text-sm text-pocket-navy/60">
            Foodpanda order: {order.foodpandaOrderNumber ?? "null"}
          </p>
          <p className="mt-2 text-sm text-pocket-navy/60">Channel: {order.channel.replaceAll("_", " ")}</p>
          <p className="text-sm text-pocket-navy/60">Service: {formatServiceType(order.serviceType)}</p>
          <p className="text-sm text-pocket-navy/60">Paid: {formatCurrency(order.paidAmount)}</p>
          <p className="text-sm text-pocket-navy/60">Change: {formatCurrency(order.changeDueAmount)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Delivery</p>
          {order.address ? (
            <>
              <p className="mt-2 text-sm font-medium text-pocket-navy">{order.address.addressLine1}</p>
              <p className="text-sm text-pocket-navy/60">{order.address.city}</p>
              {order.address.instructions ? <p className="mt-1 text-sm text-pocket-navy/60">{order.address.instructions}</p> : null}
            </>
          ) : (
            <p className="mt-2 text-sm text-pocket-navy/60">No address attached.</p>
          )}
          {order.deliveryInstructions ? <p className="mt-2 text-sm text-pocket-navy/60">Order note: {order.deliveryInstructions}</p> : null}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Lifecycle</p>
          <p className="mt-2 text-sm font-medium text-pocket-navy">{formatStatus(order.status)}</p>
          {order.acceptedAt ? (
            <p className="text-sm text-pocket-navy/60">
              Accepted{" "}
              {new Intl.DateTimeFormat("en-PK", {
                timeZone: "Asia/Karachi",
                dateStyle: "medium",
                timeStyle: "short"
              }).format(new Date(order.acceptedAt))}
            </p>
          ) : order.status === "PENDING" ? (
            <p className="text-sm text-amber-700">Waiting to be accepted.</p>
          ) : null}
          {order.cancellationReason ? (
            <p className="mt-1 text-sm text-red-600">Rejected: {order.cancellationReason}</p>
          ) : null}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Items</p>
        <div className="mt-3 space-y-3">
          {order.items.map((item) => (
            <div key={item.id} className="rounded-md border border-pocket-navy/10 bg-white px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-pocket-navy">{item.productName}</p>
                  <p className="text-sm text-pocket-navy/60">Qty {item.quantity}</p>
                  {item.customDescription ? <p className="text-sm text-pocket-navy/60">{item.customDescription}</p> : null}
                  {item.bundleComponents.length ? <p className="text-sm text-pocket-navy/60">Contains: {formatBundleSummary(item.bundleComponents)}</p> : null}
                  {item.note ? <p className="mt-1 text-sm text-pocket-navy/60">Note: {item.note}</p> : null}
                </div>
                <p className="font-bold text-pocket-orange">{formatCurrency(item.unitPrice * item.quantity)}</p>
              </div>
              {item.addOns.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.addOns.map((addOn) => (
                    <span key={addOn.id} className="rounded-md bg-pocket-cream px-3 py-1.5 text-xs font-semibold text-pocket-navy">
                      {addOn.optionName} (+{formatCurrency(addOn.priceDelta)})
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function OrderManagement() {
  const router = useRouter();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [preset, setPreset] = useState<AdminRangePreset>("today");
  const [customStart, setCustomStart] = useState(getTodayDateKey());
  const [customEnd, setCustomEnd] = useState(getTodayDateKey());
  const [segmentFilter, setSegmentFilter] = useState<AdminOrderSegment>("all");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [search, setSearch] = useState("");
  const [expandedOrderId, setExpandedOrderId] = useState("");
  const [deletingOrderId, setDeletingOrderId] = useState("");
  const [clearingOrders, setClearingOrders] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [intakeOrderId, setIntakeOrderId] = useState("");

  async function loadOrders() {
    try {
      setError("");
      if (preset === "custom" && (!customStart || !customEnd)) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const nextOrders = await fetchAdminOrders({
        segment: segmentFilter,
        preset,
        start: preset === "custom" ? toPakistanDateIso(customStart) : undefined,
        end: preset === "custom" ? toPakistanDateIso(customEnd, true) : undefined
      });
      setOrders(nextOrders);
      setExpandedOrderId((current) => (nextOrders.some((order) => order.id === current) ? current : nextOrders[0]?.id ?? ""));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load orders.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadOrders();
  }, [segmentFilter, preset, customStart, customEnd]);

  // Online orders arrive while nobody is clicking Refresh, so poll. Only while
  // the tab is actually being looked at, to avoid pointless load from a screen
  // left open overnight. Same dependencies as the load above, so the poll always
  // reflects the current filters rather than the ones present on first render.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadOrders();
    }, ORDER_POLL_MS);
    return () => window.clearInterval(timer);
  }, [segmentFilter, preset, customStart, customEnd]);

  const selectedPaymentMethod = paymentFilters.find((option) => option.value === paymentFilter)?.method;

  const selectedStatuses = statusFilters.find((option) => option.value === statusFilter)?.statuses;

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const haystack = `${order.orderNumber} ${order.customerName} ${order.branch} ${order.channel} ${order.paymentMethod} ${formatPaymentMethod(order.paymentMethod)} ${order.foodpandaOrderNumber ?? ""} ${order.address?.addressLine1 ?? ""} ${order.address?.city ?? ""}`.toLowerCase();
      const matchesSearch = !search || haystack.includes(search.toLowerCase());
      const matchesPayment = paymentFilter === "all" || order.paymentMethod === selectedPaymentMethod;
      const matchesStatus = !selectedStatuses || selectedStatuses.includes(order.status);

      return matchesSearch && matchesPayment && matchesStatus;
    });
  }, [orders, search, paymentFilter, selectedPaymentMethod, selectedStatuses]);

  const statusCounts = useMemo(() => {
    return statusFilters.reduce<Record<StatusFilter, number>>(
      (counts, option) => {
        counts[option.value] = option.statuses
          ? orders.filter((order) => option.statuses!.includes(order.status)).length
          : orders.length;
        return counts;
      },
      { all: 0, pending: 0, preparing: 0, ready: 0, out_for_delivery: 0, delivered: 0, cancelled: 0 }
    );
  }, [orders]);

  async function acceptOrder(order: AdminOrder) {
    setIntakeOrderId(order.id);
    setError("");
    try {
      // Straight into the preparing queue: accepting an order means the kitchen
      // is starting it, and a separate "confirmed but not started" step is a
      // click nobody needs.
      await updateAdminOrderStatus(order.id, "PREPARING");
      await loadOrders();
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : "Failed to accept order.");
    } finally {
      setIntakeOrderId("");
    }
  }

  /**
   * Moving an order to ready is what calls an assigned rider out on WhatsApp, so
   * the confirmation says so rather than leaving it as a surprise.
   */
  async function markReady(order: AdminOrder) {
    setIntakeOrderId(order.id);
    setError("");
    try {
      await updateAdminOrderStatus(order.id, "READY");
      await loadOrders();
    } catch (readyError) {
      setError(readyError instanceof Error ? readyError.message : "Failed to mark order ready.");
    } finally {
      setIntakeOrderId("");
    }
  }

  async function rejectOrder(order: AdminOrder) {
    const reason = window.prompt(
      `Reject ${order.orderNumber}? Give a reason the customer can be told, for example "shop closed" or "item unavailable".`
    );
    // Cancel on the prompt returns null; an empty string means they pressed OK
    // with nothing typed, and a rejection with no reason is not useful to anyone.
    if (reason === null) return;
    if (!reason.trim()) {
      setError("A rejection reason is required.");
      return;
    }

    setIntakeOrderId(order.id);
    setError("");
    try {
      await updateAdminOrderStatus(order.id, "CANCELLED", { cancellationReason: reason.trim() });
      await loadOrders();
    } catch (rejectError) {
      setError(rejectError instanceof Error ? rejectError.message : "Failed to reject order.");
    } finally {
      setIntakeOrderId("");
    }
  }

  const paymentCounts = useMemo(() => {
    return orders.reduce<Record<PaymentFilter, number>>(
      (counts, order) => {
        counts.all += 1;
        if (order.paymentMethod === "CASH") counts.cash += 1;
        if (order.paymentMethod === "EASYPAISA") counts.easypaisa += 1;
        if (order.paymentMethod === "JAZZCASH") counts.jazzcash += 1;
        if (order.paymentMethod === "FOODPANDA_PAYOUT") counts.foodpanda += 1;
        return counts;
      },
      { all: 0, cash: 0, easypaisa: 0, jazzcash: 0, foodpanda: 0 }
    );
  }, [orders]);

  // Repeating alert while anything is waiting to be accepted.
  const { muted, toggleMuted, needsArming, arm, alarmActive } = useOrderAlarm(statusCounts.pending);

  const totalOrderCount = orders.length;
  const visibleOrderCount = filteredOrders.length;

  async function removeOrder(order: AdminOrder) {
    const confirmed = window.confirm(`Delete ${order.orderNumber}? This removes the order and receipt from the system.`);
    if (!confirmed) return;

    setDeletingOrderId(order.id);
    setError("");
    try {
      await deleteAdminOrder(order.id);
      await loadOrders();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete order.");
    } finally {
      setDeletingOrderId("");
    }
  }

  async function clearAllOrders() {
    const confirmed = window.confirm(
      "Delete ALL orders? This will clear the order history and restart numbering from the next new order."
    );
    if (!confirmed) return;

    setClearingOrders(true);
    setError("");
    try {
      await deleteAllAdminOrders();
      await loadOrders();
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "Failed to delete orders.");
    } finally {
      setClearingOrders(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {segments.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={segmentFilter === option.value ? "default" : "outline"}
                onClick={() => setSegmentFilter(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          {statusCounts.pending > 0 ? (
            <div
              className={`flex flex-wrap items-center gap-3 rounded-md border px-4 py-3 ${
                alarmActive ? "border-amber-400 bg-amber-100" : "border-amber-300 bg-amber-50"
              }`}
              role="alert"
            >
              <BellRing
                className={`h-5 w-5 shrink-0 text-amber-600 ${alarmActive ? "animate-pulse" : ""}`}
                aria-hidden="true"
              />
              <button
                type="button"
                onClick={() => setStatusFilter("pending")}
                className="text-left text-sm font-bold text-amber-900 underline-offset-2 hover:underline"
              >
                {statusCounts.pending} order{statusCounts.pending === 1 ? "" : "s"} waiting to be accepted
              </button>
              {needsArming ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={arm}
                  className="ml-auto"
                  title="Browsers block sound until the page is clicked once"
                >
                  <Volume2 className="h-4 w-4" />
                  Enable alert sound
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={toggleMuted}
                  className="ml-auto"
                  title={muted ? "Turn the repeating alert back on" : "Silence the repeating alert"}
                >
                  {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  {muted ? "Sound off" : "Sound on"}
                </Button>
              )}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-3 rounded-md bg-pocket-cream/70 px-4 py-3 text-sm text-pocket-navy">
            <span className="font-semibold">Orders in range:</span>
            <span className="rounded-full bg-white px-3 py-1 font-bold text-pocket-navy shadow-sm">{totalOrderCount}</span>
            <span className="text-pocket-navy/50">Visible after payment/search filters:</span>
            <span className="rounded-full bg-white px-3 py-1 font-bold text-pocket-navy shadow-sm">{visibleOrderCount}</span>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/50">Lifecycle</p>
            <div className="flex flex-wrap gap-2">
              {statusFilters.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={statusFilter === option.value ? "default" : "outline"}
                  onClick={() => setStatusFilter(option.value)}
                >
                  {option.label}
                  <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs font-bold text-pocket-navy shadow-sm">
                    {statusCounts[option.value]}
                  </span>
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/50">Payment Filters</p>
            <div className="flex flex-wrap gap-2">
              {paymentFilters.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={paymentFilter === option.value ? "default" : "outline"}
                  onClick={() => setPaymentFilter(option.value)}
                >
                  {option.label}
                  <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs font-bold text-pocket-navy shadow-sm">
                    {paymentCounts[option.value]}
                  </span>
                </Button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {presets.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={preset === option.value ? "default" : "outline"}
                onClick={() => setPreset(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          {preset === "custom" ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} />
              <Input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} />
              <p className="text-sm text-pocket-navy/60">Pick the same start and end date to view one specific day.</p>
            </div>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-[1fr_auto_auto]">
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order ID, customer, branch, address, or payment" />
            <Button
              variant="outline"
              onClick={() => {
                setRefreshing(true);
                void loadOrders();
              }}
              disabled={refreshing}
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </Button>
            {orders.length ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void clearAllOrders()}
                disabled={clearingOrders}
                className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800"
              >
                <Trash2 className="h-4 w-4" />
                {clearingOrders ? "Clearing..." : "Delete All Orders"}
              </Button>
            ) : null}
          </div>
        </div>
        <p className="mt-4 text-sm text-pocket-navy/60">
          <ChefHat className="mr-1 inline-block h-4 w-4 align-text-bottom" />
          Accept an order to move it into Preparing. Marking it Ready is what messages the assigned rider to come and collect it.
        </p>
        <p className="mt-2 text-sm text-pocket-navy/60">
          Delivery and Takeaway isolate the two online order types. Dine-in / Takeaway is the original counter grouping and still includes takeaway, so existing
          reporting figures are unchanged. Use the payment filters to isolate cash, Easypaisa, JazzCash, and Foodpanda payout orders.
        </p>
      </Card>

      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

      <Card className="overflow-hidden">
        <div className={`${orderGridColumns} border-b border-pocket-navy/10 bg-pocket-cream px-5 py-4 text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/60`}>
          <span className="min-w-0">Order</span>
          <span className="min-w-0">Customer</span>
          <span className="min-w-0">Status</span>
          <span className="min-w-0">Foodpanda No</span>
          <span className="min-w-0">Items</span>
          <span className="min-w-0">Total</span>
          <span className="min-w-0 text-right">Actions</span>
        </div>
        {loading ? (
          <div className="px-5 py-8 text-sm text-pocket-navy/60">Loading orders...</div>
        ) : (
          filteredOrders.map((order) => {
            const open = expandedOrderId === order.id;
            return (
              <div key={order.id} className="border-b border-pocket-navy/10 last:border-0">
                <div className={`${orderGridColumns} px-5 py-4 text-sm`}>
                  <div className="min-w-0">
                    <p className="font-bold text-pocket-navy">{order.orderNumber}</p>
                    <p className="text-pocket-navy/60">{order.branch}</p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-pocket-orange">{order.channel.replaceAll("_", " ")}</p>
                    <p className="mt-1 text-xs font-medium uppercase tracking-wide text-pocket-navy/40">
                      {new Intl.DateTimeFormat("en-PK", {
                        timeZone: "Asia/Karachi",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit"
                      }).format(new Date(order.placedAt))}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-pocket-navy">{order.customerName}</p>
                    {order.customerPhone ? <p className="text-pocket-navy/60">{order.customerPhone}</p> : null}
                    <p className="text-xs font-medium uppercase tracking-wide text-pocket-navy/40">{formatServiceType(order.serviceType)}</p>
                    {order.address ? (
                      <p className="mt-1 text-xs text-pocket-navy/60">
                        {order.address.addressLine1}, {order.address.city}
                      </p>
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusStyles[order.status] ?? "border-pocket-navy/15 bg-white text-pocket-navy/60"}`}
                    >
                      {formatStatus(order.status)}
                    </span>
                    {order.cancellationReason ? (
                      <p className="mt-1 break-words text-xs text-red-600">{order.cancellationReason}</p>
                    ) : null}
                  </div>
                  <span className="min-w-0 font-medium text-pocket-navy/70">{order.foodpandaOrderNumber ?? "null"}</span>
                  <span className="min-w-0 font-medium text-pocket-navy/70">{order.items.length}</span>
                  <span className="min-w-0 font-bold text-pocket-navy">{formatCurrency(order.totalAmount)}</span>
                  <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
                    {["CONFIRMED", "PREPARING", "WATCH_LATER"].includes(order.status) ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void markReady(order)}
                        disabled={intakeOrderId === order.id}
                        title="Mark ready. This messages the assigned rider to collect it."
                      >
                        <PackageCheck className="h-4 w-4" />
                        Ready
                      </Button>
                    ) : null}
                    {order.status === "PENDING" ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void acceptOrder(order)}
                          disabled={intakeOrderId === order.id}
                          title="Accept this order into the kitchen queue"
                        >
                          <Check className="h-4 w-4" />
                          Accept
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800"
                          onClick={() => void rejectOrder(order)}
                          disabled={intakeOrderId === order.id}
                          title="Reject this order with a reason"
                        >
                          <X className="h-4 w-4" />
                          Reject
                        </Button>
                      </>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 px-0"
                      onClick={() => setExpandedOrderId(open ? "" : order.id)}
                      aria-label={open ? "Hide order details" : "View order details"}
                      title={open ? "Hide order details" : "View order details"}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 px-0"
                      disabled={order.channel !== "POS"}
                      onClick={() => router.push(`/pos?orderNumber=${encodeURIComponent(order.orderNumber)}`)}
                      title={order.channel !== "POS" ? "Only POS orders can be edited" : "Edit order"}
                    >
                      <PencilLine className="h-4 w-4" />
                      <span className="sr-only">Edit order</span>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void removeOrder(order)}
                      disabled={deletingOrderId === order.id || clearingOrders}
                      className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800"
                    >
                      <Trash2 className="h-4 w-4" />
                      {deletingOrderId === order.id ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                </div>
                {open ? (
                  <div className="px-5 pb-5">
                    <OrderDetails order={order} />
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}
