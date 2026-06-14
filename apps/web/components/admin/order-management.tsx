"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchAdminOrders, ORDER_STATUSES, updateAdminOrderStatus } from "@/lib/admin-client";
import type { AdminOrder } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

function OrderDetails({ order }: { order: AdminOrder }) {
  return (
    <div className="grid gap-6 rounded-lg bg-pocket-cream p-5 lg:grid-cols-[0.85fr_1.15fr]">
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Customer</p>
          <p className="mt-2 text-base font-bold text-pocket-navy">{order.customerName}</p>
          {order.customerPhone ? <p className="text-sm text-pocket-navy/60">{order.customerPhone}</p> : null}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Payment</p>
          <p className="mt-2 text-sm font-medium text-pocket-navy">{order.paymentMethod.replaceAll("_", " ")}</p>
          <p className="text-sm text-pocket-navy/60">{order.paymentStatus.replaceAll("_", " ")}</p>
          <p className="mt-2 text-sm text-pocket-navy/60">Channel: {order.channel.replaceAll("_", " ")}</p>
          <p className="text-sm text-pocket-navy/60">Service: {order.serviceType.replaceAll("_", " ")}</p>
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [expandedOrderId, setExpandedOrderId] = useState("");
  const [updatingOrderId, setUpdatingOrderId] = useState("");

  async function loadOrders() {
    try {
      setError("");
      const nextOrders = await fetchAdminOrders();
      setOrders(nextOrders);
      if (!expandedOrderId && nextOrders[0]) {
        setExpandedOrderId(nextOrders[0].id);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load orders.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadOrders();
  }, []);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesStatus = statusFilter === "ALL" || order.status === statusFilter;
      const haystack = `${order.orderNumber} ${order.customerName} ${order.branch}`.toLowerCase();
      const matchesSearch = !search || haystack.includes(search.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [orders, search, statusFilter]);

  async function changeStatus(orderId: string, status: string) {
    setUpdatingOrderId(orderId);
    setError("");
    try {
      await updateAdminOrderStatus(orderId, status);
      await loadOrders();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update order status.");
    } finally {
      setUpdatingOrderId("");
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_220px_auto]">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order number or customer" />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 py-2 text-sm text-pocket-charcoal outline-none transition focus:border-pocket-orange focus:ring-2 focus:ring-pocket-orange/20"
          >
            <option value="ALL">All statuses</option>
            {ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status.replaceAll("_", " ")}
              </option>
            ))}
          </select>
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
        </div>
        <p className="mt-4 text-sm text-pocket-navy/60">Orders are controlled through fulfillment status. Line items remain a post-checkout snapshot.</p>
      </Card>

      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

      <Card className="overflow-hidden">
        <div className="grid grid-cols-[1.15fr_1.2fr_1.1fr_0.7fr_0.8fr_0.7fr] gap-4 border-b border-pocket-navy/10 bg-pocket-cream px-5 py-4 text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/60">
          <span>Order</span>
          <span>Customer</span>
          <span>Status Control</span>
          <span>Items</span>
          <span>Total</span>
          <span>Details</span>
        </div>
        {loading ? (
          <div className="px-5 py-8 text-sm text-pocket-navy/60">Loading orders...</div>
        ) : (
          filteredOrders.map((order) => {
            const open = expandedOrderId === order.id;
            return (
              <div key={order.id} className="border-b border-pocket-navy/10 last:border-0">
                <div className="grid grid-cols-[1.15fr_1.2fr_1.1fr_0.7fr_0.8fr_0.7fr] gap-4 px-5 py-4 text-sm">
                  <div>
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
                  <div>
                    <p className="font-medium text-pocket-navy">{order.customerName}</p>
                    {order.customerPhone ? <p className="text-pocket-navy/60">{order.customerPhone}</p> : null}
                    <p className="text-xs font-medium uppercase tracking-wide text-pocket-navy/40">{order.serviceType.replaceAll("_", " ")}</p>
                  </div>
                  <div>
                    <select
                      value={order.status}
                      onChange={(event) => void changeStatus(order.id, event.target.value)}
                      disabled={updatingOrderId === order.id}
                      className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 py-2 text-sm font-semibold text-pocket-charcoal outline-none transition focus:border-pocket-orange focus:ring-2 focus:ring-pocket-orange/20"
                    >
                      {ORDER_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </div>
                  <span className="font-medium text-pocket-navy/70">{order.items.length}</span>
                  <span className="font-bold text-pocket-navy">{formatCurrency(order.totalAmount)}</span>
                  <div className="flex justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setExpandedOrderId(open ? "" : order.id)}>
                      <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
                      View
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
