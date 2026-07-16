"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, RefreshCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { deleteAdminOrder, deleteAllAdminOrders, fetchAdminOrders } from "@/lib/admin-client";
import type { AdminOrder, AdminOrderSegment, AdminRangePreset } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

const segments: Array<{ value: AdminOrderSegment; label: string }> = [
  { value: "all", label: "All" },
  { value: "inshop", label: "Inshop" },
  { value: "foodpanda", label: "Foodpanda Orders" }
];

const presets: Array<{ value: AdminRangePreset; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "month", label: "This Month" },
  { value: "year", label: "This Year" },
  { value: "custom", label: "Custom" }
];

type PaymentFilter = "all" | "cash" | "easypaisa" | "jazzcash" | "foodpanda";

const paymentFilters: Array<{ value: PaymentFilter; label: string; method?: string }> = [
  { value: "all", label: "All Payments" },
  { value: "cash", label: "Cash", method: "CASH" },
  { value: "easypaisa", label: "Easypaisa", method: "EASYPAISA" },
  { value: "jazzcash", label: "JazzCash", method: "JAZZCASH" },
  { value: "foodpanda", label: "Foodpanda Payout", method: "FOODPANDA_PAYOUT" }
];

const orderGridColumns = "grid grid-cols-[minmax(0,1.25fr)_minmax(0,1.1fr)_minmax(0,0.95fr)_minmax(0,0.5fr)_minmax(0,0.8fr)_minmax(0,0.7fr)] gap-4";

function getTodayDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatServiceType(value: string) {
  if (["INSHOP", "TAKEAWAY", "DINE_IN"].includes(value)) return "Inshop";
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
        start: preset === "custom" ? new Date(`${customStart}T00:00:00`).toISOString() : undefined,
        end: preset === "custom" ? new Date(`${customEnd}T23:59:59.999`).toISOString() : undefined
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

  const selectedPaymentMethod = paymentFilters.find((option) => option.value === paymentFilter)?.method;

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const haystack = `${order.orderNumber} ${order.customerName} ${order.branch} ${order.channel} ${order.paymentMethod} ${formatPaymentMethod(order.paymentMethod)} ${order.foodpandaOrderNumber ?? ""} ${order.address?.addressLine1 ?? ""} ${order.address?.city ?? ""}`.toLowerCase();
      const matchesSearch = !search || haystack.includes(search.toLowerCase());
      const matchesPayment = paymentFilter === "all" || order.paymentMethod === selectedPaymentMethod;

      return matchesSearch && matchesPayment;
    });
  }, [orders, search, paymentFilter, selectedPaymentMethod]);

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
          <div className="flex flex-wrap items-center gap-3 rounded-md bg-pocket-cream/70 px-4 py-3 text-sm text-pocket-navy">
            <span className="font-semibold">Orders in range:</span>
            <span className="rounded-full bg-white px-3 py-1 font-bold text-pocket-navy shadow-sm">{totalOrderCount}</span>
            <span className="text-pocket-navy/50">Visible after payment/search filters:</span>
            <span className="rounded-full bg-white px-3 py-1 font-bold text-pocket-navy shadow-sm">{visibleOrderCount}</span>
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
          Inshop includes current Inshop plus older takeaway and dine-in orders. Use the payment filters to isolate cash, Easypaisa, JazzCash, and Foodpanda payout orders.
        </p>
      </Card>

      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

      <Card className="overflow-hidden">
        <div className={`${orderGridColumns} border-b border-pocket-navy/10 bg-pocket-cream px-5 py-4 text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/60`}>
          <span className="min-w-0">Order</span>
          <span className="min-w-0">Customer</span>
          <span className="min-w-0">Foodpanda No</span>
          <span className="min-w-0">Items</span>
          <span className="min-w-0">Total</span>
          <span className="min-w-0">Details</span>
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
                  <span className="min-w-0 font-medium text-pocket-navy/70">{order.foodpandaOrderNumber ?? "null"}</span>
                  <span className="min-w-0 font-medium text-pocket-navy/70">{order.items.length}</span>
                  <span className="min-w-0 font-bold text-pocket-navy">{formatCurrency(order.totalAmount)}</span>
                  <div className="flex min-w-0 justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setExpandedOrderId(open ? "" : order.id)}>
                      <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
                      View
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
