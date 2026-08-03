"use client";

import { useEffect, useMemo, useState } from "react";
import { BIBarList, BISection } from "@/components/admin/bi-primitives";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchAdminOrders, fetchAdminProducts } from "@/lib/admin-client";
import type { AdminOrder, AdminProduct, AdminRangePreset } from "@/lib/types";
import { formatCompactCurrency, formatCurrency, toPakistanDateIso } from "@/lib/utils";

type ProductMetric = {
  product: AdminProduct;
  units: number;
  revenue: number;
  foodCost: number;
  grossProfit: number;
  grossMargin: number;
};
type SortKey = "revenue" | "units" | "profit";
type Period = AdminRangePreset | "custom";

const periods: Array<{ value: Period; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "month", label: "This Month" },
  { value: "year", label: "This Year" },
  { value: "custom", label: "Custom" }
];

function ProductKpi({ label, value, helper }: { label: string; value: string; helper: string }) {
  return <Card className="p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-pocket-orange">{label}</p><p className="mt-2 line-clamp-1 text-lg font-black text-pocket-navy">{value}</p><p className="mt-1 line-clamp-1 text-xs text-pocket-navy/60">{helper}</p></Card>;
}

function metricValue(metric: ProductMetric, sort: SortKey) {
  return sort === "units" ? metric.units : sort === "profit" ? metric.grossProfit : metric.revenue;
}

function aggregateOrders(products: AdminProduct[], orders: AdminOrder[]) {
  const sales = new Map<string, { units: number; revenue: number }>();

  for (const order of orders) {
    if (["CANCELLED", "REFUNDED"].includes(order.status)) continue;
    for (const item of order.items) {
      const key = item.productName.trim().toLowerCase();
      const current = sales.get(key) ?? { units: 0, revenue: 0 };
      current.units += Number(item.quantity) || 0;
      current.revenue += (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
      sales.set(key, current);
    }
  }

  return products.map((product) => {
    const sale = sales.get(product.name.trim().toLowerCase()) ?? { units: 0, revenue: 0 };
    const foodCost = sale.units * (product.costSummary?.totalCost ?? 0);
    const grossProfit = sale.revenue - foodCost;
    return {
      product,
      units: sale.units,
      revenue: sale.revenue,
      foodCost,
      grossProfit,
      grossMargin: sale.revenue ? (grossProfit / sale.revenue) * 100 : 0
    } satisfies ProductMetric;
  });
}

export function ProductAnalytics() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [period, setPeriod] = useState<Period>("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("revenue");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetchAdminProducts().then((data) => setProducts(data.products)).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load products."));
  }, []);

  useEffect(() => {
    if (period === "custom" && (!customStart || !customEnd)) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    void fetchAdminOrders({
      preset: period === "custom" ? "custom" : period,
      ...(period === "custom" ? { start: toPakistanDateIso(customStart), end: toPakistanDateIso(customEnd, true) } : {})
    }).then((data) => {
      if (!cancelled) setOrders(data);
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load product sales.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [period, customStart, customEnd]);

  const metrics = useMemo(() => aggregateOrders(products, orders), [products, orders]);
  const categories = useMemo(() => Array.from(new Set(products.map((product) => product.category.name))).sort(), [products]);
  const filtered = useMemo(() => metrics.filter((item) => {
    const matchesCategory = category === "all" || item.product.category.name === category;
    const matchesSearch = !search.trim() || item.product.name.toLowerCase().includes(search.trim().toLowerCase());
    return matchesCategory && matchesSearch;
  }), [category, metrics, search]);
  const sorted = useMemo(() => [...filtered].sort((left, right) => metricValue(right, sort) - metricValue(left, sort)), [filtered, sort]);
  const ranked = useMemo(() => [...filtered].sort((left, right) => right.units - left.units), [filtered]);
  const topTen = new Set(ranked.slice(0, 10).filter((item) => item.units > 0).map((item) => item.product.id));
  const bottomTen = new Set([...ranked].reverse().slice(0, 10).filter((item) => item.units > 0).map((item) => item.product.id));
  const totals = filtered.reduce((total, item) => ({
    units: total.units + item.units,
    revenue: total.revenue + item.revenue,
    foodCost: total.foodCost + item.foodCost,
    profit: total.profit + item.grossProfit
  }), { units: 0, revenue: 0, foodCost: 0, profit: 0 });
  const sold = filtered.filter((item) => item.units > 0);
  const topSelling = [...sold].sort((a, b) => b.units - a.units)[0];
  const topRevenue = [...sold].sort((a, b) => b.revenue - a.revenue)[0];
  const topProfit = [...sold].sort((a, b) => b.grossProfit - a.grossProfit)[0];

  return <div className="space-y-6">
    <div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Product intelligence</p><p className="mt-1 text-sm text-pocket-navy/60">Every menu item, with sales and current inventory recipe costing for the selected period.</p></div>
    <Card className="p-4"><div className="flex flex-wrap items-center gap-2">
      {periods.map((option) => <Button key={option.value} type="button" variant={period === option.value ? "default" : "outline"} size="sm" onClick={() => setPeriod(option.value)}>{option.label}</Button>)}
    </div>{period === "custom" && <div className="mt-4 grid gap-3 sm:grid-cols-2"><Input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /><Input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></div>}</Card>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><ProductKpi label="Top seller" value={topSelling?.product.name ?? "—"} helper={topSelling ? `${topSelling.units} units sold` : "No sales in period"} /><ProductKpi label="Highest revenue" value={topRevenue?.product.name ?? "—"} helper={topRevenue ? formatCompactCurrency(topRevenue.revenue) : "No sales in period"} /><ProductKpi label="Highest gross profit" value={topProfit?.product.name ?? "—"} helper={topProfit ? formatCompactCurrency(topProfit.grossProfit) : "Add recipe costs"} /></div>
    <div className="grid gap-6 xl:grid-cols-2"><BISection title="Top 10 products" description="Ranked by units sold in the selected period."><BIBarList entries={[...metrics].sort((a, b) => b.units - a.units).slice(0, 10).map((item) => ({ label: item.product.name, value: item.units, detail: formatCompactCurrency(item.revenue) }))} formatValue={(value) => `${value} units`} /></BISection><BISection title="Revenue by product" description="The largest revenue contributors in the selected period."><BIBarList entries={[...metrics].sort((a, b) => b.revenue - a.revenue).slice(0, 10).map((item) => ({ label: item.product.name, value: item.revenue, detail: `${item.grossMargin.toFixed(1)}% margin` }))} formatValue={formatCompactCurrency} tone="navy" /></BISection></div>
    <BISection title="Product performance" description="Top 10 and bottom 10 are highlighted by units sold. Food cost uses the current recipe and inventory cost allocation.">
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_220px_auto] md:items-center"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product name" /><select value={category} onChange={(event) => setCategory(event.target.value)} className="flex h-10 rounded-md border border-pocket-navy/15 bg-white px-3 text-sm text-pocket-navy"><option value="all">All categories</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select><div className="flex flex-wrap gap-2">{(["revenue", "units", "profit"] as const).map((option) => <Button key={option} type="button" size="sm" variant={sort === option ? "default" : "outline"} onClick={() => setSort(option)}>Sort {option === "units" ? "units" : option}</Button>)}</div></div>
      {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading ? <p className="text-sm text-pocket-navy/60">Loading product sales...</p> : <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="border-b border-pocket-navy/10 text-xs uppercase tracking-[0.12em] text-pocket-navy/50"><tr><th className="pb-3">Product name</th><th className="pb-3">Category</th><th className="pb-3">Units sold</th><th className="pb-3">Selling price</th><th className="pb-3">Revenue generated</th><th className="pb-3">Food cost</th><th className="pb-3">Gross profit</th><th className="pb-3">Gross margin</th></tr></thead><tbody>{sorted.map((item) => <tr key={item.product.id} className={`border-b border-pocket-navy/5 ${topTen.has(item.product.id) ? "bg-emerald-50/70" : bottomTen.has(item.product.id) ? "bg-red-50/60" : ""}`}><td className="py-3 font-bold text-pocket-navy">{item.product.name}<span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-pocket-navy/45">{topTen.has(item.product.id) ? "Top 10" : bottomTen.has(item.product.id) ? "Bottom 10" : ""}</span></td><td className="py-3 text-pocket-navy/65">{item.product.category.name}</td><td className="py-3 text-pocket-navy/70">{item.units}</td><td className="py-3 text-pocket-navy/70">{formatCurrency(item.product.basePrice)}</td><td className="py-3 font-semibold text-pocket-navy">{formatCurrency(item.revenue)}</td><td className="py-3 text-pocket-navy/70">{formatCurrency(item.foodCost)}</td><td className={`py-3 font-semibold ${item.grossProfit >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatCurrency(item.grossProfit)}</td><td className="py-3 font-semibold text-pocket-orange">{item.grossMargin.toFixed(1)}%</td></tr>)}</tbody><tfoot className="border-t-2 border-pocket-navy/15 text-sm font-black text-pocket-navy"><tr><td className="pt-4" colSpan={2}>Filtered totals</td><td className="pt-4">{totals.units}</td><td className="pt-4">—</td><td className="pt-4">{formatCurrency(totals.revenue)}</td><td className="pt-4">{formatCurrency(totals.foodCost)}</td><td className="pt-4">{formatCurrency(totals.profit)}</td><td className="pt-4">{totals.revenue ? `${((totals.profit / totals.revenue) * 100).toFixed(1)}%` : "0.0%"}</td></tr></tfoot></table></div>}
    </BISection>
  </div>;
}
