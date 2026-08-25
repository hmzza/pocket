"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, MapPin, MessageCircle, PackageCheck, Phone, RefreshCcw, Search, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { dispatchAdminDeliveryOrder, fetchAdminOrders, updateAdminDeliveryStatus } from "@/lib/admin-client";
import type { AdminOrder } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

const terminalStatuses = new Set(["DELIVERED", "CANCELLED"]);

function formatOrderStatus(status: string) {
  return ({ PENDING: "New", CONFIRMED: "In progress", OUT_FOR_DELIVERY: "With rider", DELIVERED: "Delivered", CANCELLED: "Cancelled" } as Record<string, string>)[status] ?? status.replaceAll("_", " ");
}

function statusClass(status: string) {
  return status === "PENDING" ? "bg-amber-100 text-amber-800" : status === "CONFIRMED" ? "bg-sky-100 text-sky-800" : status === "OUT_FOR_DELIVERY" ? "bg-violet-100 text-violet-800" : status === "DELIVERED" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800";
}

function formatPlacedAt(value: string) {
  return new Intl.DateTimeFormat("en-PK", { timeZone: "Asia/Karachi", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function fullAddress(order: AdminOrder) {
  return [order.address?.addressLine1, order.address?.addressLine2, order.deliverySubsector ?? order.deliverySector, order.address?.city].filter(Boolean).join(", ");
}

function sourceLabel(order: AdminOrder) {
  return order.channel === "POS" ? `POS · ${order.cashierName ?? order.cashierUsername ?? "staff account"}` : "Website customer";
}

function staffTrail(order: AdminOrder) {
  return [
    `Placed: ${sourceLabel(order)}`,
    order.acceptedByName ? `Accepted: ${order.acceptedByName}` : null,
    order.dispatchedByName ? `Dispatched: ${order.dispatchedByName}` : null
  ].filter(Boolean).join(" · ");
}

export function DeliveryManagement() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState("");
  const [riderPickerOrderId, setRiderPickerOrderId] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [view, setView] = useState<"ACTIVE" | "HISTORY" | "ALL">("ACTIVE");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadOrders(showRefresh = false) {
    if (showRefresh) setRefreshing(true);
    setError("");
    try {
      setOrders(await fetchAdminOrders({ segment: "delivery", preset: "custom", start: "2000-01-01T00:00:00.000Z", end: "2099-12-31T23:59:59.999Z" }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load delivery orders.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { void loadOrders(); }, []);

  async function changeStatus(order: AdminOrder, status: "CONFIRMED" | "DELIVERED" | "CANCELLED") {
    if (status === "CANCELLED" && !window.confirm(`Cancel ${order.orderNumber}?`)) return;
    setBusyOrderId(order.id);
    setError("");
    setNotice("");
    try {
      await updateAdminDeliveryStatus(order.id, status);
      await loadOrders();
      setNotice(status === "CONFIRMED" ? `${order.orderNumber} accepted and sent to the POS queue.` : `${order.orderNumber} updated.`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to update the delivery order.");
    } finally {
      setBusyOrderId("");
    }
  }

  async function dispatch(order: AdminOrder) {
    const whatsappWindow = window.open("", "_blank");
    setBusyOrderId(order.id);
    setError("");
    setNotice("");
    try {
      const result = await dispatchAdminDeliveryOrder(order.id);
      if (whatsappWindow) whatsappWindow.location.assign(result.whatsappUrl);
      else window.location.assign(result.whatsappUrl);
      await loadOrders();
      setRiderPickerOrderId("");
      setNotice(`${order.orderNumber} dispatched to Zeeshan.`);
    } catch (actionError) {
      whatsappWindow?.close();
      setError(actionError instanceof Error ? actionError.message : "Unable to assign the rider.");
    } finally {
      setBusyOrderId("");
    }
  }

  const filteredOrders = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesView = view === "ALL" || (view === "ACTIVE" ? !terminalStatuses.has(order.status) : terminalStatuses.has(order.status));
      const matchesStatus = statusFilter === "ALL" || order.status === statusFilter;
      const searchText = `${order.orderNumber} ${order.customerName} ${order.customerPhone ?? ""} ${order.deliverySector ?? ""} ${order.deliverySubsector ?? ""} ${sourceLabel(order)} ${order.acceptedByName ?? ""} ${order.dispatchedByName ?? ""}`.toLowerCase();
      return matchesView && matchesStatus && (!needle || searchText.includes(needle));
    });
  }, [orders, query, statusFilter, view]);

  function renderOrder(order: AdminOrder) {
    const busy = busyOrderId === order.id;
    const canCancel = !terminalStatuses.has(order.status);
    const deliveryFee = Math.max(0, order.totalAmount - order.subtotal + order.discountAmount);
    return (
      <Card key={order.id} className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-black text-pocket-navy">{order.orderNumber}</p><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusClass(order.status)}`}>{formatOrderStatus(order.status)}</span></div><p className="mt-1 text-xs text-pocket-navy/60">{formatPlacedAt(order.placedAt)} · {sourceLabel(order)}</p></div>
          <div className="text-right"><p className="text-lg font-black text-pocket-orange">{formatCurrency(order.totalAmount)}</p><p className="text-xs text-pocket-navy/60">Items {formatCurrency(order.subtotal)} · Delivery {formatCurrency(deliveryFee)}</p></div>
        </div>
        <div className="mt-3 grid gap-2 border-t border-pocket-navy/10 pt-3 text-sm md:grid-cols-[1fr_1.35fr]"><div><p className="font-semibold text-pocket-navy">{order.customerName}</p>{order.customerPhone ? <a href={`tel:${order.customerPhone}`} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><Phone className="h-3.5 w-3.5" />{order.customerPhone}</a> : null}</div><p className="flex gap-2 leading-5 text-pocket-navy/70"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-pocket-orange" />{fullAddress(order) || "Address not available"}</p></div>
        <p className="mt-2 text-xs text-pocket-navy/60">{staffTrail(order)}</p>
        {order.riderName ? <p className="mt-1 text-xs font-semibold text-violet-700">Rider: {order.riderName}</p> : null}
        <details open className="mt-3 rounded-lg bg-pocket-cream/70 px-3 py-2 text-xs text-pocket-navy/75">
          <summary className="cursor-pointer font-semibold text-pocket-navy">Items & customer details ({order.items.length})</summary>
          <div className="mt-3 grid gap-3 border-t border-pocket-navy/10 pt-3 md:grid-cols-2">
            <div className="space-y-1"><p className="font-semibold text-pocket-navy">Customer entered</p><p>Name: {order.customerName}</p><p>WhatsApp: {order.customerPhone ?? "Not provided"}</p><p>City: {order.address?.city ?? "Islamabad"}</p><p>Sector: {order.deliverySubsector ?? order.deliverySector ?? "Not provided"}</p></div>
            <div className="space-y-1"><p className="font-semibold text-pocket-navy">Delivery address</p><p>{order.address?.addressLine1 ?? "Not provided"}</p>{order.address?.addressLine2 ? <p>{order.address.addressLine2}</p> : null}{order.address?.instructions ? <p>Location instructions: {order.address.instructions}</p> : null}{order.deliveryInstructions ? <p>Order instructions: {order.deliveryInstructions}</p> : null}</div>
          </div>
          <div className="mt-3 border-t border-pocket-navy/10 pt-3"><p className="font-semibold text-pocket-navy">Items</p><div className="mt-2 space-y-1.5">{order.items.map((item) => <div key={item.id} className="flex items-start justify-between gap-3"><div><p>{item.quantity}× {item.productName}</p>{item.customDescription ? <p className="text-pocket-navy/60">{item.customDescription}</p> : null}{item.addOns.length ? <p className="text-pocket-navy/60">{item.addOns.map((addOn) => addOn.optionName).join(", ")}</p> : null}</div><p className="shrink-0 font-semibold text-pocket-navy">{formatCurrency(item.unitPrice * item.quantity)}</p></div>)}</div></div>
        </details>
        <div className="mt-3 flex flex-wrap gap-2">
          {order.status === "PENDING" ? <Button type="button" size="sm" disabled={busy} onClick={() => void changeStatus(order, "CONFIRMED")}><PackageCheck className="h-4 w-4" />{busy ? "Accepting..." : "Accept"}</Button> : null}
          {order.status === "CONFIRMED" ? <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setRiderPickerOrderId((current) => current === order.id ? "" : order.id)}><MessageCircle className="h-4 w-4" />Assign rider</Button> : null}
          {order.status === "OUT_FOR_DELIVERY" ? <Button type="button" size="sm" disabled={busy} onClick={() => void changeStatus(order, "DELIVERED")}><CheckCircle2 className="h-4 w-4" />{busy ? "Completing..." : "Delivered"}</Button> : null}
          {canCancel ? <Button type="button" size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800" disabled={busy} onClick={() => void changeStatus(order, "CANCELLED")}><XCircle className="h-4 w-4" />Cancel</Button> : null}
        </div>
        {riderPickerOrderId === order.id ? <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2"><span className="text-xs font-semibold text-violet-900">Assign Zeeshan and open WhatsApp</span><Button type="button" size="sm" className="bg-violet-700 hover:bg-violet-800" disabled={busy} onClick={() => void dispatch(order)}>Dispatch <ExternalLink className="h-4 w-4" /></Button></div> : null}
      </Card>
    );
  }

  if (loading) return <Card className="p-6 text-sm text-pocket-navy/60">Loading delivery orders...</Card>;

  return <div className="space-y-4"><Card className="p-4"><div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Direct delivery</p><h2 className="mt-1 text-2xl font-black text-pocket-navy">Delivery board</h2></div><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant={view === "ACTIVE" ? "default" : "outline"} onClick={() => setView("ACTIVE")}>Active</Button><Button type="button" size="sm" variant={view === "HISTORY" ? "default" : "outline"} onClick={() => setView("HISTORY")}>History</Button><Button type="button" size="sm" variant={view === "ALL" ? "default" : "outline"} onClick={() => setView("ALL")}>All</Button><Button type="button" size="sm" variant="outline" disabled={refreshing} onClick={() => void loadOrders(true)}><RefreshCcw className="h-4 w-4" />{refreshing ? "Refreshing" : "Refresh"}</Button></div></div><div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_170px]"><label className="flex h-10 items-center gap-2 rounded-md border border-pocket-navy/15 bg-white px-3"><Search className="h-4 w-4 text-pocket-navy/45" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Order, customer, sector, or staff" className="h-auto border-0 p-0 shadow-none focus-visible:ring-0" /></label><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-md border border-pocket-navy/15 bg-white px-3 text-sm"><option value="ALL">All statuses</option><option value="PENDING">New</option><option value="CONFIRMED">In progress</option><option value="OUT_FOR_DELIVERY">With rider</option><option value="DELIVERED">Delivered</option><option value="CANCELLED">Cancelled</option></select></div></Card>{error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}{notice ? <p className="text-sm font-semibold text-emerald-700">{notice}</p> : null}<div className="flex items-center justify-between"><p className="text-sm font-bold text-pocket-navy">{filteredOrders.length} delivery order{filteredOrders.length === 1 ? "" : "s"}</p><p className="text-xs text-pocket-navy/55">Accept → dispatch → delivered</p></div><div className="space-y-3">{filteredOrders.length ? filteredOrders.map(renderOrder) : <Card className="border-dashed p-6 text-center text-sm text-pocket-navy/60">No delivery orders match these filters.</Card>}</div></div>;
}
