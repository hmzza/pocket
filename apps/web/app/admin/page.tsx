"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, Download, PackagePlus, Receipt, Wallet } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { SalesChart } from "@/components/admin/sales-chart";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fetchAdminDashboard, fetchAdminExpenses } from "@/lib/admin-client";
import { FOODPANDA_COMMISSION_RATE, getRevenueAfterFoodpandaCut } from "@/lib/finance";
import type { AdminExpenseData, AdminOrderSegment, AdminRangePreset, DashboardData } from "@/lib/types";
import { cn, formatCompactCurrency, formatCompactNumber, getCurrentBusinessDateKey, toPakistanDateIso } from "@/lib/utils";

const presets: Array<{ value: AdminRangePreset; label: string }> = [
  { value: "today", label: "Today" }, { value: "7d", label: "7 Days" }, { value: "30d", label: "30 Days" }, { value: "month", label: "This Month" }, { value: "year", label: "This Year" }, { value: "custom", label: "Custom" }
];
const segments: Array<{ value: AdminOrderSegment; label: string }> = [{ value: "all", label: "All" }, { value: "inshop", label: "Inshop" }, { value: "foodpanda", label: "Foodpanda" }];

function KPI({ label, value, helper, accent = false }: { label: string; value: string; helper: string; accent?: boolean }) {
  return <Card className={cn("min-w-0 p-4", accent && "border-pocket-orange/30 bg-pocket-orange/5")}><p className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-orange">{label}</p><p className="mt-2 min-w-0 truncate text-xl font-black text-pocket-navy">{value}</p><p className="mt-1 text-xs text-pocket-navy/60">{helper}</p></Card>;
}

function Breakdown({ title, entries }: { title: string; entries: Array<{ label: string; count: number; revenue: number }> }) {
  const inshopLabels = new Set(["inshop", "dine-in", "takeaway"]);
  const inshopChildren = entries.filter((entry) => inshopLabels.has(entry.label.toLowerCase()));
  const otherEntries = entries.filter((entry) => !inshopLabels.has(entry.label.toLowerCase()));
  const inshop = inshopChildren.length
    ? {
        label: "Inshop",
        count: inshopChildren.reduce((sum, entry) => sum + entry.count, 0),
        revenue: inshopChildren.reduce((sum, entry) => sum + entry.revenue, 0)
      }
    : null;
  const max = Math.max(...entries.map((entry) => entry.revenue), 1);

  function renderRow(entry: { label: string; count: number; revenue: number }, child = false) {
    return <div key={`${child ? "child" : "parent"}-${entry.label}`} className={child ? "pl-4" : ""}><div className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span className={child ? "font-medium text-pocket-navy/75" : "font-semibold text-pocket-navy"}>{entry.label}</span><span className="text-pocket-navy/60">{entry.count} · {formatCompactCurrency(entry.revenue)}</span></div><div className="h-2.5 overflow-hidden rounded-full bg-pocket-cream"><div className={`h-full rounded-full ${child ? "bg-pocket-orange/60" : "bg-pocket-orange"}`} style={{ width: `${Math.max(6, entry.revenue / max * 100)}%` }} /></div></div>;
  }

  return <Card className="p-5"><p className="text-lg font-black text-pocket-navy">{title}</p><p className="mt-1 text-sm text-pocket-navy/60">Inshop includes Dine-in and Takeaway.</p><div className="mt-5 space-y-4">{entries.length ? <>{inshop ? <>{renderRow(inshop)}<div className="space-y-3">{inshopChildren.filter((entry) => entry.label.toLowerCase() !== "inshop").map((entry) => renderRow(entry, true))}</div></> : null}{otherEntries.map((entry) => renderRow(entry))}</> : <p className="text-sm text-pocket-navy/60">No data in this period.</p>}</div></Card>;
}

export default function AdminPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [expenses, setExpenses] = useState<AdminExpenseData | null>(null);
  const [preset, setPreset] = useState<AdminRangePreset>("today");
  const [segment, setSegment] = useState<AdminOrderSegment>("all");
  const [startDate, setStartDate] = useState(getCurrentBusinessDateKey());
  const [endDate, setEndDate] = useState(getCurrentBusinessDateKey());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (preset === "custom" && (!startDate || !endDate)) return;
    let cancelled = false;
    const params = preset === "custom" ? { preset, start: toPakistanDateIso(startDate), end: toPakistanDateIso(endDate, true), segment } : { preset, segment };
    setLoading(true);
    Promise.all([fetchAdminDashboard(params), fetchAdminExpenses(preset === "custom" ? { preset, start: params.start, end: params.end } : { preset })])
      .then(([nextDashboard, nextExpenses]) => { if (!cancelled) { setDashboard(nextDashboard); setExpenses(nextExpenses); } })
      .catch((loadError) => { if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Failed to load overview."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [preset, segment, startDate, endDate]);

  const foodpandaRevenue = useMemo(() => dashboard?.breakdowns.serviceTypes.find((entry) => entry.label.toLowerCase() === "foodpanda")?.revenue ?? 0, [dashboard]);
  const directRevenue = Math.max(0, (dashboard?.summary.revenue ?? 0) - foodpandaRevenue);
  const revenueAfterFoodpandaCut = getRevenueAfterFoodpandaCut(dashboard?.summary.revenue ?? 0, foodpandaRevenue);
  const foodpandaCommission = foodpandaRevenue * FOODPANDA_COMMISSION_RATE;
  const operatingExpenses = expenses?.summary.totalAmount ?? 0;
  const netProfit = revenueAfterFoodpandaCut - operatingExpenses;
  const netMargin = revenueAfterFoodpandaCut ? netProfit / revenueAfterFoodpandaCut * 100 : 0;

  return <AdminShell title="Overview" description="A focused business snapshot: performance, mix, product momentum, and the few actions that need attention now.">
    <Card className="overflow-hidden border-none bg-[linear-gradient(135deg,_#102a43,_#0f172a_55%,_#1f2937)] p-5 text-white shadow-[0_24px_64px_rgba(16,42,67,0.28)]"><div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.32em] text-amber-300">Performance window</p><h2 className="mt-2 text-3xl font-black">Business at a glance</h2><p className="mt-2 max-w-xl text-sm text-white/70">Keep the Overview for the signals that change a decision. Open Business Analytics for the full picture.</p></div><div className="space-y-3"><div className="flex flex-wrap gap-2">{segments.map((option) => <button key={option.value} type="button" onClick={() => setSegment(option.value)} className={cn("rounded-full border px-3 py-1.5 text-sm font-semibold", segment === option.value ? "border-white bg-white text-slate-950" : "border-white/15 bg-white/5 text-white hover:bg-white/10")}>{option.label}</button>)}</div><div className="flex flex-wrap gap-2">{presets.map((option) => <button key={option.value} type="button" onClick={() => setPreset(option.value)} className={cn("rounded-full border px-3 py-1.5 text-sm font-semibold", preset === option.value ? "border-amber-300 bg-amber-300 text-slate-950" : "border-white/15 bg-white/5 text-white hover:bg-white/10")}>{option.label}</button>)}</div>{preset === "custom" ? <div className="flex flex-wrap gap-2"><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="h-10 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white" /><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="h-10 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white" /></div> : null}</div></div>{dashboard ? <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm"><CalendarDays className="h-4 w-4 text-amber-300" />{dashboard.range.label}</div> : null}</Card>
    {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
    {loading || !dashboard ? <Card className="p-6 text-sm text-pocket-navy/60">Loading overview...</Card> : <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><KPI label="Gross revenue" value={formatCompactCurrency(dashboard.summary.revenue)} helper={`${dashboard.summary.revenueDelta}% vs previous period · before commission`} accent /><KPI label="Revenue after Foodpanda cut" value={formatCompactCurrency(revenueAfterFoodpandaCut)} helper={`${formatCompactCurrency(foodpandaCommission)} Foodpanda commission`} /><KPI label="Orders" value={formatCompactNumber(dashboard.summary.orders)} helper={`${dashboard.summary.ordersDelta}% vs previous period`} /><KPI label="Average order value" value={formatCompactCurrency(dashboard.summary.averageOrderValue)} helper="Gross revenue per order" /><KPI label="Active customers" value={formatCompactNumber(dashboard.summary.activeCustomers)} helper="Customers who ordered" /></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><KPI label="Net profit" value={formatCompactCurrency(netProfit)} helper={`${netMargin.toFixed(1)}% net margin · after expenses`} /><KPI label="Food cost %" value="—" helper="Ingredients and packaging cost as % of revenue" /><KPI label="Gross margin %" value="—" helper="Revenue left after food costs" /><KPI label="Net margin %" value={`${netMargin.toFixed(1)}%`} helper="Revenue left after operating expenses" /><KPI label="Foodpanda %" value={`${dashboard.summary.revenue ? (foodpandaRevenue / dashboard.summary.revenue * 100).toFixed(1) : "0.0"}%`} helper="Share of total revenue" /><KPI label="Direct sales %" value={`${dashboard.summary.revenue ? (directRevenue / dashboard.summary.revenue * 100).toFixed(1) : "0.0"}%`} helper="Inshop and other direct channels" /></div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]"><SalesChart sales={dashboard.series} title="Revenue trend" description="Daily or period revenue movement." /><Card className="p-5"><p className="text-lg font-black text-pocket-navy">Quick actions</p><p className="mt-1 text-sm text-pocket-navy/60">Jump to the next operational task.</p><div className="mt-5 grid gap-3"><Link href="/admin/expenses"><Button className="w-full justify-between">Add Expense<Receipt className="h-4 w-4" /></Button></Link><Link href="/admin/products"><Button variant="outline" className="w-full justify-between">Add Product<PackagePlus className="h-4 w-4" /></Button></Link><Button variant="outline" className="w-full justify-between" onClick={() => window.location.assign("/api/admin/expenses/export?preset=30d")}>Export Reports<Download className="h-4 w-4" /></Button><Link href="/admin/finances"><Button variant="outline" className="w-full justify-between">Open Finance<Wallet className="h-4 w-4" /></Button></Link></div><Link href="/admin/analytics" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-pocket-orange">Open full Business Analytics<ArrowRight className="h-4 w-4" /></Link></Card></div>
      <div className="grid gap-6 xl:grid-cols-2"><Breakdown title="Revenue split" entries={dashboard.breakdowns.serviceTypes} /><Card className="p-5"><p className="text-lg font-black text-pocket-navy">Top 5 products</p><p className="mt-1 text-sm text-pocket-navy/60">The products driving this selected period.</p><div className="mt-5 space-y-3">{dashboard.topProducts.slice(0, 5).map((product, index) => <div key={product.productName} className="flex items-center justify-between gap-4 rounded-2xl bg-pocket-cream px-4 py-3"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.18em] text-pocket-orange">#{index + 1}</p><p className="mt-1 truncate font-bold text-pocket-navy">{product.productName}</p></div><div className="text-right"><p className="font-black text-pocket-navy">{product.quantity} sold</p><p className="text-xs text-pocket-navy/60">{formatCompactCurrency(product.revenue)}</p></div></div>)}{dashboard.topProducts.length === 0 ? <p className="text-sm text-pocket-navy/60">No product sales in this period.</p> : null}</div></Card></div>
    </>}
  </AdminShell>;
}
