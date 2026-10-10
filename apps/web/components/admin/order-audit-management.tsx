"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, PencilLine, RefreshCcw, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchAdminOrderAudit, fetchAdminOrderAuditDetail } from "@/lib/admin-client";
import type { AdminOrder, AdminOrderAuditEvent, AdminOrderAuditRow, AdminOrderSegment, AdminRangePreset } from "@/lib/types";
import { formatCurrency, getCurrentBusinessDateKey, toPakistanDateIso } from "@/lib/utils";

const segments: Array<{ value: AdminOrderSegment; label: string }> = [
  { value: "all", label: "All" },
  { value: "dine_in", label: "Dine-in" },
  { value: "takeaway", label: "Takeaway" },
  { value: "delivery", label: "Delivery" },
  { value: "foodpanda", label: "Foodpanda" }
];

const presets: Array<{ value: AdminRangePreset; label: string }> = [
  { value: "yesterday", label: "Yesterday" },
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
  { value: "custom", label: "Custom" }
];

const paymentOptions = [
  ["", "All"],
  ["CASH", "Cash"],
  ["EASYPAISA", "Easypaisa"],
  ["JAZZCASH", "JazzCash"],
  ["FOODPANDA_PAYOUT", "Foodpanda payout"]
] as const;

function formatService(value: string) {
  if (["INSHOP", "DINE_IN"].includes(value)) return "Dine-in";
  if (value === "TAKEAWAY") return "Takeaway";
  if (value === "FOODPANDA") return "Foodpanda";
  if (value === "DELIVERY") return "Delivery";
  return value.replaceAll("_", " ");
}

function formatPayment(value: string) {
  return {
    CASH: "Cash",
    EASYPAISA: "Easypaisa",
    JAZZCASH: "JazzCash",
    CASH_ON_DELIVERY: "Cash on Delivery",
    FOODPANDA_PAYOUT: "Foodpanda payout"
  }[value] ?? value.replaceAll("_", " ");
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-PK", {
    timeZone: "Asia/Karachi",
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function itemSummary(order: AdminOrder) {
  return order.items.map((item) => `${item.quantity} × ${item.productName}`).join(", ") || "No item details";
}

function eventLabel(event: AdminOrderAuditEvent) {
  return {
    CREATED: "Order created",
    UPDATED: "Order edited",
    STATUS_CHANGED: "Order status update",
    PAYMENT_STATUS_CHANGED: "Payment status update",
    RIDER_DISPATCHED: "Rider dispatched",
    RECEIPT_PRINTED: "Receipt printed",
    DELETED: "Order deleted",
    LEGACY: "Older order activity"
  }[event.eventType] ?? event.eventType.replaceAll("_", " ");
}

function displayValue(value: unknown) {
  if (Array.isArray(value)) return value.length ? value.join("; ") : "None";
  if (value === null || value === undefined || value === "") return "None";
  if (typeof value === "object") return "Recorded change";
  return String(value);
}

function AuditValue({ value }: { value: unknown }) {
  const values = Array.isArray(value) ? value : [value];
  return (
    <div className="space-y-1 break-words">
      {values.map((entry, index) => <p key={`${String(entry)}-${index}`}>{displayValue(entry)}</p>)}
    </div>
  );
}

function AuditTimeline({ events }: { events: AdminOrderAuditEvent[] }) {
  if (!events.length) {
    return <p className="text-sm text-pocket-navy/60">No detailed audit events were recorded before this feature was enabled.</p>;
  }

  const labels: Record<string, string> = {
    items: "Items changed",
    discount: "Discount changed",
    paymentMethod: "Payment method changed",
    serviceType: "Order type changed",
    placedAt: "Order date changed",
    status: "Status",
    paymentStatus: "Payment status",
    rider: "Rider"
  };

  return (
    <div className="space-y-3">
      {events.map((event) => {
        const changes = event.changes && typeof event.changes === "object" ? Object.entries(event.changes as Record<string, any>) : [];
        return (
          <div key={event.id} className="border-l-2 border-pocket-orange/40 pl-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-pocket-navy">{eventLabel(event)}</p>
              <p className="text-xs text-pocket-navy/55">{formatDate(event.createdAt)}</p>
            </div>
            <p className="mt-1 text-xs text-pocket-navy/60">
              {event.actorName ?? (event.source === "WEBSITE" ? "Website customer" : event.source)}
            </p>
            {event.eventType === "CREATED" ? <p className="mt-2 text-sm text-pocket-navy/75">The order was created.</p> : null}
            {event.eventType === "DELETED" ? <p className="mt-2 text-sm text-red-700">The order was permanently deleted from the live order list.</p> : null}
            {changes.length ? (
              <div className="mt-3 overflow-hidden rounded-lg border border-pocket-navy/10 text-sm text-pocket-navy/75">
                <div className="hidden grid-cols-[minmax(120px,0.4fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-b border-pocket-navy/10 bg-pocket-cream px-3 py-2 text-xs font-bold uppercase tracking-wide text-pocket-navy/55 sm:grid">
                  <span>Field</span><span>Before</span><span>After</span>
                </div>
                {changes.map(([key, value]) => {
                  if (key === "message") return <p key={key} className="px-3 py-3">{displayValue(value)}</p>;
                  if (key === "receipt") return <p key={key} className="px-3 py-3">Receipt copy: {displayValue((value as any)?.copy)}</p>;
                  const transition = value as any;
                  if (!transition || typeof transition !== "object" || !("from" in transition) || !("to" in transition)) return null;
                  return (
                    <div key={key} className="grid gap-2 border-b border-pocket-navy/10 px-3 py-3 last:border-b-0 sm:grid-cols-[minmax(120px,0.4fr)_minmax(0,1fr)_minmax(0,1fr)] sm:gap-3">
                      <p className="font-semibold text-pocket-navy">{labels[key] ?? key}</p>
                      <div><p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-pocket-navy/45 sm:hidden">Before</p><AuditValue value={transition.from} /></div>
                      <div><p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-pocket-navy/45 sm:hidden">After</p><AuditValue value={transition.to} /></div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function OrderAuditManagement() {
  const [rows, setRows] = useState<AdminOrderAuditRow[]>([]);
  const [details, setDetails] = useState<Record<string, { events: AdminOrderAuditEvent[] }>>({});
  const [expandedId, setExpandedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState("");
  const [error, setError] = useState("");
  const [preset, setPreset] = useState<AdminRangePreset>("today");
  const [customStart, setCustomStart] = useState(getCurrentBusinessDateKey());
  const [customEnd, setCustomEnd] = useState(getCurrentBusinessDateKey());
  const [segment, setSegment] = useState<AdminOrderSegment>("all");
  const [payment, setPayment] = useState("");
  const [search, setSearch] = useState("");

  async function load() {
    if (preset === "custom" && (!customStart || !customEnd)) return;
    setError("");
    setRefreshing(true);
    try {
      const nextRows = await fetchAdminOrderAudit({
        segment,
        preset,
        start: preset === "custom" ? toPakistanDateIso(customStart) : undefined,
        end: preset === "custom" ? toPakistanDateIso(customEnd, true) : undefined,
        payment: payment || undefined,
        search: search.trim() || undefined
      });
      setRows(nextRows);
      setExpandedId((current) => (nextRows.some((row) => row.id === current) ? current : ""));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load order audit logs.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, [preset, customStart, customEnd, segment, payment]);

  async function toggle(row: AdminOrderAuditRow) {
    if (expandedId === row.id) {
      setExpandedId("");
      return;
    }
    setExpandedId(row.id);
    if (details[row.id]) return;
    setLoadingDetail(row.id);
    try {
      const detail = await fetchAdminOrderAuditDetail(row.id);
      setDetails((current) => ({ ...current, [row.id]: { events: detail.events } }));
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : "Unable to load order history.");
    } finally {
      setLoadingDetail("");
    }
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-4 p-5">
        <div>
          <p className="mb-2 text-sm font-semibold text-pocket-navy">Order type</p>
          <div className="flex flex-wrap gap-2">{segments.map((option) => <Button key={option.value} type="button" variant={segment === option.value ? "default" : "outline"} onClick={() => setSegment(option.value)}>{option.label}</Button>)}</div>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold text-pocket-navy">Payment filters</p>
          <div className="flex flex-wrap gap-2">{paymentOptions.map(([value, label]) => <Button key={value || "all"} type="button" variant={payment === value ? "default" : "outline"} onClick={() => setPayment(value)}>{label}</Button>)}</div>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold text-pocket-navy">Day</p>
          <div className="flex flex-wrap gap-2">{presets.map((option) => <Button key={option.value} type="button" variant={preset === option.value ? "default" : "outline"} onClick={() => setPreset(option.value)}>{option.label}</Button>)}</div>
        </div>
        {preset === "custom" ? <div className="grid gap-3 sm:grid-cols-2"><Input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /><Input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></div> : null}
        <div className="flex items-center gap-3">
          <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pocket-navy/45" /><Input className="pl-9" placeholder="Search orders" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void load(); }} /></div>
          <Button type="button" variant="outline" onClick={() => void load()} disabled={refreshing} aria-label="Refresh order audit"><RefreshCcw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} /><span className="hidden sm:inline">Refresh</span></Button>
        </div>
        <p className="text-sm text-pocket-navy/65">{rows.length} orders currently shown</p>
      </Card>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      {loading ? <Card className="p-8 text-center text-sm text-pocket-navy/60">Loading order audit logs...</Card> : null}
      {!loading && !rows.length ? <Card className="p-8 text-center text-sm text-pocket-navy/60">No orders found for these filters.</Card> : null}
      {!loading ? <div className="space-y-2">{rows.map((row) => {
        const open = expandedId === row.id;
        const order = row.order;
        return <Card key={row.id} className={row.deleted ? "border-red-200 bg-red-50/55" : row.edited ? "border-yellow-200 bg-yellow-50/65" : "overflow-hidden"}>
          <button type="button" className="grid w-full gap-3 p-4 text-left md:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_auto_auto] md:items-center" onClick={() => void toggle(row)}>
            <span className="text-pocket-orange">{open ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}</span>
            <span className="min-w-0"><span className="block font-bold text-pocket-navy">{row.orderNumber} {row.deleted ? <span className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-red-700"><Trash2 className="h-3 w-3" /> Deleted</span> : row.edited ? <span className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-yellow-700"><PencilLine className="h-3 w-3" /> Edited</span> : null}</span><span className="block truncate text-xs text-pocket-navy/60">{itemSummary(order)}</span></span>
            <span className="text-sm text-pocket-navy/70">{formatService(order.serviceType)} · {formatPayment(order.paymentMethod)}<br /><span className="text-xs">{order.customerName} · {order.cashierName ?? (order.channel === "ONLINE" ? "Website customer" : "Staff")}</span></span>
            <span className="text-sm font-bold text-pocket-orange">{formatCurrency(order.totalAmount)}</span>
            <span className="text-xs text-pocket-navy/55">{row.eventCount} events</span>
          </button>
          {open ? <div className="border-t border-pocket-navy/10 bg-pocket-cream/45 p-4"><div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]"><div className="space-y-2"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-orange">Order costs</p>{order.items.map((item) => <div key={item.id} className="flex justify-between gap-3 text-sm text-pocket-navy"><span>{item.quantity} × {item.productName} <span className="text-pocket-navy/55">@ {formatCurrency(item.unitPrice)}</span></span><span className="font-semibold">{formatCurrency(item.quantity * item.unitPrice)}</span></div>)}<div className="border-t border-pocket-navy/10 pt-2 text-sm text-pocket-navy/75">Subtotal {formatCurrency(order.subtotal)} · Discount {formatCurrency(order.discountAmount)} · Delivery {formatCurrency(order.deliveryFee ?? 0)}<span className="ml-2 font-bold text-pocket-orange">Total {formatCurrency(order.totalAmount)}</span></div></div><div><p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-pocket-orange">Audit history</p>{loadingDetail === row.id ? <p className="text-sm text-pocket-navy/60">Loading history...</p> : <AuditTimeline events={details[row.id]?.events ?? []} />}</div></div></div> : null}
        </Card>;
      })}</div> : null}
    </div>
  );
}
