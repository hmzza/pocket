"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, CheckCircle2, TriangleAlert } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { BIBarList, BISection } from "@/components/admin/bi-primitives";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fetchAdminCustomers, fetchAdminDashboard, fetchAdminExpenses, fetchAdminInventory } from "@/lib/admin-client";
import type { AdminCustomer, AdminExpenseData, AdminInventoryData, DashboardData } from "@/lib/types";
import { formatCompactCurrency, formatCompactNumber } from "@/lib/utils";

type HealthMetric = { label: string; score: number; note: string };

export default function BusinessHealthPage() {
  const [data, setData] = useState<{ dashboard: DashboardData; expenses: AdminExpenseData; inventory: AdminInventoryData; customers: AdminCustomer[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([fetchAdminDashboard({ preset: "month", segment: "all" }), fetchAdminExpenses({ preset: "month" }), fetchAdminInventory(), fetchAdminCustomers()])
      .then(([dashboard, expenses, inventory, customers]) => setData({ dashboard, expenses, inventory, customers }))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Failed to load business health."))
      .finally(() => setLoading(false));
  }, []);

  const metrics = useMemo<HealthMetric[]>(() => {
    if (!data) return [];
    const revenue = data.dashboard.summary.revenue;
    const expenseRatio = revenue ? data.expenses.summary.totalAmount / revenue : 1;
    const repeatRate = data.dashboard.summary.activeCustomers ? data.dashboard.summary.repeatCustomers / data.dashboard.summary.activeCustomers : 0;
    const inventoryScore = data.inventory.summary.totalItems ? Math.max(0, 100 - (data.inventory.summary.lowStockItems / data.inventory.summary.totalItems) * 100) : 100;
    return [
      { label: "Sales", score: Math.min(100, Math.round(data.dashboard.summary.orders ? 55 + Math.min(45, data.dashboard.summary.orders * 2) : 0)), note: `${formatCompactNumber(data.dashboard.summary.orders)} orders this month` },
      { label: "Margins", score: Math.max(0, Math.round(100 - expenseRatio * 100)), note: `${(expenseRatio * 100).toFixed(1)}% expenses / revenue` },
      { label: "Inventory", score: Math.round(inventoryScore), note: `${data.inventory.summary.lowStockItems} low-stock items` },
      { label: "Customer growth", score: Math.min(100, data.customers.length ? 65 : 0), note: `${formatCompactNumber(data.customers.length)} customer accounts` },
      { label: "Repeat customers", score: Math.min(100, Math.round(repeatRate * 100)), note: `${(repeatRate * 100).toFixed(1)}% repeat rate` },
      { label: "Expenses", score: Math.max(0, Math.round(100 - Math.min(100, expenseRatio * 120))), note: formatCompactCurrency(data.expenses.summary.totalAmount) },
      { label: "Waste", score: 70, note: "Add wastage targets to sharpen this score" },
      { label: "Marketing", score: 50, note: "Campaign attribution is future-ready" },
      { label: "Cashflow", score: Math.max(0, Math.round(100 - expenseRatio * 80)), note: `${formatCompactCurrency(revenue - data.expenses.summary.totalAmount)} operating surplus` }
    ];
  }, [data]);

  const score = metrics.length ? Math.round(metrics.reduce((sum, metric) => sum + metric.score, 0) / metrics.length) : 0;
  const suggestions = metrics.filter((metric) => metric.score < 65).slice(0, 4);

  return (
    <AdminShell title="Business Health" description="A compact operating scorecard that turns the most important signals into next actions.">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-pocket-navy/10 bg-white p-4 shadow-panel"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-pocket-cream text-pocket-orange"><Activity className="h-5 w-5" /></div><div><p className="font-bold text-pocket-navy">Monthly health review</p><p className="text-sm text-pocket-navy/60">Calculated from live sales, expense, inventory, and customer data.</p></div></div><Link href="/admin/finances"><Button variant="outline">Open Finance<ArrowRight className="h-4 w-4" /></Button></Link></div>
      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
      {loading || !data ? <Card className="p-6 text-sm text-pocket-navy/60">Loading business health...</Card> : <>
        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]"><Card className="flex flex-col items-center justify-center p-8 text-center"><p className="text-xs font-semibold uppercase tracking-[0.24em] text-pocket-orange">Business health</p><p className="mt-5 text-7xl font-black text-pocket-navy">{score}<span className="text-3xl text-pocket-navy/35">/100</span></p><p className="mt-3 text-sm text-pocket-navy/60">{score >= 80 ? "Strong operating position" : score >= 60 ? "Stable, with areas to improve" : "Needs focused attention"}</p></Card><BISection title="Score breakdown" description="Each area is directional until targets are configured for the business."><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{metrics.map((metric) => <div key={metric.label} className="rounded-2xl bg-pocket-cream p-4"><div className="flex items-center justify-between gap-3"><p className="font-bold text-pocket-navy">{metric.label}</p><span className="text-lg font-black text-pocket-orange">{metric.score}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-pocket-orange" style={{ width: `${metric.score}%` }} /></div><p className="mt-2 text-xs text-pocket-navy/55">{metric.note}</p></div>)}</div></BISection></div>
        <div className="grid gap-6 xl:grid-cols-2"><BISection title="Suggestions" description="The highest-leverage items to review next."><div className="space-y-3">{suggestions.length ? suggestions.map((metric) => <div key={metric.label} className="flex items-start gap-3 rounded-2xl border border-pocket-orange/15 bg-pocket-orange/5 p-4"><TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-pocket-orange" /><div><p className="font-bold text-pocket-navy">Review {metric.label.toLowerCase()}</p><p className="mt-1 text-sm text-pocket-navy/60">{metric.note}. Open the related module and set a measurable target.</p></div></div>) : <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="h-5 w-5" />No immediate red flags in the current scorecard.</div>}</div></BISection><BISection title="Health inputs" description="The source measures behind this score."><BIBarList entries={[{ label: "Monthly revenue", value: data.dashboard.summary.revenue }, { label: "Operating expenses", value: data.expenses.summary.totalAmount }, { label: "Inventory value", value: data.inventory.summary.totalStockValue }, { label: "Customer base", value: data.customers.length }]} formatValue={(value) => value > 1000 ? formatCompactCurrency(value) : formatCompactNumber(value)} tone="navy" /></BISection></div>
      </>}
    </AdminShell>
  );
}
