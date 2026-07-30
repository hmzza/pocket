"use client";

import { useEffect, useMemo, useState } from "react";
import { BIBarList, BISection, FutureMetric } from "@/components/admin/bi-primitives";
import { Card } from "@/components/ui/card";
import { fetchAdminDashboard, fetchAdminProducts } from "@/lib/admin-client";
import type { AdminProduct, DashboardData } from "@/lib/types";
import { formatCompactCurrency, formatCurrency } from "@/lib/utils";

type ProductMetric = { product: AdminProduct; units: number; revenue: number; foodCost: number; grossProfit: number; grossMargin: number };

function ProductKpi({ label, value, helper }: { label: string; value: string; helper: string }) {
  return <Card className="p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-pocket-orange">{label}</p><p className="mt-2 line-clamp-1 text-lg font-black text-pocket-navy">{value}</p><p className="mt-1 line-clamp-1 text-xs text-pocket-navy/60">{helper}</p></Card>;
}

export function ProductAnalytics() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [sort, setSort] = useState<"revenue" | "orders" | "profit" | "margin">("revenue");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchAdminDashboard({ preset: "30d", segment: "all" }), fetchAdminProducts()])
      .then(([nextDashboard, nextProducts]) => { setDashboard(nextDashboard); setProducts(nextProducts.products); })
      .finally(() => setLoading(false));
  }, []);

  const metrics = useMemo<ProductMetric[]>(() => {
    if (!dashboard) return [];
    const sales = new Map(dashboard.topProducts.map((entry) => [entry.productName.toLowerCase(), entry]));
    return products.map((product) => {
      const sale = sales.get(product.name.toLowerCase());
      const units = sale?.quantity ?? 0;
      const revenue = sale?.revenue ?? 0;
      const foodCost = units * (product.costSummary?.totalCost ?? 0);
      const grossProfit = revenue - foodCost;
      return { product, units, revenue, foodCost, grossProfit, grossMargin: revenue ? (grossProfit / revenue) * 100 : product.costSummary?.marginPercent ?? 0 };
    });
  }, [dashboard, products]);

  const sorted = useMemo(() => [...metrics].sort((a, b) => sort === "orders" ? b.units - a.units : sort === "profit" ? b.grossProfit - a.grossProfit : sort === "margin" ? b.grossMargin - a.grossMargin : b.revenue - a.revenue), [metrics, sort]);
  const sold = metrics.filter((item) => item.units > 0);
  const topSelling = [...sold].sort((a, b) => b.units - a.units)[0];
  const topRevenue = [...sold].sort((a, b) => b.revenue - a.revenue)[0];
  const topMargin = [...metrics].sort((a, b) => b.grossMargin - a.grossMargin)[0];
  const lowSelling = [...sold].sort((a, b) => a.units - b.units)[0];
  const lowMargin = [...metrics].filter((item) => item.product.costSummary).sort((a, b) => a.grossMargin - b.grossMargin)[0];

  if (loading) return <Card className="p-5 text-sm text-pocket-navy/60">Loading product analytics...</Card>;

  return <div className="space-y-6">
    <div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Product intelligence</p><p className="mt-1 text-sm text-pocket-navy/60">Performance from the last 30 days, joined with current recipe costing.</p></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><ProductKpi label="Top selling" value={topSelling?.product.name ?? "—"} helper={topSelling ? `${topSelling.units} units` : "No sales yet"} /><ProductKpi label="Highest revenue" value={topRevenue?.product.name ?? "—"} helper={topRevenue ? formatCompactCurrency(topRevenue.revenue) : "No sales yet"} /><ProductKpi label="Highest margin" value={topMargin?.product.name ?? "—"} helper={topMargin ? `${topMargin.grossMargin.toFixed(1)}% gross margin` : "Add recipe costs"} /><ProductKpi label="Lowest selling" value={lowSelling?.product.name ?? "—"} helper={lowSelling ? `${lowSelling.units} units` : "No sales yet"} /><ProductKpi label="Lowest margin" value={lowMargin?.product.name ?? "—"} helper={lowMargin ? `${lowMargin.grossMargin.toFixed(1)}% gross margin` : "Add recipe costs"} /></div>
    <div className="grid gap-6 xl:grid-cols-2"><BISection title="Top 10 products" description="Unit volume in the selected period."><BIBarList entries={sorted.slice(0, 10).map((item) => ({ label: item.product.name, value: item.units, detail: formatCompactCurrency(item.revenue) }))} formatValue={(value) => `${value} units`} /></BISection><BISection title="Revenue by product" description="Revenue contribution from tracked product sales."><BIBarList entries={[...metrics].sort((a, b) => b.revenue - a.revenue).slice(0, 10).map((item) => ({ label: item.product.name, value: item.revenue, detail: `${item.grossMargin.toFixed(1)}% margin` }))} formatValue={formatCompactCurrency} tone="navy" /></BISection></div>
    <BISection title="Product performance table" description="Sort by revenue, orders, profit, or margin. Food cost uses the current recipe cost and is directional for the selected period."><div className="mb-4 flex flex-wrap gap-2">{(["revenue", "orders", "profit", "margin"] as const).map((option) => <button key={option} type="button" onClick={() => setSort(option)} className={`rounded-full border px-3 py-1.5 text-xs font-bold capitalize ${sort === option ? "border-pocket-orange bg-pocket-orange text-white" : "border-pocket-navy/15 text-pocket-navy"}`}>{option}</button>)}</div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-pocket-navy/10 text-xs uppercase tracking-[0.16em] text-pocket-navy/50"><tr><th className="pb-3">Product</th><th className="pb-3">Units sold</th><th className="pb-3">Revenue</th><th className="pb-3">Food cost</th><th className="pb-3">Gross profit</th><th className="pb-3">Gross margin</th></tr></thead><tbody>{sorted.map((item) => <tr key={item.product.id} className="border-b border-pocket-navy/5"><td className="py-3 font-bold text-pocket-navy">{item.product.name}</td><td className="py-3 text-pocket-navy/70">{item.units}</td><td className="py-3 font-semibold text-pocket-navy">{formatCurrency(item.revenue)}</td><td className="py-3 text-pocket-navy/70">{formatCurrency(item.foodCost)}</td><td className="py-3 font-semibold text-emerald-700">{formatCurrency(item.grossProfit)}</td><td className="py-3 font-semibold text-pocket-orange">{item.grossMargin.toFixed(1)}%</td></tr>)}</tbody></table></div></BISection>
    <div className="grid gap-3 sm:grid-cols-2"><FutureMetric label="Most cancelled product" description="Requires order status history grouped at product-line level." /><FutureMetric label="Most refunded product" description="Refund events are not yet persisted separately." /></div>
  </div>;
}
