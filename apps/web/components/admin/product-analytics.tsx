"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, RefreshCcw, Save } from "lucide-react";
import { BIBarList, BISection } from "@/components/admin/bi-primitives";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  downloadAdminProductAnalyticsExport,
  fetchAdminOrders,
  fetchAdminProducts,
  updateAdminProductCostSettings
} from "@/lib/admin-client";
import type { AdminOrder, AdminProduct, AdminRangePreset } from "@/lib/types";
import { formatCompactCurrency, formatCurrency, toPakistanDateIso } from "@/lib/utils";

type SortKey = "revenue" | "profit" | "units" | "margin";
type ProductDraft = { sellingPrice: string; foodPackagingCost: string; isActive: boolean };
type ProductMetric = {
  product: AdminProduct;
  sellingPrice: number;
  foodPackagingCost: number;
  units: number;
  revenue: number;
  totalFoodCost: number;
  grossProfit: number;
  grossMargin: number;
};

const periods: Array<{ value: AdminRangePreset; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "month", label: "This Month" },
  { value: "year", label: "This Year" },
  { value: "custom", label: "Custom" }
];

function SummaryCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return <Card className="p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-pocket-orange">{label}</p><p className="mt-2 line-clamp-1 text-lg font-black text-pocket-navy">{value}</p>{helper ? <p className="mt-1 line-clamp-1 text-xs text-pocket-navy/60">{helper}</p> : null}</Card>;
}

function metricValue(metric: ProductMetric, sort: SortKey) {
  return sort === "units" ? metric.units : sort === "profit" ? metric.grossProfit : sort === "margin" ? metric.grossMargin : metric.revenue;
}

function aggregateOrders(products: AdminProduct[], orders: AdminOrder[], drafts: Record<string, ProductDraft>) {
  const unitsByName = new Map<string, number>();
  for (const order of orders) {
    if (["CANCELLED", "REFUNDED"].includes(order.status)) continue;
    for (const item of order.items) {
      const key = item.productName.trim().toLowerCase();
      unitsByName.set(key, (unitsByName.get(key) ?? 0) + (Number(item.quantity) || 0));
    }
  }

  return products.map((product) => {
    const draft = drafts[product.id];
    const sellingPrice = Number(draft?.sellingPrice ?? product.basePrice) || 0;
    const foodPackagingCost = Number(draft?.foodPackagingCost ?? product.foodPackagingCost ?? product.costSummary?.totalCost ?? 0) || 0;
    const units = unitsByName.get(product.name.trim().toLowerCase()) ?? 0;
    const revenue = sellingPrice * units;
    const totalFoodCost = foodPackagingCost * units;
    const grossProfit = revenue - totalFoodCost;
    return { product, sellingPrice, foodPackagingCost, units, revenue, totalFoodCost, grossProfit, grossMargin: revenue ? (grossProfit / revenue) * 100 : 0 } satisfies ProductMetric;
  });
}

function formatUpdatedAt(value?: string | null) {
  if (!value) return "Not configured";
  return new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" }).format(new Date(value));
}

export function ProductAnalytics() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ProductDraft>>({});
  const [period, setPeriod] = useState<AdminRangePreset>("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("revenue");
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetchAdminProducts().then((data) => {
      setProducts(data.products);
      setDrafts((current) => Object.fromEntries(data.products.map((product) => [product.id, current[product.id] ?? {
        sellingPrice: String(product.basePrice),
        foodPackagingCost: String(product.foodPackagingCost ?? product.costSummary?.totalCost ?? 0),
        isActive: product.isActive
      }])));
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load product costs."));
  }, [refreshKey]);

  useEffect(() => {
    if (period === "custom" && (!customStart || !customEnd)) return;
    let cancelled = false;
    setLoading(true);
    void fetchAdminOrders({
      preset: period,
      ...(period === "custom" ? { start: toPakistanDateIso(customStart), end: toPakistanDateIso(customEnd, true) } : {})
    }).then((data) => {
      if (!cancelled) setOrders(data);
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load product sales.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [customEnd, customStart, period, refreshKey]);

  useEffect(() => {
    const interval = window.setInterval(() => setRefreshKey((current) => current + 1), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const categories = useMemo(() => Array.from(new Set(products.map((product) => product.category.name))).sort(), [products]);
  const metrics = useMemo(() => aggregateOrders(products, orders, drafts), [drafts, orders, products]);
  const filtered = useMemo(() => metrics.filter((item) => {
    const matchesCategory = category === "all" || item.product.category.name === category;
    const matchesSearch = !search.trim() || item.product.name.toLowerCase().includes(search.trim().toLowerCase());
    return matchesCategory && matchesSearch;
  }), [category, metrics, search]);
  const sorted = useMemo(() => [...filtered].sort((left, right) => metricValue(right, sort) - metricValue(left, sort)), [filtered, sort]);
  const ranked = useMemo(() => [...filtered].sort((left, right) => right.units - left.units), [filtered]);
  const topTen = new Set(ranked.slice(0, 10).filter((item) => item.units > 0).map((item) => item.product.id));
  const bottomTen = new Set(ranked.filter((item) => item.units > 0 && !topTen.has(item.product.id)).slice(-10).map((item) => item.product.id));
  const totals = filtered.reduce((total, item) => ({
    units: total.units + item.units,
    revenue: total.revenue + item.revenue,
    foodCost: total.foodCost + item.totalFoodCost,
    profit: total.profit + item.grossProfit
  }), { units: 0, revenue: 0, foodCost: 0, profit: 0 });
  const bestSelling = [...filtered].sort((a, b) => b.units - a.units)[0];
  const highestProfit = [...filtered].sort((a, b) => b.grossProfit - a.grossProfit)[0];

  function updateDraft(productId: string, patch: Partial<ProductDraft>) {
    setDrafts((current) => ({
      ...current,
      [productId]: {
        sellingPrice: current[productId]?.sellingPrice ?? "0",
        foodPackagingCost: current[productId]?.foodPackagingCost ?? "0",
        isActive: current[productId]?.isActive ?? true,
        ...patch
      }
    }));
  }

  async function saveProduct(product: AdminProduct) {
    const draft = drafts[product.id];
    if (!draft || !draft.sellingPrice.trim() || !draft.foodPackagingCost.trim() || Number.isNaN(Number(draft.sellingPrice)) || Number.isNaN(Number(draft.foodPackagingCost))) {
      setError("Selling price and food cost must be valid numbers.");
      return;
    }
    setSavingId(product.id);
    setError("");
    try {
      const updated = await updateAdminProductCostSettings(product.id, {
        sellingPrice: Number(draft.sellingPrice),
        foodPackagingCost: Number(draft.foodPackagingCost),
        isActive: draft.isActive
      });
      setProducts((current) => current.map((item) => item.id === product.id ? {
        ...item,
        basePrice: Number(updated.basePrice),
        foodPackagingCost: updated.foodPackagingCost == null ? null : Number(updated.foodPackagingCost),
        isActive: Boolean(updated.isActive),
        costSettingsUpdatedAt: updated.costSettingsUpdatedAt ?? null
      } : item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save product cost settings.");
    } finally {
      setSavingId("");
    }
  }

  async function exportAnalytics() {
    setExporting(true);
    setError("");
    try {
      await downloadAdminProductAnalyticsExport({
        preset: period,
        ...(period === "custom" ? { start: toPakistanDateIso(customStart), end: toPakistanDateIso(customEnd, true) } : {}),
        category,
        search,
        sort
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not export product analytics.");
    } finally {
      setExporting(false);
    }
  }

  return <div className="space-y-6">
    <div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Product intelligence</p><p className="mt-1 text-sm text-pocket-navy/60">Edit selling prices and food costs once; every performance calculation updates from the saved settings.</p></div>
    <Card className="p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2">{periods.map((option) => <Button key={option.value} type="button" variant={period === option.value ? "default" : "outline"} size="sm" onClick={() => setPeriod(option.value)}>{option.label}</Button>)}</div><div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setRefreshKey((current) => current + 1)} disabled={loading}><RefreshCcw className="mr-2 h-4 w-4" />Refresh</Button><Button type="button" size="sm" onClick={() => void exportAnalytics()} disabled={exporting || (period === "custom" && (!customStart || !customEnd))}><Download className="mr-2 h-4 w-4" />{exporting ? "Exporting..." : "Export to Excel"}</Button></div></div>{period === "custom" ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><Input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /><Input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></div> : null}</Card>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7"><SummaryCard label="Total revenue" value={formatCompactCurrency(totals.revenue)} /><SummaryCard label="Total food cost" value={formatCompactCurrency(totals.foodCost)} /><SummaryCard label="Gross profit" value={formatCompactCurrency(totals.profit)} /><SummaryCard label="Overall margin" value={totals.revenue ? `${((totals.profit / totals.revenue) * 100).toFixed(1)}%` : "0.0%"} /><SummaryCard label="Best selling" value={bestSelling?.product.name ?? "—"} helper={bestSelling ? `${bestSelling.units} units` : "No sales"} /><SummaryCard label="Highest profit" value={highestProfit?.product.name ?? "—"} helper={highestProfit ? formatCompactCurrency(highestProfit.grossProfit) : "No sales"} /><SummaryCard label="Products" value={String(filtered.length)} helper="In current filter" /></div>
    <BISection title="Product cost settings" description="These editable values drive the performance table below. Active status controls whether the product remains available.">
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_220px]"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product name" /><select value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 rounded-md border border-pocket-navy/20 bg-white px-3 text-sm text-pocket-navy"><option value="all">All categories</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
      {error ? <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-pocket-navy/10 text-xs uppercase tracking-[0.12em] text-pocket-navy/50"><tr><th className="pb-3">Product name</th><th className="pb-3">Category</th><th className="pb-3">Selling price</th><th className="pb-3">Food &amp; packaging cost</th><th className="pb-3">Status</th><th className="pb-3">Last updated</th><th className="pb-3" /></tr></thead><tbody>{filtered.map((item) => { const draft = drafts[item.product.id] ?? { sellingPrice: String(item.sellingPrice), foodPackagingCost: String(item.foodPackagingCost), isActive: item.product.isActive }; const dirty = draft.sellingPrice !== String(item.product.basePrice) || draft.foodPackagingCost !== String(item.product.foodPackagingCost ?? item.product.costSummary?.totalCost ?? 0) || draft.isActive !== item.product.isActive; return <tr key={item.product.id} className="border-b border-pocket-navy/5"><td className="py-3 font-bold text-pocket-navy">{item.product.name}</td><td className="py-3 text-pocket-navy/65">{item.product.category.name}</td><td className="py-3"><Input className="h-9 w-32" type="number" min="0" value={draft.sellingPrice} onChange={(event) => updateDraft(item.product.id, { sellingPrice: event.target.value })} /></td><td className="py-3"><Input className="h-9 w-40" type="number" min="0" value={draft.foodPackagingCost} onChange={(event) => updateDraft(item.product.id, { foodPackagingCost: event.target.value })} /></td><td className="py-3"><button type="button" onClick={() => updateDraft(item.product.id, { isActive: !draft.isActive })} className={`relative h-6 w-11 rounded-full ${draft.isActive ? "bg-pocket-orange" : "bg-pocket-navy/20"}`} aria-label={`${draft.isActive ? "Deactivate" : "Activate"} ${item.product.name}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${draft.isActive ? "left-6" : "left-1"}`} /></button></td><td className="py-3 text-xs text-pocket-navy/60">{formatUpdatedAt(item.product.costSettingsUpdatedAt)}</td><td className="py-3 text-right"><Button size="sm" variant={dirty ? "default" : "outline"} onClick={() => void saveProduct(item.product)} disabled={!dirty || savingId === item.product.id}><Save className="mr-1 h-3.5 w-3.5" />{savingId === item.product.id ? "Saving" : "Save"}</Button></td></tr>; })}</tbody></table></div>
    </BISection>
    <div className="grid gap-6 xl:grid-cols-2"><BISection title="Top 10 products" description="Quantity sold in the selected period."><BIBarList entries={[...filtered].sort((a, b) => b.units - a.units).slice(0, 10).map((item) => ({ label: item.product.name, value: item.units, detail: formatCompactCurrency(item.revenue) }))} formatValue={(value) => `${value} units`} /></BISection><BISection title="Revenue by product" description="Revenue calculated from the current selling price settings."><BIBarList entries={[...filtered].sort((a, b) => b.revenue - a.revenue).slice(0, 10).map((item) => ({ label: item.product.name, value: item.revenue, detail: `${item.grossMargin.toFixed(1)}% margin` }))} formatValue={formatCompactCurrency} tone="navy" /></BISection></div>
    <BISection title="Product performance" description="Revenue = selling price × quantity sold. Food cost and profit recalculate as soon as the edited settings change."><div className="mb-4 flex flex-wrap gap-2">{(["revenue", "profit", "units", "margin"] as const).map((option) => <Button key={option} type="button" size="sm" variant={sort === option ? "default" : "outline"} onClick={() => setSort(option)}>Sort {option === "units" ? "quantity sold" : option === "margin" ? "gross margin" : option}</Button>)}</div>{loading ? <p className="text-sm text-pocket-navy/60">Loading product sales...</p> : <div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-left text-sm"><thead className="border-b border-pocket-navy/10 text-xs uppercase tracking-[0.12em] text-pocket-navy/50"><tr><th className="pb-3">Product name</th><th className="pb-3">Category</th><th className="pb-3">Selling price</th><th className="pb-3">Food &amp; packaging cost</th><th className="pb-3">Quantity sold</th><th className="pb-3">Revenue generated</th><th className="pb-3">Total food cost</th><th className="pb-3">Gross profit</th><th className="pb-3">Gross margin %</th></tr></thead><tbody>{sorted.map((item) => <tr key={item.product.id} className={`border-b border-pocket-navy/5 ${topTen.has(item.product.id) ? "bg-emerald-50/70" : bottomTen.has(item.product.id) ? "bg-red-50/60" : ""}`}><td className="py-3 font-bold text-pocket-navy">{item.product.name}<span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-pocket-navy/45">{topTen.has(item.product.id) ? "Top 10" : bottomTen.has(item.product.id) ? "Bottom 10" : ""}</span></td><td className="py-3 text-pocket-navy/65">{item.product.category.name}</td><td className="py-3 text-pocket-navy/70">{formatCurrency(item.sellingPrice)}</td><td className="py-3 text-pocket-navy/70">{formatCurrency(item.foodPackagingCost)}</td><td className="py-3 text-pocket-navy/70">{item.units}</td><td className="py-3 font-semibold text-pocket-navy">{formatCurrency(item.revenue)}</td><td className="py-3 text-pocket-navy/70">{formatCurrency(item.totalFoodCost)}</td><td className={`py-3 font-semibold ${item.grossProfit >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatCurrency(item.grossProfit)}</td><td className="py-3 font-semibold text-pocket-orange">{item.grossMargin.toFixed(1)}%</td></tr>)}</tbody><tfoot className="border-t-2 border-pocket-navy/15 text-sm font-black text-pocket-navy"><tr><td className="pt-4" colSpan={2}>Filtered totals</td><td className="pt-4">—</td><td className="pt-4">—</td><td className="pt-4">{totals.units}</td><td className="pt-4">{formatCurrency(totals.revenue)}</td><td className="pt-4">{formatCurrency(totals.foodCost)}</td><td className="pt-4">{formatCurrency(totals.profit)}</td><td className="pt-4">{totals.revenue ? `${((totals.profit / totals.revenue) * 100).toFixed(1)}%` : "0.0%"}</td></tr></tfoot></table></div>}</BISection>
  </div>;
}
