"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, PencilLine, RefreshCcw, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchAdminOrderAudit, fetchAdminOrderAuditDetail } from "@/lib/admin-client";
import type { AdminOrder, AdminOrderAuditEvent, AdminOrderAuditRow, AdminOrderSegment, AdminRangePreset } from "@/lib/types";
import { formatCurrency, getCurrentBusinessDateKey, toPakistanDateIso } from "@/lib/utils";

const segments: Array<{ value: AdminOrderSegment; label: string }> = [
  { value: "all", label: "All" },
  { value: "inshop", label: "Dine-in / Takeaway" },
  { value: "foodpanda", label: "Foodpanda" },
  { value: "delivery", label: "Delivery" }
];

const presets: Array<{ value: AdminRangePreset; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "month", label: "This Month" },
  { value: "year", label: "This Year" },
  { value: "custom", label: "Custom" }
];

const paymentOptions = [
  ["", "All payments"],
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
  return order.items.map((item) => `${item.quantity}x ${item.productName}`).join(", ") || "No item details";
}

function eventLabel(event: AdminOrderAuditEvent) {
  const labels: Record<string, string> = {
    CREATED: "Order created",
    UPDATED: "Order edited",
    STATUS_CHANGED: "Status changed",
    PAYMENT_STATUS_CHANGED: "Payment status changed",
    RIDER_DISPATCHED: "Rider dispatched",
    RECEIPT_PRINTED: "Receipt printed",
    DELETED: "Order deleted"
  };
  return labels[event.eventType] ?? event.eventType.replaceAll("_", " ");
}

function formatChange(value: unknown) {
  if (value == null) return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function AuditTimeline({ events }: { events: AdminOrderAuditEvent[] }) {
  if (!events.length) {
    return <p className="text-sm text-pocket-navy/60">No detailed audit events were recorded before this feature was enabled.</p>;
  }

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
            {changes.length ? (
              <div className="mt-2 space-y-1 text-sm text-pocket-navy/75">
                {changes.map(([key, value]) => {
                  if (key === "created") return <p key={key}>Initial order snapshot recorded.</p>;
                  if (key === "receipt") return <p key={key}>Copy: {formatChange((value as any)?.copy)}</p>;
                  return (
                    <p key={key}>
                      <span className="font-semibold">{key.replaceAll(/([A-Z])/g, " $1")}:</span>{" "}
                      {formatChange((value as any)?.from)} <span className="text-pocket-orange">→</span> {formatChange((value as any)?.to)}
                    </p>
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
  const [scope, setScope] = useState<"all" | "active" | "deleted">("all");
  const [status, setStatus] = useState("");
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
        scope,
        status: status || undefined,
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
  }, [preset, customStart, customEnd, segment, payment, scope, status]);

  const totalValue = useMemo(() => rows.reduce((sum, row) => sum + row.order.totalAmount, 0), [rows]);

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
        <div className="flex flex-wrap gap-2">
          {segments.map((option) => <Button key={option.value} type="button" variant={segment === option.value ? "default" : "outline"} onClick={() => setSegment(option.value)}>{option.label}</Button>)}
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px_180px]">
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pocket-navy/45" /><Input className="pl-9" placeholder="Search orders" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void load(); }} /></div>
          <select className="h-10 rounded-lg border border-pocket-navy/15 bg-white px-3 text-sm text-pocket-navy" value={payment} onChange={(event) => setPayment(event.target.value)}>{paymentOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select className="h-10 rounded-lg border border-pocket-navy/15 bg-white px-3 text-sm text-pocket-navy" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{["PENDING", "CONFIRMED", "PREPARING", "READY", "WATCH_LATER", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select>
          <select className="h-10 rounded-lg border border-pocket-navy/15 bg-white px-3 text-sm text-pocket-navy" value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}><option value="all">Active and deleted</option><option value="active">Active only</option><option value="deleted">Deleted only</option></select>
        </div>
        <div className="flex flex-wrap gap-2">{presets.map((option) => <Button key={option.value} type="button" variant={preset === option.value ? "default" : "outline"} onClick={() => setPreset(option.value)}>{option.label}</Button>)}</div>
        {preset === "custom" ? <div className="grid gap-3 sm:grid-cols-2"><Input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /><Input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></div> : null}
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-pocket-navy/65"><span>{rows.length} orders · {formatCurrency(totalValue)}</span><Button type="button" variant="outline" onClick={() => void load()} disabled={refreshing}><RefreshCcw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Refresh</Button></div>
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
