"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bike, CircleDollarSign } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { BIBarList, BILine, BISection } from "@/components/admin/bi-primitives";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchAdminDashboard } from "@/lib/admin-client";
import { estimateFoodpandaPayout, getFoodpandaRevenueFromBreakdowns } from "@/lib/finance";
import type { AdminRangePreset, DashboardData } from "@/lib/types";
import { formatCompactCurrency, formatCompactNumber, getCurrentBusinessDateKey, toPakistanDateIso } from "@/lib/utils";

const periods: Array<{ value: AdminRangePreset; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "month", label: "This Month" },
  { value: "year", label: "This Year" },
  { value: "custom", label: "Custom" }
];

function formatPakistanDateTime(value: string) {
  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Karachi"
  }).format(new Date(value));
}

function Metric({ label, value, helper }: { label: string; value: string; helper: string }) {
  return <Card className="min-w-0 p-5"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-pocket-orange">{label}</p><p className="mt-3 min-w-0 whitespace-nowrap text-[clamp(0.8rem,0.95vw,1.05rem)] font-black leading-tight text-pocket-navy">{value}</p><p className="mt-1 break-words text-sm text-pocket-navy/60">{helper}</p></Card>;
}

export default function FoodpandaAnalyticsPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [overallDashboard, setOverallDashboard] = useState<DashboardData | null>(null);
  const [period, setPeriod] = useState<AdminRangePreset>("month");
  const [customStart, setCustomStart] = useState(getCurrentBusinessDateKey());
  const [customEnd, setCustomEnd] = useState(getCurrentBusinessDateKey());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (period === "custom" && (!customStart || !customEnd)) return;

    let cancelled = false;
    setLoading(true);
    setError("");
    const range = {
      preset: period,
      ...(period === "custom" ? { start: toPakistanDateIso(customStart), end: toPakistanDateIso(customEnd, true) } : {})
    };

    Promise.all([
      fetchAdminDashboard({ ...range, segment: "all" }),
      fetchAdminDashboard({ ...range, segment: "foodpanda" })
    ])
      .then(([all, foodpanda]) => {
        if (cancelled) return;
        setOverallDashboard(all);
        setDashboard({ ...foodpanda, breakdowns: all.breakdowns });
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Failed to load Foodpanda analytics.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [customEnd, customStart, period]);

  const gross = useMemo(() => getFoodpandaRevenueFromBreakdowns(dashboard?.breakdowns.serviceTypes ?? []), [dashboard]);
  const payout = estimateFoodpandaPayout(gross);
  const commission = gross - payout.estimated;
  const commissionPercent = gross ? (commission / gross) * 100 : 0;

  const selectedRange = dashboard ? `${formatPakistanDateTime(dashboard.range.start)} – ${formatPakistanDateTime(dashboard.range.end)}` : "Select a date range";

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 md:px-6">
      <AdminShell title="Foodpanda Analytics" description="See how much Foodpanda contributes to sales, and what the commission costs the business.">
        <div className="rounded-2xl border border-pocket-navy/10 bg-white p-4 shadow-panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-pocket-cream text-pocket-orange"><Bike className="h-5 w-5" /></div><div><p className="font-bold text-pocket-navy">Platform performance</p><p className="text-sm text-pocket-navy/60">Foodpanda commission is fixed at 38%; retained payout is 62%.</p></div></div>
            <Link href="/admin/analytics"><Button variant="outline">Business Analytics<ArrowRight className="h-4 w-4" /></Button></Link>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {periods.map((option) => <Button key={option.value} type="button" variant={period === option.value ? "default" : "outline"} size="sm" onClick={() => setPeriod(option.value)}>{option.label}</Button>)}
          </div>
          {period === "custom" ? <div className="mt-3 grid max-w-xl gap-3 sm:grid-cols-2"><label className="text-xs font-semibold uppercase tracking-wide text-pocket-navy/60">From<Input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} className="mt-1" /></label><label className="text-xs font-semibold uppercase tracking-wide text-pocket-navy/60">To<Input type="date" value={customEnd} min={customStart || undefined} onChange={(event) => setCustomEnd(event.target.value)} className="mt-1" /></label></div> : null}
          <p className="mt-3 text-sm text-pocket-navy/60">Foodpanda revenue shown for Pakistan time: <span className="font-semibold text-pocket-navy">{selectedRange}</span></p>
        </div>
        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
        {loading || !dashboard ? <Card className="p-6 text-sm text-pocket-navy/60">Loading Foodpanda analytics...</Card> : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-7">
              <Metric label="Gross revenue" value={formatCompactCurrency(gross)} helper="Foodpanda order value" />
              <Metric label="Orders" value={formatCompactNumber(dashboard.summary.orders)} helper="Platform orders" />
              <Metric label="Commission" value={formatCompactCurrency(commission)} helper="Estimated platform share" />
              <Metric label="Net received" value={formatCompactCurrency(payout.estimated)} helper="Expected payout" />
              <Metric label="Average order" value={formatCompactCurrency(dashboard.summary.averageOrderValue)} helper="Foodpanda AOV" />
              <Metric label="Commission %" value={`${commissionPercent.toFixed(1)}%`} helper="Estimated" />
              <Metric label="Profit after commission" value={formatCompactCurrency(payout.estimated)} helper="Before food and operating costs" />
            </div>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]"><BISection title="Foodpanda trend" description="Gross platform revenue by day."><BILine entries={dashboard.series.map((entry) => ({ label: entry.label, value: entry.revenue }))} formatValue={formatCompactCurrency} /></BISection><BISection title="Revenue lost to commission" description="Fixed 38% Foodpanda commission in the selected period."><div className="rounded-2xl bg-pocket-cream p-5"><CircleDollarSign className="h-6 w-6 text-pocket-orange" /><p className="mt-4 whitespace-nowrap text-lg font-black leading-tight text-pocket-navy sm:text-xl">{formatCompactCurrency(commission)}</p><p className="mt-1 text-sm text-pocket-navy/60">Platform commission deducted from gross sales.</p></div></BISection></div>
            <div className="grid gap-6 xl:grid-cols-2"><BISection title="Foodpanda vs Inshop" description="Revenue comparison across the two primary service types."><BIBarList entries={(dashboard.breakdowns.serviceTypes ?? []).map((entry) => ({ label: entry.label, value: entry.revenue, detail: `${entry.count} orders` }))} formatValue={formatCompactCurrency} tone="navy" /></BISection><BISection title="Top Foodpanda products" description="Products with the highest unit volume on the platform."><BIBarList entries={dashboard.topProducts.map((entry) => ({ label: entry.productName, value: entry.quantity, detail: formatCompactCurrency(entry.revenue) }))} formatValue={(value) => `${value} units`} /></BISection></div>
            <BISection title="Platform readout" description="A quick operating interpretation for this period."><div className="grid gap-4 md:grid-cols-3"><div className="rounded-2xl border border-pocket-navy/10 p-4"><p className="text-sm font-bold text-pocket-navy">Contribution</p><p className="mt-2 text-2xl font-black text-pocket-orange">{gross && overallDashboard?.summary.revenue ? ((gross / overallDashboard.summary.revenue) * 100).toFixed(1) : "0.0"}%</p><p className="mt-1 text-sm text-pocket-navy/60">of total revenue came through Foodpanda.</p></div><div className="min-w-0 rounded-2xl border border-pocket-navy/10 p-4"><p className="text-sm font-bold text-pocket-navy">Retained payout</p><p className="mt-2 whitespace-nowrap text-sm font-black leading-tight text-pocket-navy sm:text-base">{formatCompactCurrency(payout.estimated)}</p><p className="mt-1 text-sm text-pocket-navy/60">62% retained after the fixed 38% commission.</p></div><div className="rounded-2xl border border-pocket-navy/10 p-4"><p className="text-sm font-bold text-pocket-navy">Decision</p><p className="mt-2 text-2xl font-black text-emerald-700">Track margin</p><p className="mt-1 text-sm text-pocket-navy/60">Compare product margin after commission before pushing volume.</p></div></div></BISection>
          </>
        )}
      </AdminShell>
    </div>
  );
}
