"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Download, RefreshCcw, Save } from "lucide-react";
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
type ProductDraft = { foodPackagingCost: string; isActive: boolean };
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
type MealAnalytics = {
  totalMeals: number;
  products: Array<{ name: string; units: number }>;
  components: Array<{ name: string; units: number }>;
  combinations: Array<{ name: string; meals: number }>;
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

function isMealProduct(product: AdminProduct) {
  return product.category.slug === "make-it-a-meal" || product.slug.includes("make-it-a-meal");
}

function resolveComponentProductName(componentName: string, products: AdminProduct[]) {
  const normalized = componentName.trim().toLowerCase();
  const exact = products.find((product) => product.name.trim().toLowerCase() === normalized);
  if (exact) return exact.name;
  if (normalized === "fries") return products.find((product) => product.slug === "thela-fries")?.name;
  if (normalized.endsWith(" shake")) {
    const shakeName = normalized.replace(/ shake$/, "");
    return products.find((product) => product.name.trim().toLowerCase() === shakeName)?.name;
  }
  return undefined;
}

function readMealComponents(item: AdminOrder["items"][number]) {
  if (item.bundleComponents.length) {
    return item.bundleComponents.map((component) => ({ name: component.productName, units: component.quantity }));
  }
  return item.addOns.flatMap((addOn) => addOn.optionName.split(/\s*\+\s*/).map((name) => ({ name: name.trim(), units: item.quantity })));
}

function aggregateOrders(products: AdminProduct[], orders: AdminOrder[], drafts: Record<string, ProductDraft>) {
  const unitsByName = new Map<string, number>();
  const mealComponents = new Map<string, number>();
  const mealCombinations = new Map<string, number>();
  const mealProducts = new Map<string, number>();
  let totalMeals = 0;
  const productByName = new Map(products.map((product) => [product.name.trim().toLowerCase(), product]));

  function addUnits(productName: string, units: number) {
    const resolvedName = resolveComponentProductName(productName, products) ?? productName;
    const key = resolvedName.trim().toLowerCase();
    unitsByName.set(key, (unitsByName.get(key) ?? 0) + units);
  }

  for (const order of orders) {
    if (["CANCELLED", "REFUNDED"].includes(order.status)) continue;
    for (const item of order.items) {
      const product = productByName.get(item.productName.trim().toLowerCase());
      if (product && isMealProduct(product)) {
        totalMeals += item.quantity;
        mealProducts.set(item.productName, (mealProducts.get(item.productName) ?? 0) + item.quantity);
        const components = readMealComponents(item);
        const combinationName = components.map((component) => component.name).join(" + ") || "No component details recorded";
        mealCombinations.set(combinationName, (mealCombinations.get(combinationName) ?? 0) + item.quantity);
        for (const component of components) {
          mealComponents.set(component.name, (mealComponents.get(component.name) ?? 0) + component.units);
          addUnits(component.name, component.units);
        }
      } else {
        addUnits(item.productName, Number(item.quantity) || 0);
      }
    }
  }

  const metrics = products.filter((product) => !isMealProduct(product)).map((product) => {
    const draft = drafts[product.id];
    const sellingPrice = product.basePrice;
    const foodPackagingCost = Number(draft?.foodPackagingCost ?? product.foodPackagingCost ?? product.costSummary?.totalCost ?? 0) || 0;
    const units = unitsByName.get(product.name.trim().toLowerCase()) ?? 0;
    const revenue = sellingPrice * units;
    const totalFoodCost = foodPackagingCost * units;
    const grossProfit = revenue - totalFoodCost;
    return { product, sellingPrice, foodPackagingCost, units, revenue, totalFoodCost, grossProfit, grossMargin: revenue ? (grossProfit / revenue) * 100 : 0 } satisfies ProductMetric;
  });
  return {
    metrics,
    meals: {
      totalMeals,
      products: Array.from(mealProducts, ([name, units]) => ({ name, units })).sort((a, b) => b.units - a.units),
      components: Array.from(mealComponents, ([name, units]) => ({ name, units })).sort((a, b) => b.units - a.units),
      combinations: Array.from(mealCombinations, ([name, meals]) => ({ name, meals })).sort((a, b) => b.meals - a.meals)
    } satisfies MealAnalytics
  };
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
  const [costSettingsOpen, setCostSettingsOpen] = useState(false);

  useEffect(() => {
    void fetchAdminProducts().then((data) => {
      setProducts(data.products);
      setDrafts((current) => Object.fromEntries(data.products.map((product) => [product.id, current[product.id] ?? {
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

  const categories = useMemo(() => Array.from(new Set(products.filter((product) => !isMealProduct(product)).map((product) => product.category.name))).sort(), [products]);
  const analytics = useMemo(() => aggregateOrders(products, orders, drafts), [drafts, orders, products]);
  const metrics = analytics.metrics;
  const mealAnalytics = analytics.meals;
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
        foodPackagingCost: current[productId]?.foodPackagingCost ?? "0",
        isActive: current[productId]?.isActive ?? true,
        ...patch
      }
    }));
  }

  async function saveProduct(product: AdminProduct) {
    const draft = drafts[product.id];
    if (!draft || !draft.foodPackagingCost.trim() || Number.isNaN(Number(draft.foodPackagingCost))) {
      setError("Food and packaging cost must be a valid number.");
      return;
    }
    setSavingId(product.id);
    setError("");
    try {
      const updated = await updateAdminProductCostSettings(product.id, {
        foodPackagingCost: Number(draft.foodPackagingCost),
        isActive: draft.isActive
      });
      setProducts((current) => current.map((item) => item.id === product.id ? {
        ...item,
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
    <div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Product intelligence</p><p className="mt-1 text-sm text-pocket-navy/60">Selling prices come from Products. Cost overrides and meal components are reflected in the analysis below.</p></div>
    <Card className="p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2">{periods.map((option) => <Button key={option.value} type="button" variant={period === option.value ? "default" : "outline"} size="sm" onClick={() => setPeriod(option.value)}>{option.label}</Button>)}</div><div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setRefreshKey((current) => current + 1)} disabled={loading}><RefreshCcw className="mr-2 h-4 w-4" />Refresh</Button><Button type="button" size="sm" onClick={() => void exportAnalytics()} disabled={exporting || (period === "custom" && (!customStart || !customEnd))}><Download className="mr-2 h-4 w-4" />{exporting ? "Exporting..." : "Export to Excel"}</Button></div></div>{period === "custom" ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><Input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /><Input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></div> : null}</Card>
    <Card className="p-4"><div className="grid gap-3 md:grid-cols-[1fr_220px]"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product name" /><select value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 rounded-md border border-pocket-navy/20 bg-white px-3 text-sm text-pocket-navy"><option value="all">All categories</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>{error ? <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}</Card>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7"><SummaryCard label="Total revenue" value={formatCompactCurrency(totals.revenue)} /><SummaryCard label="Total food cost" value={formatCompactCurrency(totals.foodCost)} /><SummaryCard label="Gross profit" value={formatCompactCurrency(totals.profit)} /><SummaryCard label="Overall margin" value={totals.revenue ? `${((totals.profit / totals.revenue) * 100).toFixed(1)}%` : "0.0%"} /><SummaryCard label="Best selling" value={bestSelling?.product.name ?? "—"} helper={bestSelling ? `${bestSelling.units} units` : "No sales"} /><SummaryCard label="Highest profit" value={highestProfit?.product.name ?? "—"} helper={highestProfit ? formatCompactCurrency(highestProfit.grossProfit) : "No sales"} /><SummaryCard label="Products" value={String(filtered.length)} helper="Excludes meal bundles" /></div>
    <Card className="overflow-hidden"><button type="button" onClick={() => setCostSettingsOpen((current) => !current)} className="flex w-full items-center justify-between gap-4 p-5 text-left hover:bg-pocket-cream/30"><span><span className="block text-xl font-black text-pocket-navy">Product cost settings</span><span className="mt-1 block text-sm text-pocket-navy/60">Selling prices are read from Products. Edit only food and packaging cost here.</span></span><ChevronDown className={`h-5 w-5 text-pocket-navy transition-transform ${costSettingsOpen ? "rotate-180" : ""}`} /></button>{costSettingsOpen ? <div className="border-t border-pocket-navy/10 p-5"><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="border-b border-pocket-navy/10 text-xs uppercase tracking-[0.12em] text-pocket-navy/50"><tr><th className="pb-3">Product name</th><th className="pb-3">Category</th><th className="pb-3">Selling price</th><th className="pb-3">Food &amp; packaging cost</th><th className="pb-3">Status</th><th className="pb-3">Last updated</th><th className="pb-3" /></tr></thead><tbody>{filtered.map((item) => { const draft = drafts[item.product.id] ?? { foodPackagingCost: String(item.foodPackagingCost), isActive: item.product.isActive }; const savedCost = String(item.product.foodPackagingCost ?? item.product.costSummary?.totalCost ?? 0); const dirty = draft.foodPackagingCost !== savedCost || draft.isActive !== item.product.isActive; return <tr key={item.product.id} className="border-b border-pocket-navy/5"><td className="py-3 font-bold text-pocket-navy">{item.product.name}</td><td className="py-3 text-pocket-navy/65">{item.product.category.name}</td><td className="py-3 font-semibold text-pocket-navy">{formatCurrency(item.sellingPrice)}</td><td className="py-3"><Input className="h-9 w-40" type="number" min="0" value={draft.foodPackagingCost} onChange={(event) => updateDraft(item.product.id, { foodPackagingCost: event.target.value })} /></td><td className="py-3"><button type="button" onClick={() => updateDraft(item.product.id, { isActive: !draft.isActive })} className={`relative h-6 w-11 rounded-full ${draft.isActive ? "bg-pocket-orange" : "bg-pocket-navy/20"}`} aria-label={`${draft.isActive ? "Deactivate" : "Activate"} ${item.product.name}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${draft.isActive ? "left-6" : "left-1"}`} /></button></td><td className="py-3 text-xs text-pocket-navy/60">{formatUpdatedAt(item.product.costSettingsUpdatedAt)}</td><td className="py-3 text-right"><Button size="sm" variant={dirty ? "default" : "outline"} onClick={() => void saveProduct(item.product)} disabled={!dirty || savingId === item.product.id}><Save className="mr-1 h-3.5 w-3.5" />{savingId === item.product.id ? "Saving" : "Save"}</Button></td></tr>; })}</tbody></table></div></div> : null}</Card>
    <div className="grid gap-6 xl:grid-cols-2"><BISection title="Top 10 products" description="Quantity sold, including items selected inside meals."><BIBarList entries={[...filtered].sort((a, b) => b.units - a.units).slice(0, 10).map((item) => ({ label: item.product.name, value: item.units, detail: formatCompactCurrency(item.revenue) }))} formatValue={(value) => `${value} units`} /></BISection><BISection title="Revenue by product" description="Revenue calculated from current catalog prices."><BIBarList entries={[...filtered].sort((a, b) => b.revenue - a.revenue).slice(0, 10).map((item) => ({ label: item.product.name, value: item.revenue, detail: `${item.grossMargin.toFixed(1)}% margin` }))} formatValue={formatCompactCurrency} tone="navy" /></BISection></div>
    <BISection title="Make It A Meal breakdown" description="Meal bundles are excluded as products and their recorded selections are counted here and added to the matching item totals."><div className="grid gap-4 lg:grid-cols-3"><div><Card className="bg-pocket-cream p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-pocket-orange">Meal bundles sold</p><p className="mt-2 text-3xl font-black text-pocket-navy">{mealAnalytics.totalMeals}</p><p className="mt-1 text-xs text-pocket-navy/60">Selected period</p></Card><h3 className="mb-2 mt-4 font-black text-pocket-navy">Meal products</h3>{mealAnalytics.products.length ? <div className="space-y-2">{mealAnalytics.products.map((meal) => <div key={meal.name} className="flex justify-between gap-3 border-b border-pocket-navy/10 pb-2 text-sm"><span className="text-pocket-navy/70">{meal.name}</span><span className="font-bold text-pocket-navy">{meal.units}</span></div>)}</div> : <p className="text-sm text-pocket-navy/60">No meals sold in this period.</p>}</div><div><h3 className="mb-2 font-black text-pocket-navy">Components included</h3>{mealAnalytics.components.length ? <div className="space-y-2">{mealAnalytics.components.map((component) => <div key={component.name} className="flex justify-between gap-3 border-b border-pocket-navy/10 pb-2 text-sm"><span className="text-pocket-navy/70">{component.name}</span><span className="font-bold text-pocket-navy">{component.units}</span></div>)}</div> : <p className="text-sm text-pocket-navy/60">No meal component data in this period.</p>}</div><div><h3 className="mb-2 font-black text-pocket-navy">Meal combinations</h3>{mealAnalytics.combinations.length ? <div className="space-y-2">{mealAnalytics.combinations.map((combination) => <div key={combination.name} className="flex justify-between gap-3 border-b border-pocket-navy/10 pb-2 text-sm"><span className="text-pocket-navy/70">{combination.name}</span><span className="font-bold text-pocket-navy">{combination.meals}</span></div>)}</div> : <p className="text-sm text-pocket-navy/60">No meal combinations recorded.</p>}</div></div></BISection>
    <BISection title="Product performance" description="Meal products are excluded. Their selected fries, drinks, shakes, and chillers are included in the matching product quantities above."><div className="mb-4 flex flex-wrap gap-2">{(["revenue", "profit", "units", "margin"] as const).map((option) => <Button key={option} type="button" size="sm" variant={sort === option ? "default" : "outline"} onClick={() => setSort(option)}>Sort {option === "units" ? "quantity sold" : option === "margin" ? "gross margin" : option}</Button>)}</div>{loading ? <p className="text-sm text-pocket-navy/60">Loading product sales...</p> : <div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-left text-sm"><thead className="border-b border-pocket-navy/10 text-xs uppercase tracking-[0.12em] text-pocket-navy/50"><tr><th className="pb-3">Product name</th><th className="pb-3">Category</th><th className="pb-3">Selling price</th><th className="pb-3">Food &amp; packaging cost</th><th className="pb-3">Quantity sold</th><th className="pb-3">Revenue generated</th><th className="pb-3">Total food cost</th><th className="pb-3">Gross profit</th><th className="pb-3">Gross margin %</th></tr></thead><tbody>{sorted.map((item) => <tr key={item.product.id} className={`border-b border-pocket-navy/5 ${topTen.has(item.product.id) ? "bg-emerald-50/70" : bottomTen.has(item.product.id) ? "bg-red-50/60" : ""}`}><td className="py-3 font-bold text-pocket-navy">{item.product.name}<span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-pocket-navy/45">{topTen.has(item.product.id) ? "Top 10" : bottomTen.has(item.product.id) ? "Bottom 10" : ""}</span></td><td className="py-3 text-pocket-navy/65">{item.product.category.name}</td><td className="py-3 text-pocket-navy/70">{formatCurrency(item.sellingPrice)}</td><td className="py-3 text-pocket-navy/70">{formatCurrency(item.foodPackagingCost)}</td><td className="py-3 text-pocket-navy/70">{item.units}</td><td className="py-3 font-semibold text-pocket-navy">{formatCurrency(item.revenue)}</td><td className="py-3 text-pocket-navy/70">{formatCurrency(item.totalFoodCost)}</td><td className={`py-3 font-semibold ${item.grossProfit >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatCurrency(item.grossProfit)}</td><td className="py-3 font-semibold text-pocket-orange">{item.grossMargin.toFixed(1)}%</td></tr>)}</tbody><tfoot className="border-t-2 border-pocket-navy/15 text-sm font-black text-pocket-navy"><tr><td className="pt-4" colSpan={2}>Filtered totals</td><td className="pt-4">—</td><td className="pt-4">—</td><td className="pt-4">{totals.units}</td><td className="pt-4">{formatCurrency(totals.revenue)}</td><td className="pt-4">{formatCurrency(totals.foodCost)}</td><td className="pt-4">{formatCurrency(totals.profit)}</td><td className="pt-4">{totals.revenue ? `${((totals.profit / totals.revenue) * 100).toFixed(1)}%` : "0.0%"}</td></tr></tfoot></table></div>}</BISection>
  </div>;
}
