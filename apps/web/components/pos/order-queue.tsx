"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronLeft, RefreshCcw, Search, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchPosOrders, fetchPosSession, getPosTokenKey, updatePosOrderStatus } from "@/lib/pos-client";
import type { AdminOrder } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

const scopeOptions = [
  { value: "active", label: "Active" },
  { value: "delivered", label: "Delivered" },
  { value: "all", label: "All" }
] as const;

function OrderCard({
  order,
  onComplete
}: {
  order: AdminOrder;
  onComplete: (order: AdminOrder) => void;
}) {
  const isDeliverable = order.status !== "DELIVERED" && order.status !== "CANCELLED";

  return (
    <Card className="rounded-3xl border-slate-200 bg-white p-5 shadow-none">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-600">Order ID</p>
            <h3 className="mt-1 text-2xl font-black text-slate-900">{order.orderNumber}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {order.channel.replaceAll("_", " ")} · {order.serviceType.replaceAll("_", " ")} · {new Intl.DateTimeFormat("en-PK", { hour: "numeric", minute: "2-digit", day: "numeric", month: "short" }).format(new Date(order.placedAt))}
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-900">{order.customerName}</p>
            {order.customerPhone ? <p className="text-sm text-slate-500">{order.customerPhone}</p> : null}
          </div>

          {order.address ? (
            <div className="rounded-2xl bg-orange-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-orange-700">Delivery Address</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{order.address.addressLine1}</p>
              <p className="text-sm text-slate-600">{order.address.city}</p>
              {order.address.instructions ? <p className="mt-1 text-sm text-slate-600">{order.address.instructions}</p> : null}
            </div>
          ) : null}

          {order.deliveryInstructions ? <p className="text-sm text-slate-600">Note: {order.deliveryInstructions}</p> : null}
        </div>

        <div className="min-w-[240px] space-y-3 xl:text-right">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Status</p>
            <p className="mt-1 text-lg font-black text-slate-900">{order.status.replaceAll("_", " ")}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Total</p>
            <p className="mt-1 text-2xl font-black text-orange-600">{formatCurrency(order.totalAmount)}</p>
          </div>
          <div className="flex flex-wrap gap-2 xl:justify-end">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{order.items.length} items</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{order.branch}</span>
          </div>
          {isDeliverable ? (
            <Button className="w-full xl:w-auto" onClick={() => onComplete(order)}>
              <CheckCircle2 className="h-4 w-4" />
              Complete
            </Button>
          ) : (
            <p className="text-sm text-slate-500">Completed orders are read-only.</p>
          )}
        </div>
      </div>

      <div className="mt-5 space-y-3 border-t border-slate-200 pt-4">
        {order.items.map((item) => (
          <div key={item.id} className="flex items-start justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3">
            <div>
              <p className="font-semibold text-slate-900">{item.productName}</p>
              <p className="text-sm text-slate-500">
                Qty {item.quantity} · {formatCurrency(item.unitPrice)} each
              </p>
              {item.customDescription ? <p className="mt-1 text-sm text-slate-500">{item.customDescription}</p> : null}
              {item.note ? <p className="mt-1 text-sm text-slate-500">Note: {item.note}</p> : null}
              {item.addOns.length ? <p className="mt-1 text-sm text-slate-600">{item.addOns.map((addOn) => addOn.optionName).join(", ")}</p> : null}
            </div>
            <p className="font-bold text-slate-900">{formatCurrency(item.unitPrice * item.quantity)}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function PosOrderQueue() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scope, setScope] = useState<(typeof scopeOptions)[number]["value"]>("active");
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [error, setError] = useState("");
  const [confirmOrder, setConfirmOrder] = useState<AdminOrder | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState("");

  async function loadOrders(nextScope = scope) {
    try {
      setError("");
      const data = await fetchPosOrders({ scope: nextScope, search: search.trim() || undefined });
      setOrders(data.orders);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load orders.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      const token = window.localStorage.getItem(getPosTokenKey());
      if (!token) {
        router.replace("/pos/login");
        return;
      }

      try {
        const session = await fetchPosSession();
        if (!["ADMIN", "SUPER_ADMIN", "POS_STAFF"].includes(session.user.role)) {
          window.localStorage.removeItem(getPosTokenKey());
          router.replace("/pos/login");
          return;
        }

        await loadOrders(scope);
        if (!cancelled) {
          setReady(true);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load orders.");
          window.localStorage.removeItem(getPosTokenKey());
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

  const activeCount = useMemo(() => orders.filter((order) => order.status !== "DELIVERED" && order.status !== "CANCELLED").length, [orders]);

  async function completeOrder(order: AdminOrder) {
    setUpdatingOrderId(order.id);
    setError("");
    try {
      await updatePosOrderStatus(order.id, "DELIVERED");
      setConfirmOrder(null);
      await loadOrders(scope);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update order status.");
    } finally {
      setUpdatingOrderId("");
    }
  }

  if (!ready || loading) {
    return <div className="min-h-[50vh] rounded-3xl bg-white p-6 text-sm text-slate-500">Loading order queue...</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/90 p-5 text-slate-900 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-600">Counter Orders</p>
          <h2 className="mt-1 text-3xl font-black">Active Queue</h2>
          <p className="mt-1 text-sm text-slate-500">{activeCount} active orders waiting to be completed.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => router.push("/pos")}>
            <ChevronLeft className="h-4 w-4" />
            Back to POS
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setRefreshing(true);
              void loadOrders(scope);
            }}
            disabled={refreshing}
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <Card className="rounded-3xl border-white/10 bg-white/90 p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <label className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4">
              <Search className="h-4 w-4 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search order ID, customer, or branch"
                className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
              />
            </label>
            <select
              value={scope}
              onChange={(event) => setScope(event.target.value as typeof scope)}
              className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm"
            >
              {scopeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-orange-600" />
            <p className="text-sm font-semibold text-slate-700">
              {scope === "active" ? "Deliveries and pickup are shown here." : scope === "delivered" ? "Completed orders." : "All orders."}
            </p>
          </div>
        </div>
      </Card>

      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

      <div className="space-y-4">
        {orders.length ? (
          orders.map((order) => (
            <OrderCard key={order.id} order={order} onComplete={(nextOrder) => setConfirmOrder(nextOrder)} />
          ))
        ) : (
          <Card className="rounded-3xl p-6 text-sm text-slate-500">No orders match the current filter.</Card>
        )}
      </div>

      {confirmOrder ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4">
          <Card className="w-full max-w-lg rounded-3xl border-slate-200 bg-white p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-600">Confirm completion</p>
            <h3 className="mt-2 text-2xl font-black text-slate-900">{confirmOrder.orderNumber}</h3>
            <p className="mt-2 text-sm text-slate-600">
              Mark {confirmOrder.customerName} order as delivered?
            </p>
            <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <p>{confirmOrder.serviceType.replaceAll("_", " ")} · {confirmOrder.channel.replaceAll("_", " ")}</p>
              <p className="mt-1 font-semibold text-slate-900">{formatCurrency(confirmOrder.totalAmount)}</p>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button variant="outline" onClick={() => setConfirmOrder(null)} disabled={!!updatingOrderId}>
                Cancel
              </Button>
              <Button onClick={() => void completeOrder(confirmOrder)} disabled={updatingOrderId === confirmOrder.id}>
                <CheckCircle2 className="h-4 w-4" />
                {updatingOrderId === confirmOrder.id ? "Completing..." : "Confirm complete"}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
