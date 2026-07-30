"use client";

import { useEffect, useMemo, useState } from "react";
import { BIBarList, BISection, FutureMetric } from "@/components/admin/bi-primitives";
import { Card } from "@/components/ui/card";
import { fetchAdminInventory } from "@/lib/admin-client";
import type { AdminInventoryData } from "@/lib/types";
import { formatCompactCurrency, formatCompactNumber } from "@/lib/utils";

function InventoryKpi({ label, value, helper }: { label: string; value: string; helper: string }) {
  return <Card className="p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-pocket-orange">{label}</p><p className="mt-2 text-xl font-black text-pocket-navy">{value}</p><p className="mt-1 text-xs text-pocket-navy/60">{helper}</p></Card>;
}

export function InventoryAnalytics() {
  const [data, setData] = useState<AdminInventoryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchAdminInventory().then(setData).finally(() => setLoading(false)); }, []);

  const usage = useMemo(() => {
    const map = new Map<string, number>();
    for (const transaction of data?.recentTransactions ?? []) {
      if (transaction.quantity < 0 || transaction.type === "WASTAGE") map.set(transaction.ingredientName, (map.get(transaction.ingredientName) ?? 0) + Math.abs(transaction.quantity));
    }
    return Array.from(map, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [data]);

  if (loading) return <Card className="p-5 text-sm text-pocket-navy/60">Loading inventory analytics...</Card>;
  if (!data) return null;

  return <div className="space-y-6"><div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Inventory intelligence</p><p className="mt-1 text-sm text-pocket-navy/60">Stock value, availability, movement, and usage signals from live inventory records.</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7"><InventoryKpi label="Inventory value" value={formatCompactCurrency(data.summary.totalStockValue)} helper={`${formatCompactNumber(data.summary.totalItems)} tracked items`} /><InventoryKpi label="Low stock" value={formatCompactNumber(data.summary.lowStockItems)} helper="Needs review" /><InventoryKpi label="Out of stock" value={formatCompactNumber(data.items.filter((item) => item.quantityOnHand <= 0).length)} helper="No units on hand" /><InventoryKpi label="Stock units" value={formatCompactNumber(data.summary.totalUnits)} helper="Across branches" /><InventoryKpi label="Waste cost" value={formatCompactCurrency(data.summary.wastageCostToday ?? 0)} helper="Today" /><FutureMetric label="Inventory turnover" description="Needs a stable consumption window." /><FutureMetric label="This month usage" description="Needs normalized sales-to-recipe depletion." /></div><div className="grid gap-6 xl:grid-cols-2"><BISection title="Ingredient usage" description="Recent negative movements and wastage, grouped by ingredient."><BIBarList entries={usage} formatValue={(value) => `${value.toFixed(2)} units`} /></BISection><BISection title="Days remaining" description="Reorder context using current stock and configured reorder levels."><BIBarList entries={data.items.slice(0, 10).map((item) => ({ label: item.name, value: item.quantityOnHand, detail: `${item.reorderLevel} reorder` }))} formatValue={(value) => `${value} ${data.items.find((item) => item.quantityOnHand === value)?.unit ?? "units"}`} tone="navy" /></BISection></div></div>;
}
